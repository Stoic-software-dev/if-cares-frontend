// One-shot, idempotent import of the current GAS/Sheets data into the v2 DB.
// Read-only against GAS (GET endpoints the app itself uses). Re-runs converge:
// upserts on natural keys (Site.name, Student.id, [siteId, date]).
//
//   node scripts/import-from-gas.mjs [--dry-run] [--only=sites|students|meals] [--snapshot]
//
// GAS remains the source of truth until cutover; local edits may be overwritten.

import { mkdir, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { isoInstantToYmd, ymdToUtcDate } from '../src/lib/dates.js';

try {
  process.loadEnvFile();
} catch {
  // .env optional
}

const GAS = process.env.GAS_BASE_URL;
if (!GAS) {
  console.error('GAS_BASE_URL is not set.');
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const SNAPSHOT = args.has('--snapshot');
const only = [...args].find((a) => a.startsWith('--only='))?.split('=')[1] || null;

const ACTIVE_SY = process.env.IMPORT_ACTIVE_SY || '2025/2026';
const SY_PREFIX_RE = /^(\d{4})\/(\d{4})\s/;

const prisma = new PrismaClient();
const warnings = [];
const warn = (msg) => {
  warnings.push(msg);
  console.warn(`  ⚠ ${msg}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gasGet(type, params = {}) {
  const qs = new URLSearchParams({ type, ...params }).toString();
  const url = `${GAS}?${qs}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const text = await res.text();
      const data = JSON.parse(text); // GAS returns HTML error pages on failure
      await sleep(400); // throttle
      return data;
    } catch (error) {
      if (attempt === 3) throw new Error(`GAS ${type} failed after 3 attempts: ${error.message}`);
      await sleep(1500 * attempt);
    }
  }
  return null;
}

async function snapshot(name, data) {
  if (!SNAPSHOT) return;
  await mkdir('import-snapshots', { recursive: true });
  await writeFile(`import-snapshots/${name}.json`, JSON.stringify(data, null, 2), 'utf8');
}

const cleanName = (s) => String(s ?? '').trim().replace(/\s{2,}/g, ' ');

function cleanAge(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 120) return null;
  return n;
}

function cleanBirthdate(value) {
  if (!value) return null;
  const ymd = isoInstantToYmd(String(value));
  if (!ymd) return null;
  const year = Number(ymd.slice(0, 4));
  const now = new Date().getUTCFullYear();
  if (year < 1990 || year > now) {
    warn(`birthdate out of range (${value}) — stored as null`);
    return null;
  }
  return ymdToUtcDate(ymd);
}

async function importSites() {
  console.log('▸ Importing sites…');
  const raw = await gasGet('sites');
  await snapshot('sites', raw);

  const seen = new Set();
  let activeCount = 0;
  const anyMatchesActiveSy = raw.some((s) => cleanName(s.name).startsWith(ACTIVE_SY));
  if (!anyMatchesActiveSy) {
    warn(`no site name starts with IMPORT_ACTIVE_SY="${ACTIVE_SY}" — year-prefixed sites will all be inactive; check the env value`);
  }

  for (const row of raw) {
    const name = cleanName(row.name);
    if (!name || seen.has(name)) {
      if (name) warn(`duplicate site name skipped: ${name}`);
      continue;
    }
    seen.add(name);

    // Year-prefixed sites are active only for the configured school year;
    // non-prefixed sites stay active by default.
    const hasSyPrefix = SY_PREFIX_RE.test(name);
    const active = hasSyPrefix ? name.startsWith(ACTIVE_SY) : true;
    if (active) activeCount++;

    if (!DRY) {
      await prisma.site.upsert({
        where: { name },
        create: { name, active, legacySpreadsheetId: row.spreadsheetId || null },
        update: { active, legacySpreadsheetId: row.spreadsheetId || null },
      });
    }
  }
  console.log(`  sites: ${seen.size} imported, ${activeCount} active`);

  if (only !== 'sites') {
    const activeSites = DRY ? [] : await prisma.site.findMany({ where: { active: true } });
    for (const site of activeSites) {
      const data = await gasGet('siteData', { site: site.name });
      if (!data || typeof data !== 'object') {
        warn(`siteData missing for ${site.name}`);
        continue;
      }
      await prisma.site.update({
        where: { id: site.id },
        data: {
          ceName: String(data.name ?? ''),
          ceId: String(data.ceId ?? ''),
          siteName: String(data.siteName ?? ''),
          siteNumber: String(data.siteNumber ?? ''),
        },
      });
    }
    if (!DRY) console.log(`  CE details filled for ${activeSites.length} active sites`);
  }
}

async function importStudents() {
  console.log('▸ Importing students…');
  const raw = await gasGet('students');
  await snapshot('students', raw);

  const sites = await prisma.site.findMany();
  const siteByName = new Map(sites.map((s) => [s.name, s]));

  // Roster numbers per active site, exactly as GAS reports them today.
  const numberById = new Map();
  const maxNumberBySite = new Map();
  for (const site of sites.filter((s) => s.active)) {
    const roster = await gasGet('studentData', { site: site.name });
    if (!Array.isArray(roster)) {
      warn(`studentData missing for ${site.name}`);
      continue;
    }
    await snapshot(`studentData-${site.id}`, roster);
    const used = new Set();
    for (const row of roster) {
      const num = Number(row.number);
      if (!row.id || !Number.isInteger(num)) continue;
      if (used.has(num)) {
        warn(`${site.name}: duplicate roster number ${num} (id ${row.id}) — will renumber`);
        continue;
      }
      used.add(num);
      numberById.set(String(row.id), num);
      maxNumberBySite.set(site.id, Math.max(maxNumberBySite.get(site.id) ?? 0, num));
    }
  }

  const seenNamesBySite = new Map(); // siteId -> Set(lowercased names)
  const usedNumbersBySite = new Map(); // siteId -> Set(numbers)
  let imported = 0;
  let skipped = 0;

  const nextNumber = (siteId) => {
    const next = (maxNumberBySite.get(siteId) ?? 0) + 1;
    maxNumberBySite.set(siteId, next);
    return next;
  };

  for (const row of raw) {
    const id = String(row.id ?? '').trim() ? String(row.id) : null;
    const name = cleanName(row.name); // keeps "0 " / "0PK " prefixes verbatim
    const siteName = cleanName(row.site);
    const site = siteByName.get(siteName);

    if (!id || !name) {
      warn(`student skipped (missing id or name): ${JSON.stringify(row).slice(0, 120)}`);
      skipped++;
      continue;
    }
    if (!site) {
      warn(`student "${name}" skipped — unknown site "${siteName}"`);
      skipped++;
      continue;
    }

    if (!seenNamesBySite.has(site.id)) seenNamesBySite.set(site.id, new Set());
    const nameKey = name.toLowerCase();
    if (seenNamesBySite.get(site.id).has(nameKey)) {
      warn(`${site.name}: duplicate student name "${name}" — first occurrence kept (id ${id} skipped)`);
      skipped++;
      continue;
    }
    seenNamesBySite.get(site.id).add(nameKey);

    if (!usedNumbersBySite.has(site.id)) usedNumbersBySite.set(site.id, new Set());
    let number = numberById.get(id);
    if (!Number.isInteger(number) || usedNumbersBySite.get(site.id).has(number)) {
      number = nextNumber(site.id);
      while (usedNumbersBySite.get(site.id).has(number)) number = nextNumber(site.id);
    }
    usedNumbersBySite.get(site.id).add(number);

    if (!DRY) {
      await prisma.student.upsert({
        where: { id },
        create: {
          id, // GAS id preserved verbatim — keys localStorage drafts
          name,
          number,
          age: cleanAge(row.age),
          birthdate: cleanBirthdate(row.birthdate),
          siteId: site.id,
        },
        update: {
          name,
          number,
          age: cleanAge(row.age),
          birthdate: cleanBirthdate(row.birthdate),
          siteId: site.id,
        },
      });
    }
    imported++;
  }
  console.log(`  students: ${imported} imported, ${skipped} skipped`);
}

async function importMeals() {
  console.log('▸ Importing service calendar + submitted dates…');
  const raw = await gasGet('allMeals');
  await snapshot('allMeals', raw);

  const sites = await prisma.site.findMany();
  const siteByName = new Map(sites.map((s) => [s.name, s]));

  let serviceDays = 0;
  let stubs = 0;

  for (const [siteName, data] of Object.entries(raw)) {
    const site = siteByName.get(cleanName(siteName));
    if (!site) {
      warn(`allMeals: unknown site "${siteName}" skipped`);
      continue;
    }

    const validDates = data?.validDates && typeof data.validDates === 'object' ? data.validDates : {};
    const excludedDates = Array.isArray(data?.excludedDates) ? data.excludedDates : [];

    for (const [ymd, flags] of Object.entries(validDates)) {
      const date = ymdToUtcDate(ymd);
      if (!date) {
        warn(`${siteName}: invalid validDate "${ymd}"`);
        continue;
      }
      if (!DRY) {
        await prisma.serviceDay.upsert({
          where: { siteId_date: { siteId: site.id, date } },
          create: {
            siteId: site.id,
            date,
            brk: !!flags?.brk,
            lunch: !!flags?.lunch,
            snk: !!flags?.snk,
            sup: !!flags?.sup,
          },
          update: { brk: !!flags?.brk, lunch: !!flags?.lunch, snk: !!flags?.snk, sup: !!flags?.sup },
        });
      }
      serviceDays++;
    }

    const excluded = [];
    for (const ymdRaw of excludedDates) {
      const date = ymdToUtcDate(String(ymdRaw));
      if (!date) {
        warn(`${siteName}: invalid excludedDate "${ymdRaw}"`);
        continue;
      }
      excluded.push({ date });
    }

    if (!DRY && excluded.length) {
      // Excluded (= already submitted) dates need a ServiceDay slot AND a stub
      // MealCount so `validDates = ServiceDay − MealCount` never resurrects them
      // as selectable. Real per-student history replaces stubs in Phase 2.
      await prisma.serviceDay.createMany({
        data: excluded.map((e) => ({ siteId: site.id, date: e.date })),
        skipDuplicates: true,
      });
      await prisma.mealCount.createMany({
        data: excluded.map((e) => ({
          siteId: site.id,
          date: e.date,
          source: 'GAS_IMPORT',
          submittedByEmail: 'gas-import',
        })),
        skipDuplicates: true,
      });
    }
    stubs += excluded.length;
  }
  console.log(`  service days upserted: ${serviceDays}, submitted-date stubs: ${stubs}`);
}

async function main() {
  console.log(`Import from GAS ${DRY ? '(DRY RUN) ' : ''}— active SY: ${ACTIVE_SY}`);
  if (!only || only === 'sites') await importSites();
  if (!only || only === 'students') await importStudents();
  if (!only || only === 'meals') await importMeals();

  console.log(`\nDone. ${warnings.length} warning(s).`);
  if (warnings.length) {
    console.log('Warnings recap:');
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

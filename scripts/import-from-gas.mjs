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
    // non-prefixed sites stay active by default. "Copy of …" sheets are manual
    // backups living in the same Drive folder — never active, and their rosters
    // share student ids with the original sheet.
    const hasSyPrefix = SY_PREFIX_RE.test(name);
    const isCopy = /^copy of /i.test(name);
    const active = isCopy ? false : hasSyPrefix ? name.startsWith(ACTIVE_SY) : true;
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

  // The master Students tab aggregates every sheet in the Drive folder, so
  // "Copy of …" backups and renamed sheets pollute it (and share student ids
  // with the original sheet). Membership of ACTIVE sites therefore comes from
  // each site's own roster (studentData); the master only contributes
  // birthdates and the membership of inactive sites.
  const masterById = new Map();
  for (const row of raw) {
    const id = String(row.id ?? '').trim();
    if (id && !masterById.has(id)) masterById.set(id, row);
  }

  const sites = await prisma.site.findMany();
  const siteByName = new Map(sites.map((s) => [s.name, s]));
  let imported = 0;
  let skipped = 0;
  let deactivated = 0;
  let masterOnly = 0;

  // Canonical (current-year prefixed) sites claim their roster ids first.
  const activeSites = sites
    .filter((s) => s.active)
    .sort(
      (a, b) =>
        Number(b.name.startsWith(ACTIVE_SY)) - Number(a.name.startsWith(ACTIVE_SY)) ||
        a.name.localeCompare(b.name)
    );
  const claimedBy = new Map(); // student id -> site name

  for (const site of activeSites) {
    const roster = await gasGet('studentData', { site: site.name });
    if (!Array.isArray(roster)) {
      warn(`studentData missing for ${site.name}`);
      continue;
    }
    await snapshot(`studentData-${site.id}`, roster);

    const seenNames = new Set();
    const rosterIds = [];

    for (const row of roster) {
      const id = String(row.id ?? '').trim() ? String(row.id) : null;
      const name = cleanName(row.name); // keeps "ZZ " / "0PK " prefixes verbatim
      const number = Number(row.number);
      if (!id || !name || !Number.isInteger(number)) {
        warn(`${site.name}: roster row skipped (bad id/name/number): ${JSON.stringify(row).slice(0, 120)}`);
        skipped++;
        continue;
      }
      if (claimedBy.has(id)) {
        warn(`${site.name}: id ${id} ("${name}") already claimed by "${claimedBy.get(id)}" — kept there`);
        skipped++;
        continue;
      }
      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) {
        warn(`${site.name}: duplicate student name "${name}" — first occurrence kept (id ${id} skipped)`);
        skipped++;
        continue;
      }
      seenNames.add(nameKey);
      claimedBy.set(id, site.name);
      rosterIds.push(id);

      if (!DRY) {
        const master = masterById.get(id);
        const data = {
          name,
          number,
          age: cleanAge(row.age),
          birthdate: cleanBirthdate(master?.birthdate),
          siteId: site.id,
          active: true,
        };
        await prisma.student.upsert({
          where: { id }, // GAS id preserved verbatim — keys localStorage drafts
          create: { id, ...data },
          update: data,
        });
      }
      imported++;
    }

    // Students that dropped off the site roster are withdrawals: keep the row
    // (history entries link to it) but take it out of the working roster.
    if (!DRY && rosterIds.length) {
      const res = await prisma.student.updateMany({
        where: { siteId: site.id, active: true, id: { notIn: rosterIds } },
        data: { active: false },
      });
      deactivated += res.count;
    }
  }

  // Inactive sites: master rows are the only membership source. Ids already
  // claimed by an active roster stay where they are (copies never steal).
  const seenNamesBySite = new Map();
  const nextNumberBySite = new Map();
  for (const row of raw) {
    const id = String(row.id ?? '').trim() ? String(row.id) : null;
    const name = cleanName(row.name);
    const siteName = cleanName(row.site);

    if (!id || !name) {
      warn(`student skipped (missing id or name): ${JSON.stringify(row).slice(0, 120)}`);
      skipped++;
      continue;
    }
    if (claimedBy.has(id)) continue; // active roster (or earlier master row) won
    const site = siteByName.get(siteName);
    if (!site) {
      warn(`student "${name}" skipped — unknown site "${siteName}"`);
      skipped++;
      continue;
    }
    if (site.active) {
      // Master row an active site's roster does not list: stale aggregate data.
      masterOnly++;
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
    claimedBy.set(id, site.name);

    const number = (nextNumberBySite.get(site.id) ?? 0) + 1;
    nextNumberBySite.set(site.id, number);

    if (!DRY) {
      await prisma.student.upsert({
        where: { id },
        create: {
          id,
          name,
          number,
          age: cleanAge(row.age),
          birthdate: cleanBirthdate(row.birthdate),
          siteId: site.id,
        },
        update: {
          name,
          age: cleanAge(row.age),
          birthdate: cleanBirthdate(row.birthdate),
          siteId: site.id,
        },
      });
    }
    imported++;
  }

  console.log(
    `  students: ${imported} imported, ${skipped} skipped, ${deactivated} deactivated, ` +
      `${masterOnly} stale master rows ignored`
  );
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

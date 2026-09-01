// Imports the per-student meal-count HISTORY from the legacy system, using the
// one-time `exportHistory` endpoint added to the Apps Script (see
// gas-backup/migration-export.gs). Every response is snapshotted to
// migration-data/history/<site>.json so re-runs can work offline.
//
//   node scripts/import-history.mjs --parse-only            # fetch+parse, no DB
//   node scripts/import-history.mjs                         # import all active sites
//   node scripts/import-history.mjs --site="2025/2026 TX BGC COOKE"
//   node scripts/import-history.mjs --from-snapshots        # offline, from saved JSON
//   node scripts/import-history.mjs --resume                # snapshot if saved, else fetch
//
// Rules:
// - Tab names (M/D/YYYY) are the authoritative dates — never timezone math.
// - An existing APP-sourced MealCount is never touched.
// - GAS_IMPORT stubs are completed in place (times + entries); missing counts
//   are created as GAS_IMPORT. Entries are replaced wholesale (idempotent).

import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { toCanonicalTime } from '../src/lib/dates.js';

try {
  process.loadEnvFile();
} catch {
  // .env optional
}

const args = process.argv.slice(2);
const PARSE_ONLY = args.includes('--parse-only');
const FROM_SNAPSHOTS = args.includes('--from-snapshots');
const RESUME = args.includes('--resume');
const ONLY_SITE = args.find((a) => a.startsWith('--site='))?.slice('--site='.length).replace(/^"|"$/g, '');

const GAS = process.env.GAS_BASE_URL;
const KEY = process.env.GAS_EXPORT_KEY;
const SNAP_DIR = 'migration-data/history';

const warnings = [];
const warn = (msg) => {
  warnings.push(msg);
  console.warn(`  ⚠ ${msg}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sanitize = (name) => name.replace(/[\\/:*?"<>|]/g, '_');

function tabNameToYmd(tabName) {
  const name = tabName.trim();
  const slashed = name.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashed) return `${slashed[3]}-${slashed[1].padStart(2, '0')}-${slashed[2].padStart(2, '0')}`;
  const compact = name.match(/^(\d{2})(\d{2})(\d{4})$/); // MMDDYYYY
  if (compact) return `${compact[3]}-${compact[1]}-${compact[2]}`;
  return null;
}

async function gasExportGet(params) {
  const url = `${GAS}?${new URLSearchParams({ type: 'exportHistory', key: KEY, ...params })}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`non-JSON response: ${text.replace(/\s+/g, ' ').slice(0, 80)}`);
      }
      if (data.result !== 'success') throw new Error(data.message || 'export failed');
      await sleep(500);
      return data;
    } catch (error) {
      if (attempt === 3) throw error;
      await sleep(2000 * attempt);
    }
  }
  return null;
}

function tabMonthKey(tabName) {
  const ymd = tabNameToYmd(tabName);
  return ymd ? `${Number(ymd.slice(5, 7))}/${ymd.slice(0, 4)}` : null;
}

// GAS caps one execution at ~6 minutes and a full-year site exceeds it, so:
// list the dated tabs first, then pull the data one month at a time.
async function fetchSiteHistory(siteName) {
  let listing;
  try {
    listing = await gasExportGet({ site: siteName, list: '1' });
  } catch (error) {
    throw new Error(`exportHistory listing failed for "${siteName}": ${error.message}`);
  }
  const months = [...new Set((listing.tabs || []).map(tabMonthKey).filter(Boolean))];

  const merged = {
    result: 'success',
    site: listing.site,
    spreadsheetId: listing.spreadsheetId,
    dates: {},
  };
  for (const month of months) {
    console.log(`    month ${month} (${months.indexOf(month) + 1}/${months.length})…`);
    let part;
    try {
      part = await gasExportGet({ site: siteName, month });
    } catch (error) {
      throw new Error(`exportHistory failed for "${siteName}" month ${month}: ${error.message}`);
    }
    Object.assign(merged.dates, part.dates || {});
  }
  return merged;
}

function summarizeSite(data) {
  const dates = Object.keys(data.dates || {});
  let entries = 0;
  let mismatches = 0;
  for (const [tab, day] of Object.entries(data.dates || {})) {
    entries += day.students?.length || 0;
    const derived = deriveTotals(day.students || []);
    if (!totalsMatch(derived, day.totalsStandard) && !totalsMatch(derived, day.totalsCooke)) {
      mismatches++;
      warn(`${data.site} ${tab}: derived totals ${JSON.stringify(derived)} match neither template totals set`);
    }
  }
  return { dates: dates.length, entries, mismatches };
}

function deriveTotals(students) {
  const t = { att: 0, brk: 0, lunch: 0, snk: 0, sup: 0 };
  for (const s of students) {
    if (s.att) t.att++;
    if (s.brk) t.brk++;
    if (s.lu) t.lunch++;
    if (s.snk) t.snk++;
    if (s.sup) t.sup++;
  }
  return t;
}

function totalsMatch(derived, template) {
  if (!template) return false;
  return (
    derived.att === Number(template.att || 0) &&
    derived.brk === Number(template.brk || 0) &&
    derived.lunch === Number(template.lunch || 0) &&
    derived.snk === Number(template.snk || 0) &&
    derived.sup === Number(template.sup || 0)
  );
}

async function importSite(prisma, site, data) {
  const students = await prisma.student.findMany({
    where: { siteId: site.id },
    select: { id: true, name: true },
  });
  const byName = new Map(students.map((s) => [s.name.trim().toLowerCase(), s.id]));

  let createdCounts = 0;
  let completedStubs = 0;
  let skippedApp = 0;
  let entryRows = 0;

  for (const [tabName, day] of Object.entries(data.dates || {})) {
    const ymd = tabNameToYmd(tabName);
    if (!ymd) {
      warn(`${site.name}: invalid tab name "${tabName}" skipped`);
      continue;
    }
    const date = new Date(`${ymd}T00:00:00.000Z`);
    const rows = (day.students || []).map((s, i) => ({
      number: i + 1,
      name: String(s.name),
      age: s.age === '' || s.age === null || s.age === undefined ? null : Number(s.age),
      attendance: !!s.att,
      breakfast: !!s.brk,
      lunch: !!s.lu,
      snack: !!s.snk,
      supper: !!s.sup,
      studentId: byName.get(String(s.name).trim().toLowerCase()) ?? null,
    }));

    const timeIn = toCanonicalTime(day.timeIn) || '';
    const timeOut = toCanonicalTime(day.timeOut) || '';

    await prisma.$transaction(async (tx) => {
      await tx.serviceDay.createMany({
        data: [{ siteId: site.id, date }],
        skipDuplicates: true,
      });

      // One ACTIVE count per site and date: the unique index is partial
      // (WHERE voidedAt IS NULL), which Prisma cannot express, so there is no
      // siteId_date compound to look up. A voided count is not in the way of a
      // new one, which is the point of voiding.
      const existing = await tx.mealCount.findFirst({
        where: { siteId: site.id, date, voidedAt: null },
        select: { id: true, source: true },
      });

      if (existing && existing.source === 'APP') {
        skippedApp++;
        return; // post-cutover data always wins
      }

      let countId;
      if (existing) {
        await tx.mealCount.update({
          where: { id: existing.id },
          data: { timeIn, timeOut, submittedByEmail: 'gas-import' },
        });
        countId = existing.id;
        completedStubs++;
      } else {
        const created = await tx.mealCount.create({
          data: {
            siteId: site.id,
            date,
            timeIn,
            timeOut,
            source: 'GAS_IMPORT',
            submittedByEmail: 'gas-import',
          },
        });
        countId = created.id;
        createdCounts++;
      }

      await tx.mealCountEntry.deleteMany({ where: { mealCountId: countId } });
      if (rows.length) {
        await tx.mealCountEntry.createMany({
          data: rows.map((r) => ({ ...r, mealCountId: countId })),
        });
        entryRows += rows.length;
      }
    });
  }

  return { createdCounts, completedStubs, skippedApp, entryRows };
}

async function main() {
  await mkdir(SNAP_DIR, { recursive: true });

  // Which sites?
  let siteList = [];
  let prisma = null;

  if (!PARSE_ONLY) {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
  }

  if (FROM_SNAPSHOTS) {
    const files = (await readdir(SNAP_DIR)).filter((f) => f.endsWith('.json'));
    siteList = files.map((f) => ({ snapshotFile: `${SNAP_DIR}/${f}` }));
    if (!siteList.length) {
      console.error(`No snapshots in ${SNAP_DIR}. Run without --from-snapshots first.`);
      process.exit(1);
    }
  } else {
    if (!GAS || !KEY) {
      console.error('GAS_BASE_URL and GAS_EXPORT_KEY must be set (see gas-backup/migration-export.gs).');
      process.exit(1);
    }
    if (ONLY_SITE) {
      siteList = [{ name: ONLY_SITE }];
    } else if (prisma) {
      const sites = await prisma.site.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
      siteList = sites.map((s) => ({ name: s.name }));
    } else {
      console.error('--parse-only needs --site="NAME" (or use --from-snapshots).');
      process.exit(1);
    }
  }

  const grandTotal = { sites: 0, dates: 0, entries: 0, created: 0, completed: 0, skipped: 0 };

  for (const item of siteList) {
    let data;
    if (item.snapshotFile) {
      data = JSON.parse(await readFile(item.snapshotFile, 'utf8'));
    } else if (RESUME && existsSync(`${SNAP_DIR}/${sanitize(item.name)}.json`)) {
      console.log(`▸ ${item.name} — from snapshot (resume)`);
      data = JSON.parse(await readFile(`${SNAP_DIR}/${sanitize(item.name)}.json`, 'utf8'));
    } else {
      console.log(`▸ ${item.name} — fetching…`);
      data = await fetchSiteHistory(item.name);
      await writeFile(`${SNAP_DIR}/${sanitize(item.name)}.json`, JSON.stringify(data), 'utf8');
    }

    const summary = summarizeSite(data);
    console.log(`  ${data.site}: ${summary.dates} dated tabs, ${summary.entries} student rows, ${summary.mismatches} totals mismatches`);
    grandTotal.sites++;
    grandTotal.dates += summary.dates;
    grandTotal.entries += summary.entries;

    if (!PARSE_ONLY && prisma) {
      const site = await prisma.site.findUnique({ where: { name: data.site } });
      if (!site) {
        warn(`site "${data.site}" not in DB — import skipped`);
        continue;
      }
      const res = await importSite(prisma, site, data);
      console.log(`    → counts created: ${res.createdCounts}, stubs completed: ${res.completedStubs}, APP skipped: ${res.skippedApp}, entries: ${res.entryRows}`);
      grandTotal.created += res.createdCounts;
      grandTotal.completed += res.completedStubs;
      grandTotal.skipped += res.skippedApp;
    }
  }

  if (prisma) await prisma.$disconnect();

  console.log(`\nTOTAL: ${grandTotal.sites} sites, ${grandTotal.dates} dates, ${grandTotal.entries} student rows` +
    (PARSE_ONLY ? ' (parse only)' : `, ${grandTotal.created} counts created, ${grandTotal.completed} stubs completed, ${grandTotal.skipped} APP skipped`));
  console.log(`${warnings.length} warning(s).`);
  for (const w of warnings.slice(0, 40)) console.log(`  - ${w}`);
  if (warnings.length > 40) console.log(`  … and ${warnings.length - 40} more`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

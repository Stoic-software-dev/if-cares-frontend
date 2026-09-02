// Reconciliation report for STOIC-2198: site x month, spreadsheets vs database.
//
// `db:parity` compares the catalogues - sites, students, roster numbers - which
// says the migration pointed at the right things. It says nothing about whether
// the history actually arrived. This does: for every site and every month it
// adds up what the legacy spreadsheet held and what the database holds now, and
// prints the difference.
//
// The numbers compared are the ones a claim is built from (attendance and each
// meal type), because a reconciliation that matches on row counts but not on
// meal totals would pass while the money was wrong.
//
// Source of truth is `migration-data/history/<site>.json`, the snapshots the
// import wrote from the one-time GAS export endpoint. Reconciling against those
// rather than re-fetching keeps this offline, repeatable, and immune to the
// Apps Script answering an error page one time in three.
//
//   node scripts/reconcile-history.mjs                # every site
//   node scripts/reconcile-history.mjs --site="2025/2026 TX BGC COOKE"
//   node scripts/reconcile-history.mjs --json         # machine readable
//   node scripts/reconcile-history.mjs --verbose      # every month, not just the bad ones
//
// Exits 1 when anything does not reconcile, so it can gate the cutover.

import { readdir, readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

const SNAP_DIR = 'migration-data/history';
const args = process.argv.slice(2);
const onlySite = args.find((a) => a.startsWith('--site='))?.slice('--site='.length);
const asJson = args.includes('--json');
const verbose = args.includes('--verbose');

const prisma = new PrismaClient();
const out = (line) => { if (!asJson) console.log(line); };

function tabNameToYmd(tabName) {
  const name = String(tabName).trim();
  const slashed = name.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashed) return `${slashed[3]}-${slashed[1].padStart(2, '0')}-${slashed[2].padStart(2, '0')}`;
  const compact = name.match(/^(\d{2})(\d{2})(\d{4})$/); // MMDDYYYY
  if (compact) return `${compact[3]}-${compact[1]}-${compact[2]}`;
  return null;
}

const emptyTotals = () => ({ days: 0, rows: 0, att: 0, brk: 0, lunch: 0, snk: 0, sup: 0 });

function addLegacyDay(bucket, day) {
  bucket.days += 1;
  for (const s of day.students ?? []) {
    bucket.rows += 1;
    if (s.att) bucket.att += 1;
    if (s.brk) bucket.brk += 1;
    if (s.lu) bucket.lunch += 1;
    if (s.snk) bucket.snk += 1;
    if (s.sup) bucket.sup += 1;
  }
}

/** What the spreadsheets held, keyed `YYYY-MM`. */
async function legacyByMonth(snapshot) {
  const months = new Map();
  const skippedTabs = [];
  for (const [tabName, day] of Object.entries(snapshot.dates ?? {})) {
    const ymd = tabNameToYmd(tabName);
    if (!ymd) {
      skippedTabs.push(tabName);
      continue;
    }
    const key = ymd.slice(0, 7);
    if (!months.has(key)) months.set(key, emptyTotals());
    addLegacyDay(months.get(key), day);
  }
  return { months, skippedTabs };
}

/**
 * What the database holds, keyed `YYYY-MM`.
 *
 * Only GAS_IMPORT rows are counted. A count filed through the new app after the
 * import is not missing from the spreadsheet - it never was there - and a
 * voided row is deliberately out of every report. Both are reported separately
 * instead of being folded in, because either one silently inflating the diff is
 * how a clean reconciliation gets ignored.
 */
async function dbByMonth(siteId) {
  const counts = await prisma.mealCount.findMany({
    where: { siteId },
    select: {
      date: true,
      source: true,
      voidedAt: true,
      entries: {
        select: { attendance: true, breakfast: true, lunch: true, snack: true, supper: true },
      },
    },
  });

  const months = new Map();
  let appRows = 0;
  let voidedRows = 0;

  for (const count of counts) {
    if (count.voidedAt) { voidedRows += 1; continue; }
    if (count.source === 'APP') { appRows += 1; continue; }

    const key = count.date.toISOString().slice(0, 7);
    if (!months.has(key)) months.set(key, emptyTotals());
    const bucket = months.get(key);
    bucket.days += 1;
    for (const e of count.entries) {
      bucket.rows += 1;
      if (e.attendance) bucket.att += 1;
      if (e.breakfast) bucket.brk += 1;
      if (e.lunch) bucket.lunch += 1;
      if (e.snack) bucket.snk += 1;
      if (e.supper) bucket.sup += 1;
    }
  }
  return { months, appRows, voidedRows };
}

const FIELDS = ['days', 'rows', 'att', 'brk', 'lunch', 'snk', 'sup'];

function diffOf(legacy, db) {
  const l = legacy ?? emptyTotals();
  const d = db ?? emptyTotals();
  const delta = {};
  let any = false;
  for (const f of FIELDS) {
    delta[f] = (d[f] ?? 0) - (l[f] ?? 0);
    if (delta[f] !== 0) any = true;
  }
  return any ? delta : null;
}

const files = (await readdir(SNAP_DIR)).filter((f) => f.endsWith('.json'));
if (!files.length) {
  console.error(`No snapshots in ${SNAP_DIR}. Run import-history first.`);
  process.exit(1);
}

const report = [];
let sitesWithDiffs = 0;
let sitesMissing = 0;

for (const file of files.sort()) {
  const snapshot = JSON.parse(await readFile(`${SNAP_DIR}/${file}`, 'utf8'));
  const siteName = snapshot.site;
  if (onlySite && siteName !== onlySite) continue;

  const site = await prisma.site.findUnique({ where: { name: siteName }, select: { id: true } });
  if (!site) {
    sitesMissing += 1;
    report.push({ site: siteName, error: 'site not in the database' });
    out(`MISSING  ${siteName} - snapshot exists but the site is not in the database`);
    continue;
  }

  const { months: legacy, skippedTabs } = await legacyByMonth(snapshot);
  const { months: db, appRows, voidedRows } = await dbByMonth(site.id);

  const allMonths = [...new Set([...legacy.keys(), ...db.keys()])].sort();
  const monthDiffs = [];
  for (const month of allMonths) {
    const delta = diffOf(legacy.get(month), db.get(month));
    if (delta) monthDiffs.push({ month, delta, legacy: legacy.get(month) ?? emptyTotals(), db: db.get(month) ?? emptyTotals() });
  }

  const totals = { legacy: emptyTotals(), db: emptyTotals() };
  for (const b of legacy.values()) for (const f of FIELDS) totals.legacy[f] += b[f];
  for (const b of db.values()) for (const f of FIELDS) totals.db[f] += b[f];

  const entry = {
    site: siteName,
    months: allMonths.length,
    legacy: totals.legacy,
    db: totals.db,
    reconciled: monthDiffs.length === 0,
    monthDiffs,
    appRows,
    voidedRows,
    skippedTabs,
  };
  report.push(entry);

  if (monthDiffs.length) {
    sitesWithDiffs += 1;
    out(`DIFF     ${siteName}`);
    for (const d of monthDiffs) {
      const parts = FIELDS.filter((f) => d.delta[f] !== 0)
        .map((f) => `${f} ${d.delta[f] > 0 ? '+' : ''}${d.delta[f]} (sheet ${d.legacy[f]}, db ${d.db[f]})`);
      out(`           ${d.month}: ${parts.join(', ')}`);
    }
  } else {
    out(`OK       ${siteName}  ${allMonths.length} months, ${totals.legacy.days} days, ${totals.legacy.rows} rows`);
    if (verbose) {
      for (const month of allMonths) {
        const b = legacy.get(month) ?? emptyTotals();
        out(`           ${month}: ${b.days}d ${b.rows}r  att ${b.att} brk ${b.brk} lun ${b.lunch} snk ${b.snk} sup ${b.sup}`);
      }
    }
  }
  if (skippedTabs.length) out(`           note: ${skippedTabs.length} tab(s) with an unparseable name: ${skippedTabs.slice(0, 3).join(', ')}`);
  if (appRows) out(`           note: ${appRows} count(s) filed in the app after the import, not expected in the sheet`);
  if (voidedRows) out(`           note: ${voidedRows} voided count(s), deliberately out of every report`);
}

const grand = { legacy: emptyTotals(), db: emptyTotals() };
for (const r of report) {
  if (r.error) continue;
  for (const f of FIELDS) { grand.legacy[f] += r.legacy[f]; grand.db[f] += r.db[f]; }
}

if (asJson) {
  console.log(JSON.stringify({ grand, sitesWithDiffs, sitesMissing, sites: report }, null, 2));
} else {
  out('');
  out(`${report.length - sitesMissing} site(s) reconciled, ${sitesWithDiffs} with differences, ${sitesMissing} not in the database`);
  out(`sheets: ${grand.legacy.days} days, ${grand.legacy.rows} rows, att ${grand.legacy.att}, brk ${grand.legacy.brk}, lunch ${grand.legacy.lunch}, snk ${grand.legacy.snk}, sup ${grand.legacy.sup}`);
  out(`db:     ${grand.db.days} days, ${grand.db.rows} rows, att ${grand.db.att}, brk ${grand.db.brk}, lunch ${grand.db.lunch}, snk ${grand.db.snk}, sup ${grand.db.sup}`);
}

await prisma.$disconnect();
process.exit(sitesWithDiffs || sitesMissing ? 1 : 0);

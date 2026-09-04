import { prisma } from '@/lib/db';
import { dateToYmd, ymdToUtcDate } from '@/lib/dates';

// The numbers behind every report, in one place. The consolidated claim is the
// document IF Cares is reimbursed on, so what counts and what does not is
// decided here once rather than in each PDF builder:
//
//   - voided counts never count,
//   - a corrected count contributes its corrected values, which is what the
//     entries hold after a correction,
//   - a site with no counts in the period still appears, with zeros, because a
//     missing row reads as an oversight rather than as a month with no service.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthLabel(year, month) {
  return `${MONTHS[month - 1]} ${year}`;
}

export function monthBounds(year, month) {
  const from = ymdToUtcDate(`${year}-${String(month).padStart(2, '0')}-01`);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = ymdToUtcDate(`${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
  return { from, to, lastDay };
}

const emptyTotals = () => ({ att: 0, brk: 0, lun: 0, snk: 0, sup: 0 });

/** The five boxes at the top of the daily form, as the site's record holds them. */
export function siteHeaderOf(site) {
  return {
    ceName: site?.ceName ?? '',
    ceId: site?.ceId ?? '',
    siteName: site?.siteName ?? '',
    siteNumber: site?.siteNumber ?? '',
  };
}

// The contracting entity a claim is filed by. Every site carries its own copy
// of the name, and a few carry it misspelt, so the claim prints the spelling
// most of them agree on; the template's own default stands in when none do.
function ceNameOf(sites) {
  const tally = new Map();
  for (const site of sites) {
    const name = String(site.ceName ?? '').trim();
    if (name) tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  let best = '';
  for (const [name, hits] of tally) if (hits > (tally.get(best) ?? 0)) best = name;
  return best || 'Intrinsic Foundation';
}

function addEntries(totals, entries) {
  for (const entry of entries) {
    if (entry.attendance) totals.att += 1;
    if (entry.breakfast) totals.brk += 1;
    if (entry.lunch) totals.lun += 1;
    if (entry.snack) totals.snk += 1;
    if (entry.supper) totals.sup += 1;
  }
  return totals;
}

/**
 * The sites a claim covers: every active one in the state, plus any that is no
 * longer active but filed a count in the month.
 *
 * Filtering on `active` alone rewrote history. A site that closes in March
 * disappeared from January's and February's claims too, and because a stored
 * claim is rebuilt from the counts, the document came back with fewer sites and
 * smaller totals than the one that was filed and signed.
 */
async function claimSites({ year, month, state, select }) {
  const { from, to } = monthBounds(year, month);
  return prisma.site.findMany({
    where: {
      ...(state ? { state } : {}),
      OR: [
        { active: true },
        { mealCounts: { some: { date: { gte: from, lte: to }, voidedAt: null } } },
      ],
    },
    select,
    orderBy: { name: 'asc' },
  });
}

async function loadCounts({ year, month, siteIds }) {
  const { from, to } = monthBounds(year, month);
  return prisma.mealCount.findMany({
    where: {
      date: { gte: from, lte: to },
      voidedAt: null,
      ...(siteIds ? { siteId: { in: siteIds } } : {}),
    },
    include: {
      entries: true,
      site: { select: { id: true, name: true, siteNumber: true, state: true } },
      // Only whether it was corrected, not the stored previous values: the
      // reports print the current numbers and say that they changed.
      _count: { select: { corrections: true } },
    },
    orderBy: { date: 'asc' },
  });
}

/**
 * The foundation the claim is filed under. The legacy generator read it from
 * the master and refused to build a claim without it (`getFoundationIdByState`);
 * `import-master` brings it in as AppSetting `foundationId.TX` / `.OK`. Only
 * those two states have one, so a claim across every state prints without it
 * rather than printing a wrong one.
 */
async function foundationIdFor(state) {
  const key = `foundationId.${String(state ?? '').toUpperCase()}`;
  if (!state) return '';
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? '';
}

/**
 * Part one of the consolidated claim: one row per site with its month totals.
 * Mirrors what the legacy generator wrote into the template, column for column.
 */
export async function consolidatedBySite({ year, month, state, excludeSites = [] }) {
  const sites = await claimSites({
    year,
    month,
    state,
    select: { id: true, name: true, siteNumber: true, state: true, ceName: true },
  });

  const excluded = new Set(excludeSites);
  const included = sites.filter((site) => !excluded.has(site.name));
  const counts = await loadCounts({ year, month, siteIds: included.map((site) => site.id) });

  const bySite = new Map(included.map((site) => [site.id, { site, totals: emptyTotals(), days: 0 }]));
  for (const count of counts) {
    const row = bySite.get(count.siteId);
    if (!row) continue;
    addEntries(row.totals, count.entries);
    row.days += 1;
  }

  const rows = [...bySite.values()].map((row) => ({
    site: row.site.name,
    siteNumber: row.site.siteNumber,
    days: row.days,
    ...row.totals,
  }));

  const totals = rows.reduce((sum, row) => {
    for (const key of ['att', 'brk', 'lun', 'snk', 'sup']) sum[key] += row[key];
    return sum;
  }, emptyTotals());

  return {
    rows,
    totals,
    period: monthLabel(year, month),
    state: state ?? 'All',
    foundationId: await foundationIdFor(state),
    ceName: ceNameOf(included),
    excluded: [...excluded],
  };
}

/**
 * Part two of the consolidated claim: one row per day of the month with the
 * meals served across every included site.
 */
export async function consolidatedByDay({ year, month, state, excludeSites = [] }) {
  const sites = await claimSites({ year, month, state, select: { id: true, name: true, ceName: true } });
  const excluded = new Set(excludeSites);
  const included = sites.filter((site) => !excluded.has(site.name));
  const counts = await loadCounts({ year, month, siteIds: included.map((site) => site.id) });

  const { lastDay } = monthBounds(year, month);
  const byDay = new Map();
  for (let day = 1; day <= lastDay; day++) byDay.set(day, emptyTotals());

  for (const count of counts) {
    const day = Number(dateToYmd(count.date).slice(8, 10));
    addEntries(byDay.get(day), count.entries);
  }

  const rows = [...byDay.entries()].map(([day, totals]) => ({ day, ...totals }));
  const totals = rows.reduce((sum, row) => {
    for (const key of ['att', 'brk', 'lun', 'snk', 'sup']) sum[key] += row[key];
    return sum;
  }, emptyTotals());

  return {
    rows,
    totals,
    period: monthLabel(year, month),
    state: state ?? 'All',
    foundationId: await foundationIdFor(state),
    ceName: ceNameOf(included),
  };
}

/** Every count a single site filed in a month, for the per site monthly report. */
export async function siteMonth({ site: siteName, year, month }) {
  const site = await prisma.site.findUnique({ where: { name: siteName } });
  if (!site) return null;

  const counts = await loadCounts({ year, month, siteIds: [site.id] });

  const days = counts.map((count) => ({
    date: dateToYmd(count.date),
    timeIn: count.timeIn,
    timeOut: count.timeOut,
    corrected: count._count.corrections > 0,
    students: count.entries.length,
    ...addEntries(emptyTotals(), count.entries),
  }));

  const totals = days.reduce((sum, day) => {
    for (const key of ['att', 'brk', 'lun', 'snk', 'sup']) sum[key] += day[key];
    return sum;
  }, emptyTotals());

  return {
    site: site.name,
    siteNumber: site.siteNumber,
    state: site.state,
    period: monthLabel(year, month),
    year,
    month,
    days,
    totals,
  };
}

/**
 * Every count a site filed in a month, each in the shape the daily form is
 * drawn from, for the monthly bundle. Only the newest correction travels: the
 * form prints when it was last touched and by whom, not the history.
 */
export async function siteMonthCounts({ site: siteName, year, month }) {
  const site = await prisma.site.findUnique({ where: { name: siteName } });
  if (!site) return null;

  const { from, to } = monthBounds(year, month);
  const counts = await prisma.mealCount.findMany({
    where: { siteId: site.id, date: { gte: from, lte: to }, voidedAt: null },
    include: {
      entries: { orderBy: { number: 'asc' } },
      corrections: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true, correctedByEmail: true },
      },
      _count: { select: { corrections: true } },
    },
    orderBy: { date: 'asc' },
  });

  return counts.map((count) => {
    const entries = count.entries.map((entry) => ({
      number: entry.number,
      name: entry.name,
      age: entry.age,
      attendance: entry.attendance,
      breakfast: entry.breakfast,
      lunch: entry.lunch,
      snack: entry.snack,
      supper: entry.supper,
    }));
    const last = count.corrections[0];
    return {
      date: dateToYmd(count.date),
      site: site.name,
      siteHeader: siteHeaderOf(site),
      timeIn: count.timeIn,
      timeOut: count.timeOut,
      signature: count.signature,
      source: count.source,
      submittedBy: count.submittedByEmail,
      corrected: count._count.corrections > 0,
      correctionCount: count._count.corrections,
      corrections: last ? [{ at: last.createdAt.toISOString(), by: last.correctedByEmail }] : [],
      totals: addEntries(emptyTotals(), entries),
      entries,
    };
  });
}

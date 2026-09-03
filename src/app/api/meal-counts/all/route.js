import { prisma } from '@/lib/db';
import { handle, legacyJson } from '@/lib/http';
import { requireUser, visibleSites } from '@/lib/auth';
import { dateToYmd, datesBetween } from '@/lib/dates';
import { applyHolidays, holidayNameFor, loadHolidays } from '@/lib/holidays';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Legacy `?type=allMeals`: RAW object keyed by site name. validDates = service
// days without a submitted count (with per-meal availability flags), and
// excludedDates = dates already submitted. EVERY visible site must be present as
// a key even when empty — the date picker stays disabled otherwise.
export const GET = handle(async () => {
  const session = await requireUser();
  const sites = await visibleSites(session);
  const siteIds = sites.map((s) => s.id);

  const [serviceDays, counts, holidays] = await Promise.all([
    prisma.serviceDay.findMany({ where: { siteId: { in: siteIds } } }),
    // A voided count leaves its day open again, so it must not show as taken.
    prisma.mealCount.findMany({
      where: { siteId: { in: siteIds }, voidedAt: null },
      // `_count.corrections` rather than the rows themselves: the dashboard only
      // needs to know that a day was corrected, and pulling every stored
      // previous value to answer yes or no would be a lot of JSON for a dot.
      select: { siteId: true, date: true, approvedAt: true, _count: { select: { corrections: true } } },
    }),
    loadHolidays(),
  ]);

  const countedBySite = new Map();
  const approvedBySite = new Map();
  const correctedBySite = new Map();
  for (const count of counts) {
    const ymd = dateToYmd(count.date);
    if (!countedBySite.has(count.siteId)) countedBySite.set(count.siteId, new Set());
    countedBySite.get(count.siteId).add(ymd);
    if (count.approvedAt) {
      if (!approvedBySite.has(count.siteId)) approvedBySite.set(count.siteId, new Set());
      approvedBySite.get(count.siteId).add(ymd);
    }
    if (count._count.corrections > 0) {
      if (!correctedBySite.has(count.siteId)) correctedBySite.set(count.siteId, new Set());
      correctedBySite.get(count.siteId).add(ymd);
    }
  }

  const result = {};
  for (const site of sites) {
    // `holidays`, `approvedDates` and `correctedDates` are additive to the
    // legacy shape: old callers ignore them.
    result[site.name] = {
      validDates: {},
      excludedDates: [],
      holidays: {},
      approvedDates: [],
      correctedDates: [],
    };
  }
  const byId = new Map(sites.map((s) => [s.id, s]));

  for (const day of serviceDays) {
    const site = byId.get(day.siteId);
    if (!site) continue;
    const ymd = dateToYmd(day.date);
    // A day that already carries a count stays counted whatever the calendar
    // says afterwards: the meals were served.
    if (countedBySite.get(day.siteId)?.has(ymd)) continue;

    // Holidays are subtracted here rather than deleted from the calendar, so
    // removing one puts the day straight back.
    const { meals, holiday } = applyHolidays(
      { brk: day.brk, lunch: day.lunch, snk: day.snk, sup: day.sup },
      holidays,
      day.siteId,
      ymd
    );
    if (!meals) {
      result[site.name].holidays[ymd] = holiday;
      continue;
    }
    result[site.name].validDates[ymd] = meals;
    if (holiday) result[site.name].holidays[ymd] = holiday;
  }

  // A holiday covers the dates it says it covers, whether or not the site ever
  // had a service day there. Reading only the ServiceDay rows meant a holiday
  // over a weekend, or over a month whose calendar has not been generated yet,
  // simply never appeared - while the holiday's own screen said it did.
  // Expanded ONCE, not once per site. This ran inside the site loop, so a single
  // holiday cost fifty-six full walks of its range and fifty-six copies of the
  // resulting array.
  const holidayDays = holidays.map((holiday) => ({
    holiday,
    ymds: datesBetween(holiday.startDate, holiday.endDate),
  }));

  for (const site of sites) {
    for (const { holiday, ymds } of holidayDays) {
      for (const ymd of ymds) {
        if (!holidayNameFor([holiday], site.id, ymd)) continue;
        // A day that still serves something, or that already carries a count, is
        // not the holiday's to label.
        if (result[site.name].validDates[ymd]) continue;
        if (countedBySite.get(site.id)?.has(ymd)) continue;
        result[site.name].holidays[ymd] ??= holiday.name;
      }
    }
  }

  for (const [siteId, ymds] of countedBySite) {
    const site = byId.get(siteId);
    if (!site) continue;
    result[site.name].excludedDates = [...ymds].sort();
    result[site.name].approvedDates = [...(approvedBySite.get(siteId) ?? [])].sort();
    result[site.name].correctedDates = [...(correctedBySite.get(siteId) ?? [])].sort();
  }

  return legacyJson(result);
});

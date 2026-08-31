import { prisma } from '@/lib/db';
import { dateToYmd } from '@/lib/dates';

// Holidays are subtracted when the calendar is read, never written into it. One
// place decides what that means, so the dashboard, the count form, the admin
// calendar and the reports can never disagree about whether a day is open.

export const MEAL_KEYS = ['brk', 'lunch', 'snk', 'sup'];

/** Every holiday overlapping a date range, with the sites each one covers. */
export async function loadHolidays({ from, to } = {}) {
  const where =
    from && to ? { AND: [{ startDate: { lte: to } }, { endDate: { gte: from } }] } : {};

  const holidays = await prisma.holiday.findMany({
    where,
    include: { sites: { select: { siteId: true } } },
    orderBy: { startDate: 'asc' },
  });

  return holidays.map((holiday) => ({
    id: holiday.id,
    name: holiday.name,
    startDate: dateToYmd(holiday.startDate),
    endDate: dateToYmd(holiday.endDate),
    allSites: holiday.allSites,
    allMeals: holiday.allMeals,
    brk: holiday.brk,
    lunch: holiday.lunch,
    snk: holiday.snk,
    sup: holiday.sup,
    siteIds: holiday.sites.map((entry) => entry.siteId),
  }));
}

function covers(holiday, siteId, ymd) {
  if (ymd < holiday.startDate || ymd > holiday.endDate) return false;
  return holiday.allSites || holiday.siteIds.includes(siteId);
}

/**
 * What a day looks like once the holidays are applied.
 *
 * @returns null when the day is fully closed, otherwise the meals that remain,
 *          plus the name of the holiday that touched it.
 */
export function applyHolidays(meals, holidays, siteId, ymd) {
  let remaining = { ...meals };
  let name = '';

  for (const holiday of holidays) {
    if (!covers(holiday, siteId, ymd)) continue;
    name = name || holiday.name;
    if (holiday.allMeals) return { meals: null, holiday: name };
    for (const key of MEAL_KEYS) {
      if (holiday[key]) remaining[key] = false;
    }
  }

  if (!name) return { meals: remaining, holiday: '' };
  const serves = MEAL_KEYS.some((key) => remaining[key]);
  return { meals: serves ? remaining : null, holiday: name };
}

/** The holiday name for a date at a site, or '' when there is none. */
export function holidayNameFor(holidays, siteId, ymd) {
  for (const holiday of holidays) {
    if (covers(holiday, siteId, ymd)) return holiday.name;
  }
  return '';
}

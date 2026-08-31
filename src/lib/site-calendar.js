import { ymdToUtcDate, dateToYmd } from '@/lib/dates';

// Monday first, matching the calendar screen and the weekly template keys.
export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const EMPTY = { brk: false, lunch: false, snk: false, sup: false };

/** Monday = 0, so the template array and the UI agree on what "the first column" is. */
export function weekdayIndex(date) {
  return (date.getUTCDay() + 6) % 7;
}

/**
 * The service days a site's cycle implies: every date between programStart and
 * programEnd whose weekday serves at least one meal.
 *
 * This is what turns opening a site from two hundred calendar clicks into a
 * form. The result is deliberately plain data so the caller can diff it against
 * what already exists instead of blindly writing.
 */
export function generateServiceDays({ programStart, programEnd, weeklyTemplate }) {
  const start = typeof programStart === 'string' ? ymdToUtcDate(programStart) : programStart;
  const end = typeof programEnd === 'string' ? ymdToUtcDate(programEnd) : programEnd;
  if (!start || !end || start > end) return [];

  const template = weeklyTemplate ?? {};
  const days = [];

  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const meals = { ...EMPTY, ...(template[WEEKDAY_KEYS[weekdayIndex(cursor)]] ?? {}) };
    // A weekday that serves nothing is simply not a service day.
    if (!meals.brk && !meals.lunch && !meals.snk && !meals.sup) continue;
    days.push({ date: dateToYmd(cursor), ...meals });
  }

  return days;
}

/** Normalises whatever the form sent into the shape stored on the site. */
export function normalizeTemplate(template) {
  const clean = {};
  for (const key of WEEKDAY_KEYS) {
    const day = template?.[key];
    if (!day) continue;
    const meals = {
      brk: Boolean(day.brk),
      lunch: Boolean(day.lunch),
      snk: Boolean(day.snk),
      sup: Boolean(day.sup),
    };
    if (meals.brk || meals.lunch || meals.snk || meals.sup) clean[key] = meals;
  }
  return clean;
}

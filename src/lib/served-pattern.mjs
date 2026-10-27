// What a site really serves each weekday, read from its counts. Kept free of
// `@/` imports so the calendar script and the tests can load it.
//
// The ServiceDay meal flags cannot answer this: most imported days carry all
// four as false, because the flags did not survive the legacy export. The
// student rows did.

// Postgres `extract(dow)`: Sunday = 0.
const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MEALS = ['brk', 'lunch', 'snk', 'sup'];

// A weekday seen fewer times than this is an exception, not a habit.
export const MIN_DAYS = 3;

/**
 * Rows: one per weekday, `{ dow, days, brk, lunch, snk, sup }`, where `days` is
 * how many counts the site filed that weekday and each meal is on how many of
 * those it was served to at least one student. A meal enters the template when
 * it was served on more than half of them.
 */
export function patternFromServed(rows, { minDays = MIN_DAYS } = {}) {
  const template = {};
  for (const row of rows || []) {
    const key = DOW_KEYS[row.dow];
    if (!key || row.days < minDays) continue;
    const meals = {};
    let serves = false;
    for (const meal of MEALS) {
      meals[meal] = row[meal] > row.days / 2;
      if (meals[meal]) serves = true;
    }
    if (serves) template[key] = meals;
  }
  return template;
}

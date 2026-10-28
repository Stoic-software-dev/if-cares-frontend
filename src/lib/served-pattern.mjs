// What a site really serves each weekday, read from its counts. Kept free of
// `@/` imports so the calendar script and the tests can load it.
//
// The student rows are the source, not the ServiceDay meal flags: the legacy
// export carried no flags, and the imported days only have them because they
// were filled in from those same rows (mealsServedOn).

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

/**
 * The meals one imported day served, from its student rows (`{ breakfast,
 * lunch, snack, supper }` as stored on MealCountEntry): a meal was served when
 * at least one student got it. The count screen reads the ServiceDay flags to
 * tell "not served that day" from "this child did not get it", so a day left
 * with all four false showed every imported meal as not served.
 */
export function mealsServedOn(entries) {
  const served = { brk: false, lunch: false, snk: false, sup: false };
  for (const entry of entries || []) {
    if (entry.breakfast) served.brk = true;
    if (entry.lunch) served.lunch = true;
    if (entry.snack) served.snk = true;
    if (entry.supper) served.sup = true;
  }
  return served;
}

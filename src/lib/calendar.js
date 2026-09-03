// Month-grid math for the dashboard, driven by the /api/meal-counts/all shape:
// { validDates: { 'YYYY-MM-DD': {brk,lunch,snk,sup} }, excludedDates: ['YYYY-MM-DD'] }.

const PROGRAM_TIMEZONE = 'America/Chicago';

export const MEAL_KEYS = [
  { key: 'brk', label: 'Breakfast', short: 'Brk' },
  { key: 'lunch', label: 'Lunch', short: 'Lun' },
  { key: 'snk', label: 'Snack', short: 'Snk' },
  { key: 'sup', label: 'Supper', short: 'Sup' },
];

const EVERY_MEAL = { brk: true, lunch: true, snk: true, sup: true };

/**
 * Which meals a day may carry, given the meals its calendar names.
 *
 * A day that names no meal at all gets all four rather than none. That is not a
 * nicety: 89% of the service days that came over from the spreadsheets carry all
 * four flags as false, because the flags did not survive the export, and with
 * "none" the count form renders the attendance column alone. Somebody could
 * record who was there and not one meal they ate, and the count would submit
 * looking complete.
 *
 * This lives here, next to nothing that touches a database, because BOTH sides
 * have to agree on it. It began as a rule in the count form, which meant the
 * screen offered lunch alone on a lunch-only day while the API happily accepted
 * a submission claiming breakfast, snack and supper as well - and those three
 * went into the month's totals and into the claim.
 */
export function mealsOrAll(meals) {
  if (!meals) return EVERY_MEAL;
  return Object.values(meals).some(Boolean) ? meals : EVERY_MEAL;
}

/** The meal keys a submission for this day is NOT allowed to claim. */
export function mealsNotServed(meals) {
  const allowed = mealsOrAll(meals);
  return MEAL_KEYS.filter((meal) => !allowed[meal.key]);
}

// The program's calendar day, not the device's: a submission at 11 PM in
// Buenos Aires must still count for the Dallas service day.
export function todayYmd() {
  return ymdInProgramTz(new Date());
}

/** Any instant as the program's calendar day, by the same rule as `todayYmd`. */
export function ymdInProgramTz(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PROGRAM_TIMEZONE }).format(date);
}

function ymdParts(ymd) {
  const [year, month, day] = ymd.split('-').map(Number);
  return { year, month, day };
}

export function ymdOf(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function monthLabel(year, month) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
}

export function monthShortLabel(month) {
  return new Date(Date.UTC(2000, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
}

export function dateLabel(ymd, options = { weekday: 'long', month: 'long', day: 'numeric' }) {
  // A date that is not one produces NaN parts, and `toLocaleDateString` renders
  // those as the literal string "Invalid Date" - which is what /counts/whatever
  // printed as its page heading. Nothing is a better heading than that.
  if (!ymd || !/^(19|20)\d{2}-\d{2}-\d{2}$/.test(ymd)) return '';
  const { year, month, day } = ymdParts(ymd);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    ...options,
    timeZone: 'UTC',
  });
}

// Every month between the site's earliest and latest known date (or just the
// current month when the site has no data yet), oldest first.
export function availableMonths(siteData, today = todayYmd()) {
  const dates = [
    ...Object.keys(siteData?.validDates ?? {}),
    ...(siteData?.excludedDates ?? []),
    today,
  ].sort();

  const first = ymdParts(dates[0]);
  const last = ymdParts(dates[dates.length - 1]);
  const months = [];
  let { year, month } = first;
  while (year < last.year || (year === last.year && month <= last.month)) {
    months.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/**
 * Builds one month of day cells.
 *
 * Statuses: submitted | missing | today | upcoming | holiday | none.
 * `holidays` maps 'YYYY-MM-DD' to a holiday name; a day that already carries a
 * submitted count keeps the submitted status, because history is never
 * rewritten by a later calendar change.
 */
export function buildMonth(year, month, siteData, today = todayYmd(), holidays = {}) {
  const submitted = new Set(siteData?.excludedDates ?? []);
  // Approval rides along on a submitted day rather than being its own status:
  // an approved day is still a submitted day, and turning it into a fifth colour
  // would say the count is somewhere else.
  const approved = new Set(siteData?.approvedDates ?? []);
  // Same reasoning as approval: a corrected day is still a submitted day. It
  // carries a mark, not a colour of its own.
  const corrected = new Set(siteData?.correctedDates ?? []);
  const valid = siteData?.validDates ?? {};
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Monday-first column of the 1st.
  const leadingBlanks = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

  const days = {};
  const stats = { submitted: 0, missing: 0, upcoming: 0, holiday: 0, service: 0 };

  for (let day = 1; day <= daysInMonth; day++) {
    const ymd = ymdOf(year, month, day);
    const holiday = holidays[ymd];
    const meals = valid[ymd];
    let status = 'none';

    // A holiday that only closes some meals leaves the day open for the rest, so
    // meals decide the state and the holiday name is carried along for the cell.
    if (submitted.has(ymd)) status = 'submitted';
    else if (meals) {
      if (ymd < today) status = 'missing';
      else if (ymd === today) status = 'today';
      else status = 'upcoming';
    } else if (holiday) status = 'holiday';

    if (status !== 'none') {
      days[day] = {
        day,
        ymd,
        status,
        meals: meals ?? null,
        holiday: holiday ?? null,
        approved: approved.has(ymd),
        corrected: corrected.has(ymd),
      };
    } else {
      days[day] = { day, ymd, status, meals: null, holiday: null };
    }

    if (status === 'submitted') {
      stats.submitted += 1;
      stats.service += 1;
    } else if (status === 'missing') {
      stats.missing += 1;
      stats.service += 1;
    } else if (status === 'today' || status === 'upcoming') {
      stats.upcoming += 1;
      stats.service += 1;
    } else if (status === 'holiday') {
      stats.holiday += 1;
    }
  }

  return {
    label: monthLabel(year, month),
    year,
    monthNumber: month,
    leadingBlanks,
    daysInMonth,
    days,
    stats,
  };
}

// Meals served on a given day, as short labels, for the day cell and the form.
export function mealsFor(dayMeals) {
  if (!dayMeals) return [];
  return MEAL_KEYS.filter((meal) => dayMeals[meal.key]).map((meal) => meal.short);
}

const mealSignature = (dayMeals) =>
  MEAL_KEYS.filter((meal) => dayMeals?.[meal.key])
    .map((meal) => meal.key)
    .join('+');

/**
 * What this month serves, said once.
 *
 * Almost every site serves the same meals every service day, so printing the
 * same two chips into twenty-two cells spends the whole calendar saying one
 * thing. This finds the shape the month usually has, so the sentence can carry
 * it and the cells can be left to show the day that is different - which is the
 * only day the chips were ever informative about.
 *
 * Returns `null` when there is no usual shape, and then the cells keep their
 * chips: a month where every day differs has nothing to factor out.
 */
export function monthMealPattern(month) {
  const counts = new Map();
  let days = 0;
  for (const day of Object.values(month?.days ?? {})) {
    if (!day.meals) continue;
    const signature = mealSignature(day.meals);
    if (!signature) continue;
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
    days += 1;
  }
  if (days === 0) return null;

  const [signature, hits] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  // Worth factoring out only when it really is what the month does. Below that,
  // a "usually" would be a lie and the chips carry their own weight.
  if (hits / days < 0.7) return null;

  const keys = signature.split('+');
  const labels = MEAL_KEYS.filter((meal) => keys.includes(meal.key)).map((meal) => meal.label);
  return {
    signature,
    labels,
    // "Snack and Supper", "Breakfast, Lunch and Snack".
    text: labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}` : labels[0],
    exceptions: days - hits,
  };
}

/** Does this day serve something other than what the month usually serves? */
export function differsFromPattern(dayMeals, pattern) {
  if (!pattern || !dayMeals) return true;
  return mealSignature(dayMeals) !== pattern.signature;
}

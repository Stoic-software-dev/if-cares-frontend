// Month-grid math for the dashboard, driven by the /api/meal-counts/all shape:
// { validDates: { 'YYYY-MM-DD': {brk,lunch,snk,sup} }, excludedDates: ['YYYY-MM-DD'] }.

const PROGRAM_TIMEZONE = 'America/Chicago';

export const MEAL_KEYS = [
  { key: 'brk', label: 'Breakfast', short: 'Brk' },
  { key: 'lunch', label: 'Lunch', short: 'Lun' },
  { key: 'snk', label: 'Snack', short: 'Snk' },
  { key: 'sup', label: 'Supper', short: 'Sup' },
];

// The program's calendar day, not the device's: a submission at 11 PM in
// Buenos Aires must still count for the Dallas service day.
export function todayYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PROGRAM_TIMEZONE }).format(new Date());
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
  if (!ymd) return '';
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
      days[day] = { day, ymd, status, meals: meals ?? null, holiday: holiday ?? null };
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

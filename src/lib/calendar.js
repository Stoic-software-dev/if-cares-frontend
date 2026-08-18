// Month-grid math for the dashboard, driven by the /api/meal-counts/all shape:
// { validDates: { 'YYYY-MM-DD': {brk,lunch,snk,sup} }, excludedDates: ['YYYY-MM-DD'] }.

const PROGRAM_TIMEZONE = 'America/Chicago';

// The program's calendar day, not the device's: a submission at 11 PM in
// Buenos Aires must still count for the Dallas service day.
export function todayYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PROGRAM_TIMEZONE }).format(new Date());
}

function ymdParts(ymd) {
  const [year, month, day] = ymd.split('-').map(Number);
  return { year, month, day };
}

export function monthLabel(year, month) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
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

// Day statuses: submitted | missing | today | upcoming | none.
export function buildMonth(year, month, siteData, today = todayYmd()) {
  const submitted = new Set(siteData?.excludedDates ?? []);
  const valid = siteData?.validDates ?? {};
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Monday-first column of the 1st.
  const leadingBlanks = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

  const days = {};
  for (let day = 1; day <= daysInMonth; day++) {
    const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (submitted.has(ymd)) days[day] = 'submitted';
    else if (valid[ymd]) {
      if (ymd < today) days[day] = 'missing';
      else if (ymd === today) days[day] = 'today';
      else days[day] = 'upcoming';
    }
  }

  return { label: monthLabel(year, month), year, monthNumber: month, leadingBlanks, daysInMonth, days };
}

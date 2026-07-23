// Single source of truth for calendar-date and time-string conversions.
// Calendar dates (ServiceDay.date, MealCount.date, Student.birthdate) are stored
// as @db.Date under a UTC-midnight convention: 'YYYY-MM-DD' <-> Date('YYYY-MM-DDT00:00:00.000Z').
// Nothing outside this module may do date math on them.

const APP_TZ = () => process.env.APP_TIMEZONE || 'America/Chicago';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(value) {
  return typeof value === 'string' && YMD_RE.test(value);
}

export function ymdToUtcDate(ymd) {
  if (!isYmd(ymd)) return null;
  const date = new Date(`${ymd}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateToYmd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

// Resolves which calendar date an instant (ISO string with offset/Z) falls on
// in the program's timezone. The client submits dayjs.toISOString() taken at its
// local midnight; resolving in APP_TIMEZONE must reproduce the same 'YYYY-MM-DD'
// the client used as its localStorage draft key.
export function isoInstantToYmd(iso, tz = APP_TZ()) {
  if (isYmd(iso)) return iso; // already a plain calendar date
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function todayYmd(tz = APP_TZ()) {
  return isoInstantToYmd(new Date().toISOString(), tz);
}

// "h:mm:ss AM/PM" | "h:mm AM/PM" | "HH:MM:SS" | ISO datetime -> canonical
// zero-padded 24h "HH:MM:SS" (the frontend extracts times with /\d{2}:\d{2}:\d{2}/).
export function toCanonicalTime(value) {
  if (!value) return '';
  const s = String(value).trim();
  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const min = ampm[2];
    const sec = ampm[3] || '00';
    const period = ampm[4] ? ampm[4].toUpperCase() : null;
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    if (h > 23) return '';
    return `${String(h).padStart(2, '0')}:${min}:${sec}`;
  }
  const embedded = s.match(/(\d{2}):(\d{2}):(\d{2})/);
  return embedded ? `${embedded[1]}:${embedded[2]}:${embedded[3]}` : '';
}

// Age in full years as of today in the program timezone.
export function ageFromBirthdate(birthdate, tz = APP_TZ()) {
  const ymd = birthdate instanceof Date ? dateToYmd(birthdate) : String(birthdate);
  if (!isYmd(ymd)) return null;
  const [by, bm, bd] = ymd.split('-').map(Number);
  const [ty, tm, td] = todayYmd(tz).split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

// Which part of the legacy history an import run covers. Kept free of `@/`
// imports so node can load it from the scripts and from the tests.

/** Legacy tab name (M/D/YYYY, or MMDDYYYY from an XLSX export) -> 'YYYY-MM-DD'. */
export function tabNameToYmd(tabName) {
  const name = String(tabName).trim();
  const slashed = name.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashed) return `${slashed[3]}-${slashed[1].padStart(2, '0')}-${slashed[2].padStart(2, '0')}`;
  const compact = name.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compact) return `${compact[3]}-${compact[1]}-${compact[2]}`;
  return null;
}

/**
 * The months to ask the export for, as 'M/YYYY', in the order the tabs list
 * them. With `since`, a month that ends before that date is never fetched: the
 * export is slow (one call per month and site), and a partial run only wants
 * the tail.
 */
export function monthsToFetch(tabs, since = null) {
  const months = [];
  for (const tab of tabs || []) {
    const ymd = tabNameToYmd(tab);
    if (!ymd || (since && ymd < since)) continue;
    const month = `${Number(ymd.slice(5, 7))}/${ymd.slice(0, 4)}`;
    if (!months.includes(month)) months.push(month);
  }
  return months;
}

/** The dated tabs of an export that fall on or after `since` (all of them without it). */
export function datesSince(dates, since = null) {
  if (!since) return { ...(dates || {}) };
  const kept = {};
  for (const [tab, day] of Object.entries(dates || {})) {
    const ymd = tabNameToYmd(tab);
    if (ymd && ymd >= since) kept[tab] = day;
  }
  return kept;
}

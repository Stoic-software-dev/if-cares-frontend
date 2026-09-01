// Site names carry the school year and the state as a prefix
// ("2025/2026 TX COD CHURCHILL REC CENTER"). The full string is the identity
// used by the API; the UI shows the readable tail and surfaces the state as a
// badge instead of repeating it in every row.

const PREFIX = /^(\d{4}\/\d{4})\s+(TX|OK)?\s*/i;

export function shortSiteName(name = '') {
  return name.replace(PREFIX, '').trim() || name;
}

export function siteState(name = '') {
  const match = name.match(PREFIX);
  return match?.[2]?.toUpperCase() ?? '';
}

/**
 * The state a site belongs to. `Site.state` is the real column and the only
 * thing the backend filters claims by; the name prefix is a fallback for the
 * cosmetic badges, where a site imported before the column existed should still
 * show something. Anything that has to AGREE with the backend - a claim, a
 * filter that feeds one - must read the column and never the name.
 */
export function stateOf(site) {
  if (typeof site === 'string') return siteState(site);
  const column = (site?.state ?? '').trim().toUpperCase();
  return column || siteState(site?.name ?? '');
}

export function siteYear(name = '') {
  const match = name.match(PREFIX);
  return match?.[1] ?? '';
}

export function sortSiteNames(names = []) {
  return [...names].sort((a, b) => shortSiteName(a).localeCompare(shortSiteName(b)));
}

// Initials used by the site avatar tiles (two letters, no punctuation).
export function siteInitials(name = '') {
  return shortSiteName(name)
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}

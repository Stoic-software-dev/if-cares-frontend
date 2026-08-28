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

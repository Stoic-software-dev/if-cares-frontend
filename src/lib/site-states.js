import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/http';

// Which states a site can belong to.
//
// This was a constant in the validation module, which meant the day IF Cares
// opened a site in a third state the app needed a deploy to accept it. It is a
// setting now, edited on the Sites screen, and TX and OK are only where it
// starts.
//
// The list is not decoration: `Site.state` decides which consolidated claim a
// site is filed under, and a site whose state is not on the list would be
// claimed by nobody.

export const SITE_STATES_KEY = 'sites.states';
export const DEFAULT_SITE_STATES = ['OK', 'TX'];

const CODE = /^[A-Z]{2}$/;
const MAX_STATES = 60;

export function normalizeStateCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

export async function readSiteStates() {
  const row = await prisma.appSetting.findUnique({ where: { key: SITE_STATES_KEY } });
  if (!row) return [...DEFAULT_SITE_STATES];
  try {
    const parsed = JSON.parse(row.value);
    const codes = Array.isArray(parsed) ? parsed.map(normalizeStateCode).filter((code) => CODE.test(code)) : [];
    // An empty or unreadable setting falls back rather than leaving the form
    // with nothing to pick: no state on a site is the failure this list exists
    // to prevent.
    return codes.length ? [...new Set(codes)].sort() : [...DEFAULT_SITE_STATES];
  } catch {
    return [...DEFAULT_SITE_STATES];
  }
}

/**
 * Replace the list.
 *
 * Removing a state that sites are still filed under is refused: those sites
 * would keep a value the form can no longer produce, and the next person to
 * open one would have to pick something else to save it at all.
 */
export async function writeSiteStates(input) {
  if (!Array.isArray(input)) throw new ApiError(422, 'Send the states as a list.');

  const codes = [];
  for (const value of input) {
    const code = normalizeStateCode(value);
    if (!code) continue;
    if (!CODE.test(code)) throw new ApiError(422, `"${code}" is not a two letter state code.`);
    if (!codes.includes(code)) codes.push(code);
  }
  if (codes.length === 0) throw new ApiError(422, 'Keep at least one state on the list.');
  if (codes.length > MAX_STATES) throw new ApiError(422, `That is more than ${MAX_STATES} states.`);

  const current = await readSiteStates();
  const dropped = current.filter((code) => !codes.includes(code));
  if (dropped.length) {
    const inUse = await prisma.site.groupBy({
      by: ['state'],
      where: { state: { in: dropped } },
      _count: { id: true },
    });
    if (inUse.length) {
      const detail = inUse
        .map((row) => `${row.state} (${row._count.id} ${row._count.id === 1 ? 'site' : 'sites'})`)
        .join(', ');
      throw new ApiError(422, `Still in use, so it cannot be removed: ${detail}.`);
    }
  }

  const next = [...codes].sort();
  await prisma.appSetting.upsert({
    where: { key: SITE_STATES_KEY },
    create: { key: SITE_STATES_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

/**
 * The state a site is being saved with, checked against the current list.
 *
 * Shape is checked by the schema; membership cannot be, because the schema is
 * built once and the list is data.
 */
export async function checkedState(value) {
  const code = normalizeStateCode(value);
  if (!code) return '';
  const states = await readSiteStates();
  if (!states.includes(code)) {
    throw new ApiError(422, `${code} is not one of the states on file. Add it under Sites first.`);
  }
  return code;
}

// How long a session lasts, by role. Decided, not inherited from the library.
//
// Plain module with no imports, so the rules here are tested with node --test
// without booting Next.
//
// Administrators: 8 hours (SESSION_TTL_HOURS), sliding while the app is used.
// Site users: 14 days on the same phone (STOIC-2771). They take the meal count
// where there is often no signal, and a session that ended while the phone was
// offline left them with a count they could not send, and no way to sign back
// in without a connection. Every time the app opens with signal the 14 days
// start again, so only a phone left unopened for two weeks has to sign in.

const HOUR_MS = 60 * 60 * 1000;
export const SITE_USER_SESSION_MS = 14 * 24 * HOUR_MS;
const ADMIN_REFRESH_BELOW_MS = 4 * HOUR_MS;
// A site user's cookie is reissued once it is an hour old, not on every
// request: often enough that opening the app restarts the 14 days.
const SITE_USER_REFRESH_AFTER_MS = HOUR_MS;

export function adminSessionMs(hoursSetting) {
  const hours = Number(hoursSetting || 8);
  return (Number.isFinite(hours) && hours > 0 ? hours : 8) * HOUR_MS;
}

export function sessionMsFor(role, hoursSetting) {
  return role === 'ADMIN' ? adminSessionMs(hoursSetting) : SITE_USER_SESSION_MS;
}

// Whether /api/auth/me should hand out a fresh cookie.
export function shouldRefreshSession({ role, expiresAtMs, now }) {
  const remaining = expiresAtMs - now;
  if (role === 'ADMIN') return remaining < ADMIN_REFRESH_BELOW_MS;
  return remaining < SITE_USER_SESSION_MS - SITE_USER_REFRESH_AFTER_MS;
}

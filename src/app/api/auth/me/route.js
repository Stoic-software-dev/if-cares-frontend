import { handle, legacySuccess } from '@/lib/http';
import { requireUser, issueSessionCookie } from '@/lib/auth';
import { shouldRefreshSession } from '@/lib/session-policy.mjs';
import { toLegacyUser } from '@/lib/legacy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Replaces the legacy `?type=refreshUser&email=` call: identity now comes from
// the session cookie, and the cookie slides while the app is in active use.
export const GET = handle(async () => {
  const session = await requireUser({ tellGone: true });
  let expiresAt = session.expiresAtMs;
  const { role } = session.user;
  if (shouldRefreshSession({ role, expiresAtMs: expiresAt, now: Date.now() })) {
    expiresAt = await issueSessionCookie(session.user);
  }
  return legacySuccess({ data: toLegacyUser(session.user, expiresAt) });
});

import { handle, legacySuccess } from '@/lib/http';
import { requireUser, issueSessionCookie } from '@/lib/auth';
import { toLegacyUser } from '@/lib/legacy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REFRESH_THRESHOLD_MS = 4 * 60 * 60 * 1000;

// Replaces the legacy `?type=refreshUser&email=` call: identity now comes from
// the session cookie, and the cookie slides while the app is in active use.
export const GET = handle(async () => {
  const session = await requireUser();
  let expiresAt = session.expiresAtMs;
  if (expiresAt - Date.now() < REFRESH_THRESHOLD_MS) {
    expiresAt = await issueSessionCookie(session.user);
  }
  return legacySuccess({ data: toLegacyUser(session.user, expiresAt) });
});

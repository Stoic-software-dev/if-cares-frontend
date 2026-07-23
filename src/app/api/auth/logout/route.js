import { handle, legacySuccess } from '@/lib/http';
import { getSession, clearSessionCookie } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async () => {
  const session = await getSession();
  if (session) {
    await logAudit({ actor: session.user, action: 'auth.logout', entity: 'user', entityId: session.user.id });
  }
  clearSessionCookie();
  return legacySuccess();
});

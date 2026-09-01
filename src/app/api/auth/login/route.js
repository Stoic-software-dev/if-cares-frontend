import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacySuccess, legacyError } from '@/lib/http';
import { issueSessionCookie, verifyPassword, dummyPasswordCompare } from '@/lib/auth';
import { toLegacyUser } from '@/lib/legacy';
import { loginSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BAD_CREDENTIALS = 'Incorrect email or password.';

export const POST = handle(async (req) => {
  const body = loginSchema.parse(await readJsonBody(req));

  const user = await prisma.user.findUnique({
    where: { email: body.email },
    include: { sites: { include: { site: true } } },
  });

  if (!user || !user.active) {
    await dummyPasswordCompare(body.password); // timing parity
    return legacyError(BAD_CREDENTIALS, 401);
  }
  if (!user.passwordHash) {
    // Same answer as any other failed sign in. Telling this apart is telling a
    // stranger the address has an account and has never been used; the person it
    // actually happens to gets where they need to go through "Forgot your
    // password?", which issues a link for an account with no password just fine.
    return legacyError(BAD_CREDENTIALS, 401);
  }
  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    return legacyError(BAD_CREDENTIALS, 401);
  }

  const expiresAt = await issueSessionCookie(user);
  await logAudit({ actor: user, action: 'auth.login', entity: 'user', entityId: user.id });

  return legacySuccess({ data: toLegacyUser(user, expiresAt) });
});

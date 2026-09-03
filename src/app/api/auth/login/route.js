import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacySuccess, legacyError } from '@/lib/http';
import { issueSessionCookie, verifyPassword, dummyPasswordCompare } from '@/lib/auth';
import { toLegacyUser } from '@/lib/legacy';
import { loginSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { clear, clientIp, hit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BAD_CREDENTIALS = 'Incorrect email or password.';

// Generous enough that nobody at a site notices, tight enough that guessing is
// not a strategy. Keyed on the address being signed in to as well as the caller,
// because the caller's address is a header they choose and the account is not.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_EMAIL = 10;
const MAX_PER_IP = 30;

export const POST = handle(async (req) => {
  const body = loginSchema.parse(await readJsonBody(req));

  const perEmail = hit({ bucket: 'login.email', key: body.email, limit: MAX_PER_EMAIL, windowMs: WINDOW_MS });
  const perIp = hit({ bucket: 'login.ip', key: clientIp(req), limit: MAX_PER_IP, windowMs: WINDOW_MS });
  if (perEmail.limited || perIp.limited) {
    // Deliberately the same wording for an existing account and a made up one:
    // a distinct "too many attempts" on one of them tells a stranger which
    // addresses are real.
    return legacyError('Too many sign in attempts. Wait a few minutes and try again.', 429);
  }

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

  // A successful sign in forgives the attempts before it, so somebody who
  // mistyped their password four times is not then locked out by their own
  // success.
  clear('login.email', body.email);

  const expiresAt = await issueSessionCookie(user);
  await logAudit({ actor: user, action: 'auth.login', entity: 'user', entityId: user.id });

  return legacySuccess({ data: toLegacyUser(user, expiresAt) });
});

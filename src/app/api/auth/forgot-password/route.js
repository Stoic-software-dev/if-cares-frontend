import crypto from 'node:crypto';
import { prisma } from '@/lib/db';
import { appBaseUrl, handle, readJsonBody, legacySuccess } from '@/lib/http';
import { forgotPasswordSchema } from '@/lib/validation';
import { mailConfigured, sendMail } from '@/lib/gmail';
import { passwordReset } from '@/lib/mail-templates';
import { notifyFailure } from '@/lib/alerts';
import { logAudit } from '@/lib/audit';
import { hit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Always answers success so account existence is never leaked, whether or not
// the address belongs to anyone and whether or not the mail went out.
// Both branches answer no faster than this. The "account exists" path does real
// work - a random token and a row written - and the other does none, which left
// a ~50ms gap that told anyone measuring which addresses have an account. The
// floor costs a fixed wait on a screen nobody is watching the clock on.
const ANSWER_FLOOR_MS = 400;

// Asking for a link is cheap and sends mail to somebody else's inbox, so it is
// worth a ceiling. Being over it still answers success after the same floor as
// everything else here: a 429 on a real address and a 200 on an invented one
// would say which is which.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 5;

// The token, the mail and the audit row, detached from the request that asked
// for them. A failure reaches the team through the alert, never the caller.
async function issueResetLink(user, base) {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.$transaction([
    // One live link at a time. Every request used to add another usable token
    // and only using one retired the rest, so an address that was asked for a
    // link five times had five keys to it for the hour.
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    }),
  ]);
  if (mailConfigured()) {
    const link = `${base}/reset-password?token=${token}`;
    const message = passwordReset({ name: user.name, link });
    // A slow or broken mail provider must not become a slow login screen; the
    // failure still reaches the team through the alert.
    sendMail({ to: [user.email], ...message }).catch((error) => {
      notifyFailure({ area: 'Password reset email', error, context: { to: user.email } });
    });
  }
  await logAudit({ actor: user, action: 'auth.forgot_password', entity: 'user', entityId: user.id });
}

export const POST = handle(async (req) => {
  const startedAt = Date.now();
  const { email } = forgotPasswordSchema.parse(await readJsonBody(req));
  const { limited } = hit({ bucket: 'forgot', key: email, limit: MAX_PER_EMAIL, windowMs: WINDOW_MS });
  const user = limited ? null : await prisma.user.findUnique({ where: { email } });
  if (user && user.active) {
    // Everything the real branch does happens after the answer is on its way,
    // not in front of it. Writing the token and the audit row took about three
    // seconds against the hosted database while the made up address answered
    // in one, and the floor below covers work of the same shape, not of that
    // size: with the writes awaited, the timing said which addresses exist just
    // as plainly as a different message would have. The person asking sees the
    // same screen either way; the link reaches their inbox a moment later.
    const base = appBaseUrl(req);
    issueResetLink(user, base).catch((error) => {
      notifyFailure({ area: 'Password reset link', error, context: { to: user.email } });
    });
  }
  const elapsed = Date.now() - startedAt;
  if (elapsed < ANSWER_FLOOR_MS) {
    await new Promise((resolve) => setTimeout(resolve, ANSWER_FLOOR_MS - elapsed));
  }
  return legacySuccess();
});

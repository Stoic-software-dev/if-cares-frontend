import crypto from 'node:crypto';
import { prisma } from '@/lib/db';
import { appBaseUrl, handle, readJsonBody, legacySuccess } from '@/lib/http';
import { forgotPasswordSchema } from '@/lib/validation';
import { mailConfigured, sendMail } from '@/lib/gmail';
import { passwordReset } from '@/lib/mail-templates';
import { notifyFailure } from '@/lib/alerts';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Always answers success so account existence is never leaked, whether or not
// the address belongs to anyone and whether or not the mail went out.
export const POST = handle(async (req) => {
  const { email } = forgotPasswordSchema.parse(await readJsonBody(req));
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.active) {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });
    // The mail is sent alongside the answer, never in front of it: a slow or
    // broken mail provider must not turn into a slow login screen, and must not
    // become a way to find out whether an address exists.
    if (mailConfigured()) {
      const base = appBaseUrl(req);
      const link = `${base}/reset-password?token=${token}`;
      const message = passwordReset({ name: user.name, link });
      // Deliberately NOT awaited, for the reason above: awaiting a mail send
      // here would put its whole latency on the "this address exists" branch and
      // turn a ~50ms timing difference into a plainly measurable one. The
      // failure still reaches the team through the alert instead of a log line
      // nobody reads.
      sendMail({ to: [user.email], ...message }).catch((error) => {
        notifyFailure({ area: 'Password reset email', error, context: { to: user.email } });
      });
    }

    await logAudit({ actor: user, action: 'auth.forgot_password', entity: 'user', entityId: user.id });
  }
  return legacySuccess();
});

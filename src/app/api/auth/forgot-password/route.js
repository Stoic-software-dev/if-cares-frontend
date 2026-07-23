import crypto from 'node:crypto';
import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacySuccess } from '@/lib/http';
import { forgotPasswordSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Always answers success so account existence is never leaked. Email delivery
// is not wired yet: an admin generates the link with scripts/create-reset-link.mjs.
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
    await logAudit({ actor: user, action: 'auth.forgot_password', entity: 'user', entityId: user.id });
  }
  return legacySuccess();
});

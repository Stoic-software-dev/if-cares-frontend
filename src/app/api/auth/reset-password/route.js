import crypto from 'node:crypto';
import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, legacySuccess, legacyError } from '@/lib/http';
import { hashPassword } from '@/lib/auth';
import { resetPasswordSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Is this link still good? The screen asks before drawing the form, so a dead
// link says so at once instead of after somebody has chosen a password, typed it
// twice and pressed save. It reveals nothing: the token IS the secret, and only
// whoever already holds one can ask about it.
export const GET = handle(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (token.length < 16) return legacyJson({ result: 'success', data: { usable: false } });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { active: true } } },
  });
  const usable = Boolean(
    record && !record.usedAt && record.expiresAt >= new Date() && record.user.active
  );
  return legacyJson({ result: 'success', data: { usable } });
});

export const POST = handle(async (req) => {
  const { token, newPassword } = resetPasswordSchema.parse(await readJsonBody(req));
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.active) {
    return legacyError('This reset link is invalid or has expired.', 400);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null, id: { not: record.id } },
      data: { usedAt: new Date() },
    }),
  ]);

  await logAudit({ actor: record.user, action: 'auth.reset_password', entity: 'user', entityId: record.userId });
  return legacySuccess();
});

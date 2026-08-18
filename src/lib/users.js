import crypto from 'node:crypto';
import { prisma } from '@/lib/db';

const RESET_TTL_MS = 24 * 60 * 60 * 1000; // Admin-issued links last a day.

export function toUserRow(user) {
  return {
    id: user.id,
    name: user.name,
    lastname: user.lastname,
    email: user.email,
    role: user.role,
    active: user.active,
    allSites: user.allSites,
    sites: (user.sites ?? []).map((us) => us.site.name).sort(),
    needsPassword: !user.passwordHash,
  };
}

export async function issueResetLink(req, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  return `${new URL(req.url).origin}/reset-password?token=${token}`;
}

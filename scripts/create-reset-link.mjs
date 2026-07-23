// Generates a one-hour password-reset link for a user (until email delivery is
// wired up). Usage: node scripts/create-reset-link.mjs someone@example.com

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

try {
  process.loadEnvFile();
} catch {
  // .env optional
}

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: node scripts/create-reset-link.mjs <email>');
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const base = process.env.APP_URL || 'http://localhost:3000';
  console.log(`Reset link for ${email} (valid 1h):`);
  console.log(`${base}/auth/reset?token=${token}`);
  console.log('\n(API alternative: POST /api/auth/reset-password {"token":"…","newPassword":"…"})');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

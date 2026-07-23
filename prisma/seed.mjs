import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

try {
  process.loadEnvFile();
} catch {
  // .env optional — envs may come from the shell
}

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const name = process.env.SEED_ADMIN_NAME || 'Admin';
  const lastname = process.env.SEED_ADMIN_LASTNAME || '';
  const password = process.env.SEED_ADMIN_PASSWORD || '';

  if (!email) throw new Error('SEED_ADMIN_EMAIL is required.');
  if (password.length < 8) throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters.');

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, name, lastname, passwordHash, role: 'ADMIN', allSites: true },
    update: { name, lastname, passwordHash, role: 'ADMIN', allSites: true, active: true },
  });
  console.log(`Seeded admin ${admin.email} (${admin.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

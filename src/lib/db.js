import { PrismaClient } from '@prisma/client';

// Single PrismaClient across dev HMR reloads and warm serverless invocations.
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.__ifcaresPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__ifcaresPrisma = prisma;
}

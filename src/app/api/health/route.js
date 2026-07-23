import { prisma } from '@/lib/db';
import { legacyJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return legacyJson({ ok: true, db: true });
  } catch {
    return legacyJson({ ok: false, db: false }, { status: 500 });
  }
}

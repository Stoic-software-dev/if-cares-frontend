import { prisma } from '@/lib/db';
import { legacyJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The deploy healthcheck. It used to answer a bare 500 when the database was
// unreachable, which is the least useful thing it could say: a failed deploy
// then looks identical whether the credentials are wrong, the project is
// paused, or the connection pool is full. The reason goes to the log, where the
// platform's deploy output shows it, and a short code goes in the body. Neither
// carries the connection string.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return legacyJson({ ok: true, db: true });
  } catch (error) {
    const message = String(error?.message ?? error);
    // Prisma prefixes its own initialisation errors with the invocation, so the
    // first line that says something is usually several down.
    console.error('[health] database unreachable:', message.replace(/\s+/g, ' ').slice(0, 500));
    return legacyJson({ ok: false, db: false, reason: dbFailureReason(message) }, { status: 500 });
  }
}

// A word for the log reader, not for a client to branch on.
function dbFailureReason(message) {
  if (/max clients reached|too many connections|EMAXCONNSESSION/i.test(message)) return 'pool-exhausted';
  if (/Environment variable not found/i.test(message)) return 'env-missing';
  if (/Authentication failed|password authentication/i.test(message)) return 'credentials';
  if (/Can't reach database server|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(message)) return 'unreachable';
  return 'error';
}

import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, legacySuccess, ApiError } from '@/lib/http';
import { requireAdmin, getSession } from '@/lib/auth';
import { canSeeMonitoring } from '@/lib/monitoring-access';
import { clientErrorSchema } from '@/lib/validation';

// Reading the errors is narrower than being an admin: it is a developer view.
// It answers 404 rather than 403 so the screen is not advertised to the admins
// who are not supposed to care that it exists.
async function requireMonitoringAccess() {
  const session = await requireAdmin();
  if (!canSeeMonitoring(session.user)) throw new ApiError(404, 'Not found.');
  return session;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Where crashes in the browser go. Until this existed, a screen that blew up at
// a site left no trace anywhere: nobody found out unless the site phoned in.
//
// POST is deliberately open to signed out callers, because the login screen can
// crash too. That makes it the one write endpoint anyone can reach, so it is
// kept boring: a strict schema with short limits, a per address rate limit, and
// nothing from the payload is ever echoed back.

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map(); // ip -> { count, resetAt }

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > MAX_PER_WINDOW) return true;
  // The map would grow forever on a busy server otherwise.
  if (hits.size > 5000) {
    for (const [key, value] of hits) if (now > value.resetAt) hits.delete(key);
  }
  return false;
}

// The same broken line reported from forty sites is one problem. Grouping on the
// message plus the first frame plus the screen keeps the list readable.
function fingerprintOf({ message, stack, pathname }) {
  const frame = String(stack || '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('at ')) ?? '';
  return createHash('sha1').update(`${message}|${frame}|${pathname}`).digest('hex');
}

export const POST = handle(async (req) => {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
  if (rateLimited(ip)) throw new ApiError(429, 'Too many reports.');

  const report = clientErrorSchema.parse(await readJsonBody(req));

  // Best effort: a crash on the login screen has nobody to attribute it to.
  let email = '';
  try {
    const session = await getSession();
    email = session?.user?.email ?? '';
  } catch {
    // Not signed in.
  }

  const fingerprint = fingerprintOf(report);
  await prisma.clientError.upsert({
    where: { fingerprint },
    create: {
      fingerprint,
      message: report.message,
      stack: report.stack ?? '',
      pathname: report.pathname ?? '',
      source: report.source ?? '',
      userAgent: (req.headers.get('user-agent') ?? '').slice(0, 300),
      lastEmail: email,
    },
    update: {
      count: { increment: 1 },
      lastSeenAt: new Date(),
      lastEmail: email,
      stack: report.stack ?? '',
      // Seeing it again reopens it: the fix did not hold.
      resolvedAt: null,
    },
  });

  return legacySuccess();
});

export const GET = handle(async (req) => {
  await requireMonitoringAccess();
  const url = new URL(req.url);
  const includeResolved = url.searchParams.get('resolved') === '1';

  const errors = await prisma.clientError.findMany({
    where: includeResolved ? {} : { resolvedAt: null },
    orderBy: { lastSeenAt: 'desc' },
    take: 200,
  });

  return legacyJson({
    result: 'success',
    data: errors.map((error) => ({
      id: error.id,
      message: error.message,
      stack: error.stack,
      pathname: error.pathname,
      source: error.source,
      userAgent: error.userAgent,
      lastEmail: error.lastEmail,
      count: error.count,
      firstSeenAt: error.firstSeenAt.toISOString(),
      lastSeenAt: error.lastSeenAt.toISOString(),
      resolvedAt: error.resolvedAt ? error.resolvedAt.toISOString() : null,
    })),
  });
});

// Marking one as handled, so the list shows what is still happening.
export const PATCH = handle(async (req) => {
  await requireMonitoringAccess();
  const { id, resolved } = await readJsonBody(req);
  if (!id) throw new ApiError(400, 'Missing id.');

  await prisma.clientError.update({
    where: { id },
    data: { resolvedAt: resolved ? new Date() : null },
  });
  return legacySuccess();
});

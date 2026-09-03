import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { handle, readJsonBody, requireObjectBody, legacyJson, legacySuccess, ApiError } from '@/lib/http';
import { requireAdmin, getSession } from '@/lib/auth';
import { canSeeMonitoring } from '@/lib/monitoring-access';
import { clientErrorSchema } from '@/lib/validation';
import { clientIp, hit } from '@/lib/rate-limit';

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
// The per address limit is keyed on a header the caller writes, so it slows an
// honest flood and not a deliberate one: vary the header and the counter resets.
// What actually has to be bounded is the number of DISTINCT problems the table
// can learn about in a minute, because a new fingerprint is a new row and the
// message is free text. Real crashes arrive as a handful of repeated
// fingerprints; hundreds of new ones a minute is somebody writing rows.
const MAX_NEW_FINGERPRINTS_PER_WINDOW = 60;

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
  const perIp = hit({ bucket: 'monitoring.ip', key: clientIp(req), limit: MAX_PER_WINDOW, windowMs: WINDOW_MS });
  if (perIp.limited) throw new ApiError(429, 'Too many reports.');

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

  // Seeing a problem again is always recorded, however often it happens: that
  // counter is the point of the screen. Learning a NEW one is what is capped,
  // and the cap is global rather than per caller so it cannot be sidestepped by
  // changing an address.
  const known = await prisma.clientError.findUnique({ where: { fingerprint }, select: { id: true } });
  if (!known) {
    const fresh = hit({
      bucket: 'monitoring.new',
      key: 'global',
      limit: MAX_NEW_FINGERPRINTS_PER_WINDOW,
      windowMs: WINDOW_MS,
    });
    if (fresh.limited) throw new ApiError(429, 'Too many reports.');
  }

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
  const { id, resolved } = requireObjectBody(await readJsonBody(req));
  if (!id) throw new ApiError(400, 'Missing id.');

  // An id that is not there is a 404, not a crash: Prisma raises P2025 for it
  // and nothing was catching that.
  const { count } = await prisma.clientError.updateMany({
    where: { id: String(id) },
    data: { resolvedAt: resolved ? new Date() : null },
  });
  if (!count) throw new ApiError(404, 'That report is no longer there.');
  return legacySuccess();
});

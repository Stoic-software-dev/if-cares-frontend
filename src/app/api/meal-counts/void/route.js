import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, legacySuccess, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { voidCountSchema } from '@/lib/validation';
import { ymdToUtcDate } from '@/lib/dates';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A count filed on the wrong day or the wrong site cannot be fixed by correcting
// it: the numbers are right, they just belong somewhere else. Voiding is the way
// out. It is a logical delete, never a real one, because the submission is the
// record of what a site claimed and the audit trail has to survive the mistake.
//
// POST voids, PUT restores. Both are admin only and both leave an audit entry.

// What an administrator needs to see on a day that looks empty but is not: it
// held a count that someone threw out. Without this the void is a one way door.
export const GET = handle(async (req) => {
  await requireAdmin();
  const url = new URL(req.url);
  const siteName = url.searchParams.get('site');
  const ymd = url.searchParams.get('date');
  if (!siteName || !ymd) throw new ApiError(400, 'Missing site or date parameter.');

  const date = ymdToUtcDate(ymd);
  if (!date) throw new ApiError(422, 'Invalid date.');

  const site = await prisma.site.findUnique({ where: { name: siteName } });
  if (!site) throw new ApiError(404, 'Site not found.');

  const count = await prisma.mealCount.findFirst({
    where: { siteId: site.id, date, voidedAt: { not: null } },
    orderBy: { voidedAt: 'desc' },
    select: { voidedAt: true, voidedByEmail: true, voidReason: true, _count: { select: { entries: true } } },
  });

  return legacyJson({
    result: 'success',
    data: count
      ? {
          at: count.voidedAt.toISOString(),
          by: count.voidedByEmail,
          reason: count.voidReason,
          students: count._count.entries,
        }
      : null,
  });
});

export const POST = handle(async (req) => {
  const session = await requireAdmin();
  const { site: siteName, date: ymd, reason } = voidCountSchema.parse(await readJsonBody(req));

  const date = ymdToUtcDate(ymd);
  if (!date) throw new ApiError(422, 'Invalid date.');

  const site = await prisma.site.findUnique({ where: { name: siteName } });
  if (!site) throw new ApiError(404, 'Site not found.');

  const count = await prisma.mealCount.findFirst({
    where: { siteId: site.id, date, voidedAt: null },
  });
  if (!count) throw new ApiError(404, 'No active meal count for this date.');

  await prisma.mealCount.update({
    where: { id: count.id },
    data: {
      voidedAt: new Date(),
      voidedById: session.user.id,
      voidedByEmail: session.user.email ?? '',
      voidReason: reason,
    },
  });

  await logAudit({
    actor: session.user,
    action: 'meal_count.void',
    entity: 'meal_count',
    entityId: count.id,
    payload: { site: site.name, date: ymd, reason },
  });
  return legacySuccess();
});

export const PUT = handle(async (req) => {
  const session = await requireAdmin();
  const { site: siteName, date: ymd } = voidCountSchema.partial({ reason: true }).parse(
    await readJsonBody(req)
  );

  const date = ymdToUtcDate(ymd);
  if (!date) throw new ApiError(422, 'Invalid date.');

  const site = await prisma.site.findUnique({ where: { name: siteName } });
  if (!site) throw new ApiError(404, 'Site not found.');

  // The most recent void for the day: restoring is an undo of the last action.
  const count = await prisma.mealCount.findFirst({
    where: { siteId: site.id, date, voidedAt: { not: null } },
    orderBy: { voidedAt: 'desc' },
  });
  if (!count) throw new ApiError(404, 'No voided meal count for this date.');

  // Restoring cannot create a second active count for the same day.
  const active = await prisma.mealCount.findFirst({
    where: { siteId: site.id, date, voidedAt: null },
    select: { id: true },
  });
  if (active) throw new ApiError(409, 'This day already has an active count. Void that one first.');

  // The service day has to exist again for the count to make sense on it. It is
  // recreated closed of meals: reopening a day is a calendar decision, and the
  // count itself carries what was actually served.
  await prisma.$transaction([
    prisma.mealCount.update({
      where: { id: count.id },
      data: { voidedAt: null, voidedById: null, voidedByEmail: '', voidReason: '' },
    }),
    prisma.serviceDay.upsert({
      where: { siteId_date: { siteId: site.id, date } },
      create: { siteId: site.id, date, brk: false, lunch: false, snk: false, sup: false },
      update: {},
    }),
  ]);

  await logAudit({
    actor: session.user,
    action: 'meal_count.unvoid',
    entity: 'meal_count',
    entityId: count.id,
    payload: { site: site.name, date: ymd },
  });
  return legacySuccess();
});

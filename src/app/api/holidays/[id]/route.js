import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacySuccess, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { holidayUpdateSchema } from '@/lib/validation';
import { ymdToUtcDate } from '@/lib/dates';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handle(async (req, { params }) => {
  const session = await requireAdmin();
  const body = holidayUpdateSchema.parse(await readJsonBody(req));

  const holiday = await prisma.holiday.findUnique({ where: { id: params.id } });
  if (!holiday) throw new ApiError(404, 'Holiday not found.');

  // `ymdToUtcDate` answers null for a date that matches the shape but is not a
  // real day - "2026-02-31", "2026-13-01". POST checks for that; this did not,
  // so null sailed past the comparison below (null > a Date is false) and hit a
  // NOT NULL column as a 500.
  const start = body.startDate ? ymdToUtcDate(body.startDate) : holiday.startDate;
  const end = body.endDate ? ymdToUtcDate(body.endDate) : holiday.endDate;
  if (!start || !end) throw new ApiError(422, 'Invalid dates.');
  if (start > end) throw new ApiError(422, 'The holiday ends before it starts.');

  // The scope is replaced wholesale when it is sent: editing "these four sites"
  // into "these two" has to remove the other two, not add to them.
  let siteIds;
  if (body.sites !== undefined) {
    const sites = await prisma.site.findMany({ where: { name: { in: body.sites } }, select: { id: true } });
    siteIds = sites.map((site) => site.id);
  }

  await prisma.$transaction(async (tx) => {
    await tx.holiday.update({
      where: { id: holiday.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        startDate: start,
        endDate: end,
        ...(body.allSites !== undefined ? { allSites: body.allSites } : {}),
        ...(body.allMeals !== undefined ? { allMeals: body.allMeals } : {}),
        ...(body.brk !== undefined ? { brk: body.brk } : {}),
        ...(body.lunch !== undefined ? { lunch: body.lunch } : {}),
        ...(body.snk !== undefined ? { snk: body.snk } : {}),
        ...(body.sup !== undefined ? { sup: body.sup } : {}),
      },
    });

    if (siteIds !== undefined) {
      await tx.holidaySite.deleteMany({ where: { holidayId: holiday.id } });
      if (siteIds.length) {
        await tx.holidaySite.createMany({
          data: siteIds.map((siteId) => ({ holidayId: holiday.id, siteId })),
          skipDuplicates: true,
        });
      }
    }
  });

  await logAudit({
    actor: session.user,
    action: 'holiday.update',
    entity: 'holiday',
    entityId: holiday.id,
    payload: { name: body.name ?? holiday.name },
  });
  return legacySuccess();
});

// Removing a holiday puts its days straight back, because it never took them
// away in the first place: the calendar reads holidays, it does not store them.
export const DELETE = handle(async (_req, { params }) => {
  const session = await requireAdmin();
  const holiday = await prisma.holiday.findUnique({ where: { id: params.id } });
  if (!holiday) throw new ApiError(404, 'Holiday not found.');

  await prisma.holiday.delete({ where: { id: holiday.id } });

  await logAudit({
    actor: session.user,
    action: 'holiday.delete',
    entity: 'holiday',
    entityId: holiday.id,
    payload: { name: holiday.name },
  });
  return legacySuccess();
});

import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { holidayCreateSchema } from '@/lib/validation';
import { ymdToUtcDate, dateToYmd } from '@/lib/dates';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toHoliday(holiday) {
  return {
    id: holiday.id,
    name: holiday.name,
    startDate: dateToYmd(holiday.startDate),
    endDate: dateToYmd(holiday.endDate),
    allSites: holiday.allSites,
    allMeals: holiday.allMeals,
    brk: holiday.brk,
    lunch: holiday.lunch,
    snk: holiday.snk,
    sup: holiday.sup,
    sites: holiday.sites?.map((entry) => entry.site.name) ?? [],
  };
}

export const GET = handle(async () => {
  await requireAdmin();
  const holidays = await prisma.holiday.findMany({
    include: { sites: { include: { site: { select: { name: true } } } } },
    orderBy: { startDate: 'desc' },
  });
  return legacyJson({ result: 'success', data: holidays.map(toHoliday) });
});

export const POST = handle(async (req) => {
  const session = await requireAdmin();
  const body = holidayCreateSchema.parse(await readJsonBody(req));

  const start = ymdToUtcDate(body.startDate);
  const end = ymdToUtcDate(body.endDate);
  if (!start || !end) throw new ApiError(422, 'Invalid dates.');
  if (start > end) throw new ApiError(422, 'The holiday ends before it starts.');

  // Two entries for the same name over the same days is almost always a second
  // person adding what someone already added.
  const duplicate = await prisma.holiday.findFirst({
    where: { name: body.name, startDate: start, endDate: end },
  });
  if (duplicate) throw new ApiError(409, 'That holiday is already on the calendar for those dates.');

  let siteIds = [];
  if (!body.allSites) {
    if (!body.sites?.length) throw new ApiError(422, 'Pick at least one site, or apply it everywhere.');
    const sites = await prisma.site.findMany({ where: { name: { in: body.sites } }, select: { id: true } });
    siteIds = sites.map((site) => site.id);
    if (!siteIds.length) throw new ApiError(404, 'None of those sites exist.');
  }

  const holiday = await prisma.holiday.create({
    data: {
      name: body.name,
      startDate: start,
      endDate: end,
      allSites: body.allSites,
      allMeals: body.allMeals,
      brk: body.brk ?? false,
      lunch: body.lunch ?? false,
      snk: body.snk ?? false,
      sup: body.sup ?? false,
      createdById: session.user.id,
      ...(siteIds.length ? { sites: { create: siteIds.map((siteId) => ({ siteId })) } } : {}),
    },
  });

  await logAudit({
    actor: session.user,
    action: 'holiday.create',
    entity: 'holiday',
    entityId: holiday.id,
    payload: { name: body.name, from: body.startDate, to: body.endDate, sites: siteIds.length || 'all' },
  });

  return legacyJson({ result: 'success', data: { id: holiday.id } });
});

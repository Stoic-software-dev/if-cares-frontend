import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, ApiError } from '@/lib/http';
import { requireUser, requireAdmin, visibleSites } from '@/lib/auth';
import { toLegacySiteListItem } from '@/lib/legacy';
import { siteCreateSchema } from '@/lib/validation';
import { generateServiceDays, normalizeTemplate } from '@/lib/site-calendar';
import { ymdToUtcDate } from '@/lib/dates';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Legacy `?type=sites`: a RAW array of {name, spreadsheetId}, scoped to the user.
//
// `?includeInactive=1` is additive and admin only: without it a deactivated site
// is unreachable from anywhere in the UI, which made deactivating one a
// practically one way door.
export const GET = handle(async (req) => {
  const session = await requireUser();
  const wantsInactive = new URL(req.url).searchParams.get('includeInactive') === '1';

  if (wantsInactive && session.user.role === 'ADMIN') {
    const all = await prisma.site.findMany({ orderBy: { name: 'asc' } });
    return legacyJson(all.map((site) => ({ ...toLegacySiteListItem(site), active: site.active })));
  }

  const sites = await visibleSites(session);
  return legacyJson(sites.map((site) => ({ ...toLegacySiteListItem(site), active: true })));
});

// Opening a site used to mean a row in a spreadsheet and then clicking two
// hundred days onto a calendar. Here it is one form: the cycle dates plus which
// meals each weekday serves generate the whole calendar in the same transaction.
export const POST = handle(async (req) => {
  const session = await requireAdmin();
  const body = siteCreateSchema.parse(await readJsonBody(req));

  const existing = await prisma.site.findUnique({ where: { name: body.name } });
  if (existing) throw new ApiError(409, 'A site with that name already exists.');

  const weeklyTemplate = normalizeTemplate(body.weeklyTemplate);
  const days = generateServiceDays({
    programStart: body.programStart,
    programEnd: body.programEnd,
    weeklyTemplate,
  });

  const site = await prisma.$transaction(async (tx) => {
    const created = await tx.site.create({
      data: {
        name: body.name,
        state: body.state ?? '',
        ceName: body.ceName ?? '',
        ceId: body.ceId ?? '',
        siteName: body.siteName ?? '',
        siteNumber: body.siteNumber ?? '',
        active: true,
        programStart: body.programStart ? ymdToUtcDate(body.programStart) : null,
        programEnd: body.programEnd ? ymdToUtcDate(body.programEnd) : null,
        reminderStart: body.reminderStart ? ymdToUtcDate(body.reminderStart) : null,
        reminderEnd: body.reminderEnd ? ymdToUtcDate(body.reminderEnd) : null,
        weeklyTemplate,
      },
    });

    if (days.length) {
      await tx.serviceDay.createMany({
        data: days.map((day) => ({
          siteId: created.id,
          date: ymdToUtcDate(day.date),
          brk: day.brk,
          lunch: day.lunch,
          snk: day.snk,
          sup: day.sup,
        })),
        skipDuplicates: true,
      });
    }

    return created;
  });

  await logAudit({
    actor: session.user,
    action: 'site.create',
    entity: 'site',
    entityId: site.id,
    payload: { name: site.name, serviceDays: days.length },
  });

  return legacyJson({ result: 'success', data: { id: site.id, name: site.name, serviceDays: days.length } });
});

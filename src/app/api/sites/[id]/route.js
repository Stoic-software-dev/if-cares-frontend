import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, legacySuccess, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { siteUpdateSchema } from '@/lib/validation';
import { generateServiceDays, normalizeTemplate } from '@/lib/site-calendar';
import { ymdToUtcDate, dateToYmd } from '@/lib/dates';
import { toSiteRecord, SITE_RECORD_INCLUDE } from '@/lib/site-record';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async (_req, { params }) => {
  await requireAdmin();
  const site = await prisma.site.findUnique({ where: { id: params.id }, include: SITE_RECORD_INCLUDE });
  if (!site) throw new ApiError(404, 'Site not found.');
  return legacyJson({ result: 'success', data: toSiteRecord(site) });
});

export const PATCH = handle(async (req, { params }) => {
  const session = await requireAdmin();
  const body = siteUpdateSchema.parse(await readJsonBody(req));

  const site = await prisma.site.findUnique({ where: { id: params.id } });
  if (!site) throw new ApiError(404, 'Site not found.');

  if (body.name && body.name !== site.name) {
    const clash = await prisma.site.findUnique({ where: { name: body.name } });
    if (clash) throw new ApiError(409, 'Another site already uses that name.');
  }

  const weeklyTemplate =
    body.weeklyTemplate === undefined ? undefined : normalizeTemplate(body.weeklyTemplate);

  await prisma.site.update({
    where: { id: site.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.state !== undefined ? { state: body.state } : {}),
      ...(body.ceName !== undefined ? { ceName: body.ceName } : {}),
      ...(body.ceId !== undefined ? { ceId: body.ceId } : {}),
      ...(body.siteName !== undefined ? { siteName: body.siteName } : {}),
      ...(body.siteNumber !== undefined ? { siteNumber: body.siteNumber } : {}),
      ...(body.programStart !== undefined
        ? { programStart: body.programStart ? ymdToUtcDate(body.programStart) : null }
        : {}),
      ...(body.programEnd !== undefined
        ? { programEnd: body.programEnd ? ymdToUtcDate(body.programEnd) : null }
        : {}),
      ...(body.reminderStart !== undefined
        ? { reminderStart: body.reminderStart ? ymdToUtcDate(body.reminderStart) : null }
        : {}),
      ...(body.reminderEnd !== undefined
        ? { reminderEnd: body.reminderEnd ? ymdToUtcDate(body.reminderEnd) : null }
        : {}),
      ...(weeklyTemplate !== undefined ? { weeklyTemplate } : {}),
    },
  });

  await logAudit({
    actor: session.user,
    action: 'site.update',
    entity: 'site',
    entityId: site.id,
    // A rename is the change worth being able to find later: the name is what
    // every screen shows and every URL carries.
    payload: {
      ...(body.name && body.name !== site.name ? { renamedFrom: site.name, renamedTo: body.name } : {}),
      ...(body.active !== undefined && body.active !== site.active ? { active: body.active } : {}),
    },
  });

  return legacySuccess();
});

// Regenerating the calendar from the site's own cycle. It only ADDS the days the
// template implies and are missing: never removes, never rewrites a day that
// already has a count, so running it twice is safe and running it after
// extending the program just fills in the tail.
export const PUT = handle(async (_req, { params }) => {
  const session = await requireAdmin();
  const site = await prisma.site.findUnique({ where: { id: params.id } });
  if (!site) throw new ApiError(404, 'Site not found.');
  if (!site.programStart || !site.programEnd) {
    throw new ApiError(422, 'Set the program start and end dates first.');
  }

  const wanted = generateServiceDays({
    programStart: site.programStart,
    programEnd: site.programEnd,
    weeklyTemplate: site.weeklyTemplate ?? {},
  });

  const existing = await prisma.serviceDay.findMany({
    where: { siteId: site.id },
    select: { date: true },
  });
  const have = new Set(existing.map((day) => dateToYmd(day.date)));
  const missing = wanted.filter((day) => !have.has(day.date));

  if (missing.length) {
    await prisma.serviceDay.createMany({
      data: missing.map((day) => ({
        siteId: site.id,
        date: ymdToUtcDate(day.date),
        brk: day.brk,
        lunch: day.lunch,
        snk: day.snk,
        sup: day.sup,
      })),
      skipDuplicates: true,
    });
  }

  await logAudit({
    actor: session.user,
    action: 'site.calendar_generate',
    entity: 'site',
    entityId: site.id,
    payload: { added: missing.length, expected: wanted.length },
  });

  return legacyJson({ result: 'success', added: missing.length, expected: wanted.length });
});

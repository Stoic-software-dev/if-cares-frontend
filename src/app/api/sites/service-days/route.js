import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, legacySuccess, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { serviceDaysPutSchema } from '@/lib/validation';
import { ymdToUtcDate, dateToYmd } from '@/lib/dates';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function findSiteOr404(req) {
  const siteName = new URL(req.url).searchParams.get('site');
  if (!siteName) throw new ApiError(400, 'Missing site parameter.');
  const site = await prisma.site.findUnique({ where: { name: siteName } });
  if (!site) throw new ApiError(404, 'Site not found.');
  return site;
}

export const GET = handle(async (req) => {
  await requireAdmin();
  const site = await findSiteOr404(req);
  const days = await prisma.serviceDay.findMany({
    where: { siteId: site.id },
    orderBy: { date: 'asc' },
  });
  return legacyJson({
    result: 'success',
    days: days.map((d) => ({
      date: dateToYmd(d.date),
      brk: d.brk,
      lunch: d.lunch,
      snk: d.snk,
      sup: d.sup,
    })),
  });
});

// Full replace of the site's service calendar, except dates that already have a
// submitted meal count — history can never be unclaimed from here.
export const PUT = handle(async (req) => {
  const session = await requireAdmin();
  const site = await findSiteOr404(req);
  const { days } = serviceDaysPutSchema.parse(await readJsonBody(req));

  const incoming = new Map();
  for (const day of days) {
    const date = ymdToUtcDate(day.date);
    if (!date) throw new ApiError(422, `Invalid date: ${day.date}`);
    incoming.set(day.date, { date, brk: day.brk, lunch: day.lunch, snk: day.snk, sup: day.sup });
  }

  const counted = await prisma.mealCount.findMany({
    where: { siteId: site.id },
    select: { date: true },
  });
  const countedYmds = new Set(counted.map((c) => dateToYmd(c.date)));

  await prisma.$transaction([
    prisma.serviceDay.deleteMany({
      where: {
        siteId: site.id,
        date: { notIn: [...incoming.values()].map((d) => d.date) },
        NOT: { date: { in: counted.map((c) => c.date) } },
      },
    }),
    ...[...incoming.entries()].map(([ymd, day]) =>
      prisma.serviceDay.upsert({
        where: { siteId_date: { siteId: site.id, date: day.date } },
        create: { siteId: site.id, ...day },
        update: countedYmds.has(ymd)
          ? {} // never rewrite flags of an already-claimed day
          : { brk: day.brk, lunch: day.lunch, snk: day.snk, sup: day.sup },
      })
    ),
  ]);

  await logAudit({
    actor: session.user,
    action: 'site.service_days_update',
    entity: 'site',
    entityId: site.id,
    payload: { days: days.length },
  });
  return legacySuccess();
});

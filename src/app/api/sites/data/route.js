import { prisma } from '@/lib/db';
import { handle, legacyJson, ApiError } from '@/lib/http';
import { requireUser, requireSiteAccess } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Legacy `?type=siteData&site=`: a RAW object with CE info plus the last
// submitted times ("HH:MM:SS", empty string when there is none yet).
export const GET = handle(async (req) => {
  const session = await requireUser();
  const siteName = new URL(req.url).searchParams.get('site');
  if (!siteName) throw new ApiError(400, 'Missing site parameter.');

  const site = await prisma.site.findUnique({ where: { name: siteName } });
  if (!site || !site.active) throw new ApiError(404, 'Site not found.');
  await requireSiteAccess(session, site.name);

  const lastCount = await prisma.mealCount.findFirst({
    where: { siteId: site.id, timeIn: { not: '' } },
    orderBy: { date: 'desc' },
    select: { timeIn: true, timeOut: true },
  });

  return legacyJson({
    name: site.ceName,
    ceId: site.ceId,
    siteName: site.siteName,
    siteNumber: site.siteNumber,
    lastTimeIn: lastCount?.timeIn ?? '',
    lastTimeOut: lastCount?.timeOut ?? '',
  });
});

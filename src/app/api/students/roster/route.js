import { prisma } from '@/lib/db';
import { handle, legacyJson, ApiError } from '@/lib/http';
import { requireUser, requireSiteAccess } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Legacy `?type=studentData&site=`: RAW array of {id, number, name, age} for the
// meal-count table. Ids MUST stay strings — they key localStorage drafts.
export const GET = handle(async (req) => {
  const session = await requireUser();
  const siteName = new URL(req.url).searchParams.get('site');
  if (!siteName) throw new ApiError(400, 'Missing site parameter.');

  const site = await prisma.site.findUnique({ where: { name: siteName } });
  if (!site || !site.active) throw new ApiError(404, 'Site not found.');
  await requireSiteAccess(session, site.name);

  const students = await prisma.student.findMany({
    where: { siteId: site.id, active: true },
    orderBy: { number: 'asc' },
    select: { id: true, number: true, name: true, age: true },
  });

  return legacyJson(
    students.map((s) => ({ id: s.id, number: s.number, name: s.name, age: s.age ?? '' }))
  );
});

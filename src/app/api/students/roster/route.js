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
    select: { id: true, name: true, age: true },
  });

  // Legacy parity: the sheet re-sorts alphabetically on every mutation and the
  // roster "number" is simply the row position (GAS returns index + 1). The
  // stored Student.number is only an import-time snapshot for history linking.
  students.sort((a, b) => a.name.localeCompare(b.name));

  return legacyJson(
    students.map((s, i) => ({ id: s.id, number: i + 1, name: s.name, age: s.age ?? '' }))
  );
});

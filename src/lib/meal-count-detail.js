import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/http';
import { requireSiteAccess } from '@/lib/auth';
import { ymdToUtcDate } from '@/lib/dates';

// Shared by the count reader and the PDF export: one submitted count with its
// entries and derived totals, access-checked for the session.
export async function loadMealCountDetail(session, siteName, ymd) {
  if (!siteName || !ymd) throw new ApiError(400, 'Missing site or date parameter.');

  const date = ymdToUtcDate(ymd);
  if (!date) throw new ApiError(400, 'Invalid date.');

  const site = await prisma.site.findUnique({ where: { name: siteName } });
  if (!site) throw new ApiError(404, 'Site not found.');
  await requireSiteAccess(session, site.name);

  const count = await prisma.mealCount.findUnique({
    where: { siteId_date: { siteId: site.id, date } },
    include: {
      entries: { orderBy: { number: 'asc' } },
      corrections: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!count) throw new ApiError(404, 'No meal count was submitted for this date.');

  const totals = { att: 0, brk: 0, lun: 0, snk: 0, sup: 0 };
  for (const entry of count.entries) {
    if (entry.attendance) totals.att += 1;
    if (entry.breakfast) totals.brk += 1;
    if (entry.lunch) totals.lun += 1;
    if (entry.snack) totals.snk += 1;
    if (entry.supper) totals.sup += 1;
  }

  return {
    date: ymd,
    site: site.name,
    timeIn: count.timeIn,
    timeOut: count.timeOut,
    signature: count.signature,
    source: count.source,
    submittedBy: count.submittedByEmail,
    corrected: count.corrections.length > 0,
    corrections: count.corrections.map((c) => ({
      by: c.correctedByEmail,
      at: c.createdAt.toISOString(),
      note: c.note,
    })),
    totals,
    entries: count.entries.map((entry) => ({
      number: entry.number,
      name: entry.name,
      age: entry.age,
      attendance: entry.attendance,
      breakfast: entry.breakfast,
      lunch: entry.lunch,
      snack: entry.snack,
      supper: entry.supper,
    })),
  };
}

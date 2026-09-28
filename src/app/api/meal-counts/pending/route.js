import { prisma } from '@/lib/db';
import { handle, legacyJson } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { dateToYmd } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The approval queue: every count a site filed in this app that nobody has
// approved yet, oldest day first, so the one a site has waited longest for is
// the first one read.
//
// Imported counts are left out on purpose. The previous system had no approval,
// so every one of its days is unapproved, and seven thousand rows would bury the
// handful that are actually waiting (see requirePdfReleased).
export const GET = handle(async () => {
  await requireAdmin();

  const counts = await prisma.mealCount.findMany({
    where: { voidedAt: null, approvedAt: null, source: 'APP', site: { active: true } },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      date: true,
      timeIn: true,
      timeOut: true,
      createdAt: true,
      submittedByEmail: true,
      site: { select: { name: true } },
      _count: { select: { corrections: true } },
    },
  });

  // Totals in one grouped query rather than every entry of every count: the
  // list only needs how many were there and how many ate.
  const totals = new Map();
  if (counts.length) {
    const grouped = await prisma.mealCountEntry.groupBy({
      by: ['mealCountId', 'attendance', 'breakfast', 'lunch', 'snack', 'supper'],
      where: { mealCountId: { in: counts.map((count) => count.id) } },
      _count: true,
    });
    for (const row of grouped) {
      const t = totals.get(row.mealCountId) ?? { att: 0, brk: 0, lun: 0, snk: 0, sup: 0 };
      if (row.attendance) t.att += row._count;
      if (row.breakfast) t.brk += row._count;
      if (row.lunch) t.lun += row._count;
      if (row.snack) t.snk += row._count;
      if (row.supper) t.sup += row._count;
      totals.set(row.mealCountId, t);
    }
  }

  const data = counts.map((count) => ({
    site: count.site.name,
    date: dateToYmd(count.date),
    timeIn: count.timeIn,
    timeOut: count.timeOut,
    submittedAt: count.createdAt.toISOString(),
    submittedBy: count.submittedByEmail,
    corrected: count._count.corrections > 0,
    totals: totals.get(count.id) ?? { att: 0, brk: 0, lun: 0, snk: 0, sup: 0 },
  }));

  return legacyJson({ result: 'success', data });
});

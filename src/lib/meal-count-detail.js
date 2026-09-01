import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/http';
import { requireSiteAccess } from '@/lib/auth';
import { ymdToUtcDate } from '@/lib/dates';

// Each correction stores the snapshot taken right before it ran. Comparing that
// snapshot against the state that followed turns "corrected 3 times" into the
// list of what actually moved, which is the only version of the history anyone
// can act on. Corrections arrive newest first, so what followed correction i is
// the snapshot of correction i - 1, and for the newest one it is the count as it
// stands now.
const TRACKED = [
  ['attendance', 'Attendance'],
  ['breakfast', 'Breakfast'],
  ['lunch', 'Lunch'],
  ['snack', 'Snack'],
  ['supper', 'Supper'],
];

function snapshotOf(count) {
  return {
    timeIn: count.timeIn,
    timeOut: count.timeOut,
    entries: count.entries.map((entry) => ({
      number: entry.number,
      name: entry.name,
      attendance: entry.attendance,
      breakfast: entry.breakfast,
      lunch: entry.lunch,
      snack: entry.snack,
      supper: entry.supper,
    })),
  };
}

function changesBetween(before, after) {
  if (!before || !after) return [];
  const changes = [];

  if (before.timeIn !== after.timeIn) {
    changes.push({ kind: 'time', label: 'Time in', from: before.timeIn, to: after.timeIn });
  }
  if (before.timeOut !== after.timeOut) {
    changes.push({ kind: 'time', label: 'Time out', from: before.timeOut, to: after.timeOut });
  }

  const index = (list) => new Map((list ?? []).map((entry) => [entry.name, entry]));
  const was = index(before.entries);
  const now = index(after.entries);

  for (const [name, entry] of now) {
    const prev = was.get(name);
    if (!prev) {
      changes.push({ kind: 'student', name, added: true });
      continue;
    }
    const flips = TRACKED.filter(([key]) => Boolean(prev[key]) !== Boolean(entry[key])).map(
      ([key, label]) => ({ label, to: Boolean(entry[key]) })
    );
    if (flips.length) changes.push({ kind: 'student', name, flips });
  }
  for (const name of was.keys()) {
    if (!now.has(name)) changes.push({ kind: 'student', name, removed: true });
  }

  return changes;
}

// Shared by the count reader and the PDF export: one submitted count with its
// entries and derived totals, access-checked for the session.
export async function loadMealCountDetail(session, siteName, ymd) {
  if (!siteName || !ymd) throw new ApiError(400, 'Missing site or date parameter.');

  const date = ymdToUtcDate(ymd);
  if (!date) throw new ApiError(400, 'Invalid date.');

  const site = await prisma.site.findUnique({ where: { name: siteName } });
  if (!site) throw new ApiError(404, 'Site not found.');
  await requireSiteAccess(session, site.name);

  const count = await prisma.mealCount.findFirst({
    where: { siteId: site.id, date, voidedAt: null },
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
    approved: count.approvedAt
      ? { at: count.approvedAt.toISOString(), by: count.approvedByEmail }
      : null,
    corrected: count.corrections.length > 0,
    corrections: count.corrections.map((c, i, list) => ({
      by: c.correctedByEmail,
      at: c.createdAt.toISOString(),
      note: c.note,
      // Only the differences travel: the snapshots themselves are the whole
      // roster and would make this response several times larger.
      changes: changesBetween(c.previous, i === 0 ? snapshotOf(count) : list[i - 1].previous),
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

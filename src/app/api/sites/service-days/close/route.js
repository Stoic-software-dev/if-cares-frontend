import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { closeDaysSchema, restoreDaysSchema } from '@/lib/validation';
import { ymdToUtcDate, dateToYmd } from '@/lib/dates';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Closing a month across every site used to be a read and a write per site,
// issued one after the other from the browser: eighty round trips, each one
// rewriting a site's entire calendar to remove twenty days. This does the whole
// thing in one request and one transaction.
//
// POST closes a date range at many sites and answers with the days it removed.
// PUT puts those days back, which is what makes a mistaken close undoable.

async function siteIdsByName(names) {
  const sites = await prisma.site.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true },
  });
  const missing = names.filter((name) => !sites.some((site) => site.name === name));
  if (missing.length) throw new ApiError(404, `Unknown site: ${missing[0]}`);
  return sites;
}

export const POST = handle(async (req) => {
  const session = await requireAdmin();
  const { sites: names, from, to } = closeDaysSchema.parse(await readJsonBody(req));

  const fromDate = ymdToUtcDate(from);
  const toDate = ymdToUtcDate(to);
  if (!fromDate || !toDate) throw new ApiError(422, 'Invalid date range.');
  if (fromDate > toDate) throw new ApiError(422, 'The range ends before it starts.');

  const sites = await siteIdsByName(names);
  const siteIds = sites.map((site) => site.id);
  const nameById = new Map(sites.map((site) => [site.id, site.name]));
  const range = { gte: fromDate, lte: toDate };

  // A day that already carries a count is history and stays open: closing it
  // would strand the count on a day the calendar says never existed.
  const counted = await prisma.mealCount.findMany({
    where: { siteId: { in: siteIds }, date: range },
    select: { siteId: true, date: true },
  });
  const locked = new Set(counted.map((count) => `${count.siteId}|${count.date.getTime()}`));

  const existing = await prisma.serviceDay.findMany({
    where: { siteId: { in: siteIds }, date: range },
  });
  const doomed = existing.filter((day) => !locked.has(`${day.siteId}|${day.date.getTime()}`));

  // Everything needed to put them back, exactly as they were.
  const removed = doomed.map((day) => ({
    site: nameById.get(day.siteId),
    date: dateToYmd(day.date),
    brk: day.brk,
    lunch: day.lunch,
    snk: day.snk,
    sup: day.sup,
  }));

  if (doomed.length) {
    await prisma.serviceDay.deleteMany({ where: { id: { in: doomed.map((day) => day.id) } } });
  }

  await logAudit({
    actor: session.user,
    action: 'site.service_days_close',
    entity: 'site',
    entityId: siteIds.length === 1 ? siteIds[0] : '',
    // The removed days ride along so the operation stays reversible from the
    // audit trail even after the browser that ran it is gone.
    payload: { from, to, sites: names.length, removed: removed.length, days: removed },
  });

  return legacyJson({
    result: 'success',
    closed: removed.length,
    sites: names.length,
    kept: counted.length,
    days: removed,
  });
});

export const PUT = handle(async (req) => {
  const session = await requireAdmin();
  const { days } = restoreDaysSchema.parse(await readJsonBody(req));

  const names = [...new Set(days.map((day) => day.site))];
  const sites = await siteIdsByName(names);
  const idByName = new Map(sites.map((site) => [site.name, site.id]));

  const rows = [];
  for (const day of days) {
    const date = ymdToUtcDate(day.date);
    if (!date) throw new ApiError(422, `Invalid date: ${day.date}`);
    rows.push({
      siteId: idByName.get(day.site),
      date,
      brk: day.brk,
      lunch: day.lunch,
      snk: day.snk,
      sup: day.sup,
    });
  }

  // skipDuplicates keeps a second undo from failing on days that came back some
  // other way in between.
  const { count } = await prisma.serviceDay.createMany({ data: rows, skipDuplicates: true });

  await logAudit({
    actor: session.user,
    action: 'site.service_days_reopen',
    entity: 'site',
    entityId: sites.length === 1 ? sites[0].id : '',
    payload: { sites: names.length, restored: count },
  });

  return legacyJson({ result: 'success', restored: count });
});

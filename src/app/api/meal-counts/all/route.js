import { prisma } from '@/lib/db';
import { handle, legacyJson } from '@/lib/http';
import { requireUser, visibleSites } from '@/lib/auth';
import { dateToYmd } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Legacy `?type=allMeals`: RAW object keyed by site name. validDates = service
// days without a submitted count (with per-meal availability flags), and
// excludedDates = dates already submitted. EVERY visible site must be present as
// a key even when empty — the date picker stays disabled otherwise.
export const GET = handle(async () => {
  const session = await requireUser();
  const sites = await visibleSites(session);
  const siteIds = sites.map((s) => s.id);

  const [serviceDays, counts] = await Promise.all([
    prisma.serviceDay.findMany({ where: { siteId: { in: siteIds } } }),
    prisma.mealCount.findMany({
      where: { siteId: { in: siteIds } },
      select: { siteId: true, date: true },
    }),
  ]);

  const countedBySite = new Map();
  for (const count of counts) {
    if (!countedBySite.has(count.siteId)) countedBySite.set(count.siteId, new Set());
    countedBySite.get(count.siteId).add(dateToYmd(count.date));
  }

  const result = {};
  for (const site of sites) {
    result[site.name] = { validDates: {}, excludedDates: [] };
  }
  const byId = new Map(sites.map((s) => [s.id, s]));

  for (const day of serviceDays) {
    const site = byId.get(day.siteId);
    if (!site) continue;
    const ymd = dateToYmd(day.date);
    if (countedBySite.get(day.siteId)?.has(ymd)) continue;
    result[site.name].validDates[ymd] = {
      brk: day.brk,
      lunch: day.lunch,
      snk: day.snk,
      sup: day.sup,
    };
  }

  for (const [siteId, ymds] of countedBySite) {
    const site = byId.get(siteId);
    if (!site) continue;
    result[site.name].excludedDates = [...ymds].sort();
  }

  return legacyJson(result);
});

import { dateToYmd } from '@/lib/dates';

// The full administrative view of a site, shared by the lookup by id and the
// lookup by name so the two can never drift.
export function toSiteRecord(site) {
  return {
    id: site.id,
    name: site.name,
    active: site.active,
    state: site.state,
    ceName: site.ceName,
    ceId: site.ceId,
    siteName: site.siteName,
    siteNumber: site.siteNumber,
    programStart: site.programStart ? dateToYmd(site.programStart) : '',
    programEnd: site.programEnd ? dateToYmd(site.programEnd) : '',
    reminderStart: site.reminderStart ? dateToYmd(site.reminderStart) : '',
    reminderEnd: site.reminderEnd ? dateToYmd(site.reminderEnd) : '',
    weeklyTemplate: site.weeklyTemplate ?? {},
    students: site._count?.students ?? 0,
    serviceDays: site._count?.serviceDays ?? 0,
    mealCounts: site._count?.mealCounts ?? 0,
  };
}

export const SITE_RECORD_INCLUDE = {
  _count: { select: { students: true, serviceDays: true, mealCounts: true } },
};

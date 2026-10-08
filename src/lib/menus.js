import { prisma } from '@/lib/db';

// Who is looking at the menus (STOIC-2691): administrators and accounts that
// work every site see all of them; everyone else, the menus for every site and
// the ones for the active sites they are assigned to.
export function menuViewer(session) {
  const user = session.user;
  if (user.role === 'ADMIN' || user.allSites) return { all: true, siteIds: new Set() };
  return {
    all: false,
    siteIds: new Set((user.sites ?? []).filter((us) => us.site?.active).map((us) => us.siteId)),
  };
}

// Which sites each menu is for. A file with no rows is for every site and is
// absent from both maps.
export async function menuAudience(fileIds) {
  const bySite = new Map();
  const names = new Map();
  if (!fileIds.length) return { bySite, names };

  const rows = await prisma.menuSite.findMany({
    where: { fileId: { in: fileIds } },
    select: { fileId: true, siteId: true, site: { select: { name: true } } },
  });
  for (const row of rows) {
    if (!bySite.has(row.fileId)) {
      bySite.set(row.fileId, new Set());
      names.set(row.fileId, []);
    }
    bySite.get(row.fileId).add(row.siteId);
    names.get(row.fileId).push(row.site.name);
  }
  for (const list of names.values()) list.sort((a, b) => a.localeCompare(b));
  return { bySite, names };
}

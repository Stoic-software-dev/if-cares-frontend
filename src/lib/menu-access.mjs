// Who sees which menu (STOIC-2691). Plain module, tested with node --test.
//
// audience: Map fileId -> Set of site ids the menu is for. A menu with no entry
// is for every site, which covers every menu published before sites could be
// chosen and any file dropped into the Drive folder by hand.
// viewer: { all: boolean, siteIds: Set } - `all` for administrators and
// accounts that work every site.

export function canSeeMenu(fileId, audience, viewer) {
  if (viewer.all) return true;
  const sites = audience.get(fileId);
  if (!sites || sites.size === 0) return true;
  for (const id of sites) if (viewer.siteIds.has(id)) return true;
  return false;
}

export function menusFor(files, audience, viewer) {
  return files.filter((file) => canSeeMenu(file.id, audience, viewer));
}

// Drive keeps one file per name in the folder, and publishing over a name used
// to replace that file. With menus per site that silently took a menu away from
// the sites it was for, so a name in use is refused instead. Compared the way a
// person reads the list: case, spacing and the extension do not make two menus
// different, since "October Menu" twice on the screen is two of the same thing.
const comparable = (name) =>
  String(name ?? '').replace(/\.[a-z0-9]+$/i, '').trim().toLowerCase().replace(/\s+/g, ' ');

export function findSameName(files, name) {
  const wanted = comparable(name);
  return files.find((file) => comparable(file.name) === wanted) ?? null;
}

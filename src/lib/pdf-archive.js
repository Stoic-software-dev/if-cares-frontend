import { driveConfigured, ensureFolder, findInFolder, reportsFolderId, uploadFile } from '@/lib/google-drive';

// Every PDF the app generates is archived in Drive, in the same folder tree the
// office already browses. One path for all of them: daily counts today, monthly
// and consolidated reports when they ship.
//
//   <reports folder>/<YYYY-MM>/<file>.pdf
//
// Archiving never blocks the person who asked for the document: if Drive is
// down or unconfigured, the PDF is still served and the archive catches up on
// the next request.

/** Drive shows the slash as a path separator in some clients, so names avoid it. */
export function safeName(value) {
  return String(value ?? '')
    .replace(/[/\\]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export const mealCountFileName = (site, date) => `${safeName(site)} ${date}.pdf`;

// How many " (2)", " (3)" … a distinct name will try before giving up. A month
// with this many claims of the same kind is a different problem.
const MAX_DISTINCT_TRIES = 50;

/**
 * Writes `bytes` to `<reports>/<YYYY-MM>/<name>` unless an up to date copy is
 * already there. Returns the Drive file, or null when nothing was written.
 *
 * `distinct` asks for a name nothing else is using: with it, a file already
 * sitting under that name is never overwritten - the document is filed as
 * "… (2).pdf" instead, and the caller stores the name that came back.
 *
 * That option exists because `uploadFile` replaces by name, and a consolidated
 * claim's name is built from its state and month alone. Two claims for the same
 * month - a rebuild, a second one with different sites excluded - were the same
 * name, so the second one silently overwrote the first IN Drive while both rows
 * stayed in the list, and every one of them then downloaded whichever had been
 * written last. A claim signed by one person came back unsigned and covering a
 * different set of sites.
 *
 * Re-archiving the SAME document (a claim being signed) passes the name it was
 * filed under and no `distinct`, so it replaces its own file, which is the
 * behaviour that was always wanted.
 */
export async function archivePdf({ name, bytes, period, freshAs = null, distinct = false }) {
  if (!driveConfigured()) return null;
  const root = reportsFolderId();
  if (!root) return null;

  const folderId = await ensureFolder(period, root);

  // A document that has not changed since it was archived is left alone: the
  // point is one authoritative copy per period, not a new upload per download.
  if (freshAs) {
    const existing = await findInFolder(name, folderId);
    if (existing && new Date(existing.modifiedTime) >= new Date(freshAs)) return null;
  }

  if (distinct) {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : '';
    for (let n = 1; n <= MAX_DISTINCT_TRIES; n += 1) {
      const candidate = n === 1 ? name : `${stem} (${n})${extension}`;
      if (await findInFolder(candidate, folderId)) continue;
      return uploadFile({ name: candidate, folderId, bytes });
    }
    throw new Error(`Too many documents already filed as "${name}".`);
  }

  return uploadFile({ name, folderId, bytes });
}

/**
 * Archives a daily count. `count` is the payload of `loadMealCountDetail`, so
 * the newest correction decides whether the archived copy is still current.
 */
export async function archiveMealCountPdf(count, bytes) {
  const lastChange = count.corrections?.reduce((latest, c) => (c.at > latest ? c.at : latest), '') || null;

  return archivePdf({
    name: mealCountFileName(count.site, count.date),
    bytes,
    period: String(count.date).slice(0, 7),
    // Without corrections the first archived copy is already the final one.
    freshAs: lastChange ?? new Date(0).toISOString(),
  });
}

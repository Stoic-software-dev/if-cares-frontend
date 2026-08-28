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

/**
 * Writes `bytes` to `<reports>/<YYYY-MM>/<name>` unless an up to date copy is
 * already there. Returns the Drive file, or null when nothing was written.
 */
export async function archivePdf({ name, bytes, period, freshAs = null }) {
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

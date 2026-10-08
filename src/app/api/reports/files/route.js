import { prisma } from '@/lib/db';
import { handle, legacyJson, ApiError } from '@/lib/http';
import { requireUser, requireAdmin } from '@/lib/auth';
import { menuViewer, menuAudience } from '@/lib/menus';
import { menusFor, findSameName } from '@/lib/menu-access.mjs';
import {
  listMenus,
  driveConfigured,
  menusFolderId,
  uploadFile,
  trashFile,
  DriveError,
} from '@/lib/google-drive';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The office publishes menus by dropping a PDF into a Drive folder, and this
// reads that folder through the Drive REST API. The legacy Apps Script is only
// used while the service account is missing, so the app keeps working during
// setup; once GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
// exist, GAS is never called again.
const TTL_MS = 10 * 60 * 1000;
const GAS_TIMEOUT_MS = 20_000;

let cache = { at: 0, files: null };

// The Apps Script answers with a Google error page roughly one time in three,
// so the fallback retries before giving up. Drive does not need this.
async function listFromGas() {
  const base = process.env.GAS_BASE_URL;
  if (!base) throw new Error('No GAS base URL');

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${base}?type=listFiles`, {
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(GAS_TIMEOUT_MS),
      });
      const files = JSON.parse(await res.text());
      if (!Array.isArray(files)) throw new Error('Unexpected listing shape');
      return files;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

// The whole folder, cached for everyone. Never filtered before it is cached:
// the cache is shared by every account, and who sees what is decided per
// request below.
async function allMenus(forced) {
  if (!forced && cache.files && Date.now() - cache.at < TTL_MS) return cache.files;
  try {
    const files = driveConfigured() ? await listMenus() : await listFromGas();
    cache = { at: Date.now(), files };
    return files;
  } catch (error) {
    // A stale list beats an error screen: the menus themselves are still read
    // live, so the worst case is one published minutes ago showing up late.
    if (cache.files) return cache.files;
    if (error instanceof DriveError) throw new ApiError(502, error.message);
    throw new ApiError(502, 'The menus service is unavailable.');
  }
}

export const GET = handle(async (req) => {
  const session = await requireUser();

  // A menu removed straight from Drive is invisible to this cache, so the
  // listing keeps showing it for up to the whole TTL and looks broken.
  // `?refresh=1` is the way out for anyone who just changed the folder by hand.
  const forced = new URL(req.url).searchParams.get('refresh') === '1';
  const files = (await allMenus(forced)).map((file) => ({ ...file, id: file.id ?? file.fileId }));

  // Each site sees the menus for every site plus the ones published for it
  // (STOIC-2691). The office sees them all, with who each one is for.
  const audience = await menuAudience(files.map((file) => file.id).filter(Boolean));
  const visible = menusFor(files, audience.bySite, menuViewer(session));
  if (session.user.role !== 'ADMIN') return legacyJson(visible);
  return legacyJson(visible.map((file) => ({ ...file, sites: audience.names.get(file.id) ?? null })));
});

// Publishing a menu used to mean opening Drive and dropping a file in the right
// folder, which is knowledge that lived in one person's head. This puts it in
// the app: same folder, same result, and the listing above refreshes at once
// instead of showing the old set for ten minutes.
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = /\.(pdf|png|jpe?g|gif|webp|docx?|xlsx?|csv)$/i;

export const POST = handle(async (req) => {
  const session = await requireAdmin();
  if (!driveConfigured()) throw new ApiError(503, 'The Drive service account is not configured.');
  const folderId = menusFolderId();
  if (!folderId) throw new ApiError(503, 'No Drive folder is configured for menus.');

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') throw new ApiError(422, 'Choose a file to publish.');
  if (!file.size) throw new ApiError(422, 'That file is empty.');
  if (file.size > MAX_BYTES) {
    throw new ApiError(413, `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 15 MB.`);
  }

  // A name given in the form wins, so the office can publish "October 2026
  // Menu.pdf" without renaming the file first. The extension always comes from
  // the real file, so a rename cannot turn a PDF into something else.
  const original = String(file.name ?? '').trim();
  if (!ALLOWED.test(original)) {
    throw new ApiError(422, 'Menus can be PDF, an image, a Word or Excel document, or a CSV.');
  }
  const extension = original.match(ALLOWED)[0];
  const typed = String(form.get('name') ?? '').trim().replace(/[\\/:*?"<>|]/g, '').replace(ALLOWED, '');
  const name = `${typed || original.replace(ALLOWED, '')}${extension}`;

  // "all", or the names of the sites the menu is for. Asked every time: a menu
  // that lands everywhere because nobody chose is the thing this replaced.
  const chosen = String(form.get('sites') ?? '').trim();
  let siteIds = [];
  if (chosen !== 'all') {
    let parsed;
    try {
      parsed = JSON.parse(chosen || '[]');
    } catch {
      parsed = null;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new ApiError(422, 'Choose the sites this menu is for, or All sites.');
    }
    const names = [...new Set(parsed.map(String))];
    const found = await prisma.site.findMany({ where: { name: { in: names }, active: true }, select: { id: true } });
    if (found.length !== names.length) throw new ApiError(422, 'One of the chosen sites does not exist any more.');
    siteIds = found.map((site) => site.id);
  }

  // Read fresh, not from the cache: a name taken a minute ago has to be seen.
  const existing = findSameName(await listMenus(), name);
  if (existing) {
    const audience = await menuAudience([existing.id]);
    const sites = audience.names.get(existing.id);
    const forWhom = sites ? `for ${sites.length === 1 ? sites[0] : `${sites.length} sites`}` : 'for all sites';
    throw new ApiError(
      409,
      `A menu called "${existing.name.replace(ALLOWED, '')}" is already published ${forWhom}. Use another name, or remove that one first.`
    );
  }

  let uploaded;
  try {
    uploaded = await uploadFile({
      name,
      folderId,
      bytes: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type || 'application/octet-stream',
    });
  } catch (error) {
    if (error instanceof DriveError) throw new ApiError(502, error.message);
    throw error;
  }

  // Without its rows a menu is for every site, so a menu meant for two sites
  // must not stay up if they could not be written: it comes down again.
  try {
    if (siteIds.length) {
      await prisma.menuSite.createMany({ data: siteIds.map((siteId) => ({ fileId: uploaded.id, siteId })) });
    }
  } catch (error) {
    await trashFile(uploaded.id, { folderId }).catch((trashError) => {
      // Left up without its sites it is a menu for everyone: whoever reads the
      // log has to take it down by hand.
      console.error(`[menus] ${uploaded.name} (${uploaded.id}) is up for all sites and could not be removed: ${trashError.message}`);
    });
    throw error;
  }

  // The menu is live the moment it lands, so a stale list would be a lie.
  cache = { at: 0, files: null };
  await logAudit({
    actor: session.user,
    action: 'menu.publish',
    entity: 'menu',
    entityId: uploaded.id,
    payload: { name: uploaded.name, sites: siteIds.length ? siteIds : 'all' },
  });

  return legacyJson({
    result: 'success',
    data: { id: uploaded.id, name: uploaded.name, mimeType: uploaded.mimeType },
  });
});

// Unpublishing. Scoped to the menus folder, so this cannot be pointed at
// anything else the service account can reach, and it trashes rather than
// deletes: the wrong menu removed on a Friday is recoverable.
export const DELETE = handle(async (req) => {
  const session = await requireAdmin();
  if (!driveConfigured()) throw new ApiError(503, 'The Drive service account is not configured.');

  const fileId = new URL(req.url).searchParams.get('fileId');
  if (!fileId) throw new ApiError(400, 'Missing fileId parameter.');

  let trashed;
  try {
    trashed = await trashFile(fileId, { folderId: menusFolderId() });
  } catch (error) {
    if (error instanceof DriveError) throw new ApiError(502, error.message);
    throw error;
  }

  await prisma.menuSite.deleteMany({ where: { fileId } });
  cache = { at: 0, files: null };
  await logAudit({
    actor: session.user,
    action: 'menu.unpublish',
    entity: 'menu',
    entityId: fileId,
    payload: { name: trashed.name },
  });

  return legacyJson({ result: 'success', data: { id: fileId, name: trashed.name } });
});

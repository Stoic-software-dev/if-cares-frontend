import { handle, legacyJson, ApiError } from '@/lib/http';
import { requireUser, requireAdmin } from '@/lib/auth';
import {
  listMenus,
  driveConfigured,
  menusFolderId,
  uploadFile,
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

export const GET = handle(async () => {
  await requireUser();

  if (cache.files && Date.now() - cache.at < TTL_MS) return legacyJson(cache.files);

  try {
    const files = driveConfigured() ? await listMenus() : await listFromGas();
    cache = { at: Date.now(), files };
    return legacyJson(files);
  } catch (error) {
    // A stale list beats an error screen: the menus themselves are still read
    // live, so the worst case is one published minutes ago showing up late.
    if (cache.files) return legacyJson(cache.files);
    if (error instanceof DriveError) throw new ApiError(502, error.message);
    throw new ApiError(502, 'The menus service is unavailable.');
  }
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

  // The menu is live the moment it lands, so a stale list would be a lie.
  cache = { at: 0, files: null };
  await logAudit({ actor: session.user, action: 'menu.publish', entity: 'menu', entityId: uploaded.id });

  return legacyJson({
    result: 'success',
    data: { id: uploaded.id, name: uploaded.name, mimeType: uploaded.mimeType },
  });
});

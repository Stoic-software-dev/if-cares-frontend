import { handle, legacyJson, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { listMenus, driveConfigured, DriveError } from '@/lib/google-drive';

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

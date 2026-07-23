import { handle, legacyJson, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Temporary passthrough to the legacy GAS Drive listing until the native report
// module (Phase 5) replaces it. Keeps the GAS URL server-side and adds auth.
export const GET = handle(async () => {
  await requireUser();
  const base = process.env.GAS_BASE_URL;
  if (!base) throw new ApiError(500, 'Report service is not configured.');

  let files;
  try {
    const res = await fetch(`${base}?type=listFiles`, { redirect: 'follow', cache: 'no-store' });
    files = JSON.parse(await res.text());
  } catch {
    throw new ApiError(502, 'Report service unavailable.');
  }
  return legacyJson(files);
});

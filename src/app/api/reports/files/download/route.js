import { handle, legacyJson, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Temporary passthrough to GAS `?type=downloadSelectedPdf&fileId=` — returns
// {bytes: base64, mimeType, fileName}; the client keeps decoding to a Blob.
export const GET = handle(async (req) => {
  await requireUser();
  const base = process.env.GAS_BASE_URL;
  if (!base) throw new ApiError(500, 'Report service is not configured.');

  const fileId = new URL(req.url).searchParams.get('fileId');
  if (!fileId) throw new ApiError(400, 'Missing fileId parameter.');

  let payload;
  try {
    const res = await fetch(`${base}?type=downloadSelectedPdf&fileId=${encodeURIComponent(fileId)}`, {
      redirect: 'follow',
      cache: 'no-store',
    });
    payload = JSON.parse(await res.text());
  } catch {
    throw new ApiError(502, 'Report service unavailable.');
  }
  return legacyJson(payload);
});

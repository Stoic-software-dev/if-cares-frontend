import { handle, ApiError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { downloadMenu, driveConfigured, DriveError } from '@/lib/google-drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GAS_TIMEOUT_MS = 20_000;

// RFC 5987 encoding: menu names carry spaces, dashes and the odd accent, and
// this form needs no quoting rules of its own.
const dispositionFor = (name, attachment) =>
  `${attachment ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`;

// Drive hands back the file itself, so it is streamed through with its real
// content type instead of the base64 JSON envelope the Apps Script used. The
// browser can then open the URL directly, with no decoding step in the client.
async function fromDrive(fileId, attachment) {
  const { body, name, mimeType } = await downloadMenu(fileId);
  return new Response(body, {
    headers: {
      'content-type': mimeType,
      'content-disposition': dispositionFor(name, attachment),
      'cache-control': 'private, max-age=3600',
    },
  });
}

// Fallback while the service account is not configured yet. Same output shape
// as Drive, so the client only ever sees one contract.
async function fromGas(fileId, attachment) {
  const base = process.env.GAS_BASE_URL;
  if (!base) throw new ApiError(500, 'The menus service is not configured.');

  // The Apps Script answers with a Google error page roughly one time in three,
  // so the fallback retries before giving up. Drive does not need this.
  let payload;
  for (let attempt = 0; attempt < 3 && !payload; attempt++) {
    try {
      const res = await fetch(`${base}?type=downloadSelectedPdf&fileId=${encodeURIComponent(fileId)}`, {
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(GAS_TIMEOUT_MS),
      });
      payload = JSON.parse(await res.text());
    } catch {
      if (attempt === 2) throw new ApiError(502, 'The menus service is unavailable.');
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  if (!payload?.bytes) throw new ApiError(502, 'The menus service returned an empty file.');

  const name = String(payload.fileName || 'Menu.pdf');
  return new Response(Buffer.from(payload.bytes, 'base64'), {
    headers: {
      'content-type': payload.mimeType || 'application/pdf',
      'content-disposition': dispositionFor(name, attachment),
      'cache-control': 'private, max-age=3600',
    },
  });
}

export const GET = handle(async (req) => {
  await requireUser();

  const params = new URL(req.url).searchParams;
  const fileId = params.get('fileId');
  if (!fileId) throw new ApiError(400, 'Missing fileId parameter.');
  // The View button opens the file inline; Download asks for it as an attachment.
  const attachment = params.get('download') === '1';

  try {
    return driveConfigured() ? await fromDrive(fileId, attachment) : await fromGas(fileId, attachment);
  } catch (error) {
    if (error instanceof DriveError) throw new ApiError(502, error.message);
    throw error;
  }
});

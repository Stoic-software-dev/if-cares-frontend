import { randomUUID } from 'node:crypto';
import { SignJWT, importPKCS8 } from 'jose';

// Drive is where every PDF in this product lives: the menus the office
// publishes by hand, and the counts and reports the app generates. Reading it
// used to mean waking the legacy Apps Script (26 s cold start, intermittent
// HTML error pages); this talks to the Drive REST API directly with a service
// account.
//
// There is no SDK here: a handful of endpoints is all it takes, and the JWT is
// signed with `jose`, which was already a dependency.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
// Menus are read and generated PDFs are written, so the scope covers both.
// What the account can actually touch is decided by which folders are shared
// with it: Viewer on the menus folder, Editor on the reports folder.
const SCOPE = 'https://www.googleapis.com/auth/drive';
const TIMEOUT_MS = 20_000;
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class DriveError extends Error {}

// Copying a value out of the service account JSON brings its quotes along, and
// a dashboard field keeps them as part of the value. Stripping one matching
// pair turns the most common misconfiguration into a non event.
const unquote = (value) => {
  const trimmed = value?.trim() ?? '';
  const quoted = trimmed.length > 1 && (trimmed.startsWith('"') || trimmed.startsWith("'"));
  return quoted && trimmed.at(-1) === trimmed[0] ? trimmed.slice(1, -1) : trimmed;
};

function credentials() {
  const email = unquote(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  // Private keys carry newlines, which env vars cannot hold literally, so both
  // the escaped form (what the JSON gives you) and the real one are accepted.
  const privateKey = unquote(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).replace(/\\n/g, '\n');
  if (!email || !privateKey) return null;
  return { email, privateKey };
}

/** True once the service account is configured, which is what retires the GAS fallback. */
export function driveConfigured() {
  return credentials() !== null;
}

/** Folder the office drops menus into. Read only. */
export function menusFolderId() {
  return unquote(process.env.GOOGLE_DRIVE_MENUS_FOLDER_ID);
}

/** Folder the app archives everything it generates into. Needs write access. */
export function reportsFolderId() {
  return unquote(process.env.GOOGLE_DRIVE_REPORTS_FOLDER_ID);
}

// Tokens last an hour; keeping the live one avoids a signing round trip per request.
let token = { value: '', expiresAt: 0 };

async function accessToken() {
  if (token.value && Date.now() < token.expiresAt) return token.value;

  const creds = credentials();
  if (!creds) throw new DriveError('The Drive service account is not configured.');

  let assertion;
  try {
    const key = await importPKCS8(creds.privateKey, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(creds.email)
      .setSubject(creds.email)
      .setAudience(TOKEN_URL)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);
  } catch {
    throw new DriveError('The Drive service account key could not be read.');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload.access_token) {
    throw new DriveError(payload.error_description || 'Drive rejected the service account.');
  }

  token = {
    value: payload.access_token,
    // A minute of margin so a token never expires mid request.
    expiresAt: Date.now() + Math.max(0, (payload.expires_in ?? 3600) - 60) * 1000,
  };
  return token.value;
}

async function request(base, { search, ...init } = {}) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(search ?? {})) url.searchParams.set(key, value);

  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${await accessToken()}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // The full payload names the project and the exact reason, which is what
    // makes a setup problem solvable. It belongs in the log, not in a toast.
    console.warn(`[drive] ${res.status} on ${url.pathname}: ${detail.slice(0, 500)}`);
    throw new DriveError(explain(res.status, detail));
  }
  return res;
}

/**
 * Turns a Drive failure into something that names the cause. A 403 means two
 * very different things: the API is off in the project, or the folder was never
 * shared. Saying the wrong one sends whoever is setting this up down the wrong
 * path, which is exactly what happened the first time.
 */
function explain(status, detail) {
  let reason = '';
  let message = '';
  try {
    const parsed = JSON.parse(detail);
    reason = parsed.error?.errors?.[0]?.reason ?? parsed.error?.status ?? '';
    message = parsed.error?.message ?? '';
  } catch {
    // Google answers HTML when the request never reached the API.
  }

  const account = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || 'the service account';

  if (reason === 'accessNotConfigured' || /has not been used in project|is disabled/i.test(message)) {
    return 'The Drive API is not enabled in the Google Cloud project this service account belongs to. Enable it and retry.';
  }
  if (status === 401 || reason === 'authError') {
    return 'Google rejected the service account credentials. Check the email and the private key.';
  }
  if (status === 404 || reason === 'notFound') {
    return `That folder or file does not exist for ${account}. Check the id, and that the folder was shared with that exact address.`;
  }
  if (status === 403) {
    // Reading a folder that was never shared answers 404, so a 403 is almost
    // always a write against Viewer access. Menus used to be read only, and
    // saying "Viewer is enough for menus" here now sends whoever is publishing
    // one to set exactly the permission that is failing.
    return `${account} is not allowed to do that in Drive. Share the folder with that address as Editor: publishing a menu and archiving a report both write to it.`;
  }
  return `Drive answered ${status}. ${message || detail.slice(0, 200)}`;
}

// Drive queries are single quoted, so a name with an apostrophe has to be
// escaped or the query is malformed.
const quote = (value) => String(value).replace(/'/g, "\\'");

const FILE_FIELDS = 'id, name, mimeType, createdTime, modifiedTime, size, webViewLink';

/** Everything in a folder, following pagination. */
export async function listFolder(folderId, { includeFolders = false } = {}) {
  const clauses = ['trashed = false'];
  if (folderId) clauses.push(`'${quote(folderId)}' in parents`);
  if (!includeFolders) clauses.push(`mimeType != '${FOLDER_MIME}'`);

  const files = [];
  let pageToken;
  do {
    const res = await request(DRIVE_FILES, {
      search: {
        q: clauses.join(' and '),
        fields: `nextPageToken, files(${FILE_FIELDS})`,
        orderBy: 'name',
        pageSize: '200',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        ...(pageToken ? { pageToken } : {}),
      },
    });
    const page = await res.json();
    files.push(...(page.files ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return files;
}

/** One file by exact name inside a folder, or null. */
export async function findInFolder(name, folderId, { folder = false } = {}) {
  const clauses = [
    `name = '${quote(name)}'`,
    `'${quote(folderId)}' in parents`,
    'trashed = false',
    `mimeType ${folder ? '=' : '!='} '${FOLDER_MIME}'`,
  ];
  const res = await request(DRIVE_FILES, {
    search: {
      q: clauses.join(' and '),
      fields: `files(${FILE_FIELDS})`,
      pageSize: '1',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    },
  });
  const { files } = await res.json();
  return files?.[0] ?? null;
}

export async function getMetadata(fileId) {
  const res = await request(`${DRIVE_FILES}/${encodeURIComponent(fileId)}`, {
    search: { fields: `${FILE_FIELDS}, parents, trashed`, supportsAllDrives: 'true' },
  });
  return res.json();
}

/**
 * The raw file, streamed. Callers pipe `body` straight to the browser.
 * `folderId` scopes the download: without it the endpoint would hand out any
 * file the service account can see, not just the ones it is meant to serve.
 */
export async function downloadFile(fileId, { folderId = '' } = {}) {
  const meta = await getMetadata(fileId);
  if (meta.trashed) throw new DriveError('That file is no longer in Drive.');
  if (folderId && !(meta.parents ?? []).includes(folderId)) {
    throw new DriveError('That file is not available here.');
  }

  const res = await request(`${DRIVE_FILES}/${encodeURIComponent(fileId)}`, {
    search: { alt: 'media', supportsAllDrives: 'true' },
  });
  return { body: res.body, name: meta.name, mimeType: meta.mimeType || 'application/pdf' };
}

// Folder ids are stable, so looking the same one up on every write is waste.
const folderCache = new Map();

/** The id of `name` inside `parentId`, creating the folder the first time. */
export async function ensureFolder(name, parentId) {
  const key = `${parentId}/${name}`;
  const cached = folderCache.get(key);
  if (cached) return cached;

  const found = await findInFolder(name, parentId, { folder: true });
  if (found) {
    folderCache.set(key, found.id);
    return found.id;
  }

  const res = await request(DRIVE_FILES, {
    method: 'POST',
    search: { fields: 'id', supportsAllDrives: 'true' },
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  const { id } = await res.json();
  folderCache.set(key, id);
  return id;
}

/**
 * Writes a file into a folder. A file already there under the same name is
 * updated in place rather than duplicated, so regenerating a report keeps one
 * document with its own Drive history instead of littering the folder.
 */
export async function uploadFile({ name, folderId, bytes, mimeType = 'application/pdf' }) {
  if (!folderId) throw new DriveError('No Drive folder is configured for generated files.');
  const body = Buffer.from(bytes);

  const existing = await findInFolder(name, folderId);
  if (existing) {
    const res = await request(`${DRIVE_UPLOAD}/${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      search: { uploadType: 'media', fields: FILE_FIELDS, supportsAllDrives: 'true' },
      headers: { 'content-type': mimeType },
      body,
    });
    return res.json();
  }

  const boundary = `ifc-${randomUUID()}`;
  const metadata = JSON.stringify({ name, parents: [folderId] });
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--`);

  const res = await request(DRIVE_UPLOAD, {
    method: 'POST',
    search: { uploadType: 'multipart', fields: FILE_FIELDS, supportsAllDrives: 'true' },
    headers: { 'content-type': `multipart/related; boundary=${boundary}` },
    body: Buffer.concat([head, body, tail]),
  });
  return res.json();
}

// The menus screen and the legacy contract both read `createdDate`.
export async function listMenus() {
  const files = await listFolder(menusFolderId());
  return files.map((file) => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    createdDate: file.createdTime,
    modifiedDate: file.modifiedTime,
    size: file.size ? Number(file.size) : null,
  }));
}

export function downloadMenu(fileId) {
  return downloadFile(fileId, { folderId: menusFolderId() });
}

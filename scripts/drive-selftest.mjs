/**
 * Exercises the Drive client without touching Drive.
 *
 * The real integration cannot be tested until the service account exists, and
 * the write path is the part nobody notices is broken until a report silently
 * fails to archive. So: a throwaway RSA key, a stubbed fetch, and assertions on
 * exactly what the module would have sent.
 *
 *   node scripts/drive-selftest.mjs
 */
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'menus@ifcares.iam.gserviceaccount.com';
// Written escaped, the way it comes out of the service account JSON.
process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n');
process.env.GOOGLE_DRIVE_MENUS_FOLDER_ID = 'MENUS_FOLDER';
process.env.GOOGLE_DRIVE_REPORTS_FOLDER_ID = 'REPORTS_FOLDER';

const calls = [];
let responder = () => ({});

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.toString();
  calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });

  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  const payload = responder(url, init);
  if (payload instanceof Response) return payload;
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const drive = await import('../src/lib/google-drive.js');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}
const last = () => calls[calls.length - 1];
const query = (name) => new URL(last().url).searchParams.get(name);

check('the account is detected as configured', drive.driveConfigured());

// --- listing -------------------------------------------------------------
responder = () => ({ files: [{ id: 'f1', name: 'Menu.pdf', mimeType: 'application/pdf', createdTime: '2026-01-01T00:00:00Z' }] });
const menus = await drive.listMenus();
check('the token is requested once and reused', calls.filter((c) => c.url.includes('oauth2')).length === 1);
check('the listing is scoped to the menus folder', query('q').includes("'MENUS_FOLDER' in parents"));
check('folders are excluded from the listing', query('q').includes('mimeType != '));
check('the listing keeps the legacy createdDate field', menus[0]?.createdDate === '2026-01-01T00:00:00Z');
check('the bearer token is sent', last().headers.authorization === 'Bearer test-token');

// --- download scoping ----------------------------------------------------
responder = () => ({ id: 'f1', name: 'Menu.pdf', parents: ['SOMEONE_ELSE'], trashed: false });
let denied = false;
try {
  await drive.downloadMenu('f1');
} catch (error) {
  denied = error instanceof drive.DriveError;
}
check('a file outside the menus folder is refused', denied);

// --- names with apostrophes ---------------------------------------------
responder = () => ({ files: [] });
await drive.findInFolder("Mary's Site 2026-08-04.pdf", 'REPORTS_FOLDER');
check('apostrophes in a name are escaped for the query', query('q').includes("Mary\\'s Site"));

// --- ensureFolder --------------------------------------------------------
calls.length = 0;
responder = (url, init) => (init.method === 'POST' ? { id: 'PERIOD_FOLDER' } : { files: [] });
const created = await drive.ensureFolder('2026-08', 'REPORTS_FOLDER');
check('a missing period folder is created', created === 'PERIOD_FOLDER');
check('the folder is created under the reports folder', JSON.parse(calls[calls.length - 1].body).parents[0] === 'REPORTS_FOLDER');
const before = calls.length;
await drive.ensureFolder('2026-08', 'REPORTS_FOLDER');
check('the folder id is cached, not looked up again', calls.length === before);

// --- upload: create ------------------------------------------------------
calls.length = 0;
responder = (url, init) => (init.method === 'POST' ? { id: 'NEW', name: 'Count.pdf' } : { files: [] });
const bytes = Buffer.from('%PDF-1.7 pretend document');
await drive.uploadFile({ name: 'Count.pdf', folderId: 'PERIOD_FOLDER', bytes });
const create = last();
const boundary = create.headers['content-type'].split('boundary=')[1];
const raw = create.body.toString('latin1');
check('a new file is created with multipart', new URL(create.url).searchParams.get('uploadType') === 'multipart');
check('the multipart body opens and closes on the boundary', raw.startsWith(`--${boundary}`) && raw.endsWith(`--${boundary}--`));
check('the metadata names the parent folder', raw.includes('"parents":["PERIOD_FOLDER"]'));
check('the file bytes survive intact', raw.includes(bytes.toString('latin1')));
check('the declared content type is pdf', raw.includes('Content-Type: application/pdf'));

// --- upload: replace -----------------------------------------------------
calls.length = 0;
responder = (url, init) =>
  init.method === 'PATCH' ? { id: 'OLD', name: 'Count.pdf' } : { files: [{ id: 'OLD', name: 'Count.pdf', modifiedTime: '2026-08-05T00:00:00Z' }] };
await drive.uploadFile({ name: 'Count.pdf', folderId: 'PERIOD_FOLDER', bytes });
check('an existing file is updated, not duplicated', last().method === 'PATCH' && last().url.includes('/OLD'));
check('the update sends the raw media', new URL(last().url).searchParams.get('uploadType') === 'media');
check('the update body is the bytes themselves', Buffer.compare(last().body, bytes) === 0);

// --- error mapping -------------------------------------------------------
responder = () => new Response('nope', { status: 403 });
let forbidden = '';
try {
  await drive.listFolder('REPORTS_FOLDER');
} catch (error) {
  forbidden = error.message;
}
check('a 403 explains the folder has to be shared', forbidden.includes('Share it with the service account'));

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);

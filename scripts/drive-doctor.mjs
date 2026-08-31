/**
 * Says exactly why Drive is refusing, using the real credentials in .env.
 *
 * The app maps Drive failures to short messages for the user; this prints what
 * Google actually answered, which is the part that names the problem.
 *
 *   node scripts/drive-doctor.mjs
 *
 * Never prints the private key.
 */
import { readFileSync } from 'node:fs';
import { SignJWT, importPKCS8 } from 'jose';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

const unquote = (value) => {
  const trimmed = value?.trim() ?? '';
  const quoted = trimmed.length > 1 && (trimmed.startsWith('"') || trimmed.startsWith("'"));
  return quoted && trimmed.at(-1) === trimmed[0] ? trimmed.slice(1, -1) : trimmed;
};

const email = unquote(env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
const rawKey = unquote(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
const privateKey = rawKey.replace(/\\n/g, '\n');
const menusFolder = unquote(env.GOOGLE_DRIVE_MENUS_FOLDER_ID);
const reportsFolder = unquote(env.GOOGLE_DRIVE_REPORTS_FOLDER_ID);

console.log('--- configuration ---');
console.log('service account :', email || '(missing)');
console.log('private key     :', privateKey
  ? `${privateKey.startsWith('-----BEGIN PRIVATE KEY-----') ? 'PKCS8 header ok' : 'UNEXPECTED HEADER'}, ${privateKey.split('\n').length} lines, ${privateKey.length} chars`
  : '(missing)');
console.log('menus folder    :', menusFolder || '(missing)');
console.log('reports folder  :', reportsFolder || '(missing)');

if (!email || !privateKey) process.exit(1);

console.log('\n--- token ---');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const now = Math.floor(Date.now() / 1000);
const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/drive' })
  .setProtectedHeader({ alg: 'RS256' })
  .setIssuer(email)
  .setSubject(email)
  .setAudience(TOKEN_URL)
  .setIssuedAt(now)
  .setExpirationTime(now + 3600)
  .sign(await importPKCS8(privateKey, 'RS256'));

const tokenRes = await fetch(TOKEN_URL, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
});
const tokenBody = await tokenRes.json();
if (!tokenRes.ok) {
  console.log('FAILED', tokenRes.status, JSON.stringify(tokenBody));
  process.exit(1);
}
console.log('ok, expires in', tokenBody.expires_in, 's');
const token = tokenBody.access_token;

async function probe(label, url) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (res.ok) {
    console.log(`\n${label}: ok`);
    console.log(text.slice(0, 600));
    return;
  }
  let reason = text;
  try {
    const parsed = JSON.parse(text);
    const first = parsed.error?.errors?.[0];
    reason = [parsed.error?.message, first?.reason && `reason=${first.reason}`].filter(Boolean).join(' | ');
  } catch {
    // Google sometimes answers HTML; the first line is enough to recognise it.
    reason = text.split('\n')[0].slice(0, 200);
  }
  console.log(`\n${label}: ${res.status}`);
  console.log(reason);
}

await probe(
  'who am I (drive/about)',
  'https://www.googleapis.com/drive/v3/about?fields=user,storageQuota'
);

if (menusFolder) {
  await probe(
    'menus folder metadata',
    `https://www.googleapis.com/drive/v3/files/${menusFolder}?fields=id,name,mimeType,owners(emailAddress),driveId&supportsAllDrives=true`
  );
  await probe(
    'menus folder listing',
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${menusFolder}' in parents and trashed = false`)}&fields=files(id,name,mimeType)&supportsAllDrives=true&includeItemsFromAllDrives=true`
  );
}

if (reportsFolder) {
  await probe(
    'reports folder metadata',
    `https://www.googleapis.com/drive/v3/files/${reportsFolder}?fields=id,name,mimeType,capabilities(canAddChildren),driveId&supportsAllDrives=true`
  );
}

await probe(
  'everything shared with this account',
  'https://www.googleapis.com/drive/v3/files?fields=files(id,name,mimeType)&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true'
);

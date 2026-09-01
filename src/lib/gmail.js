import { SignJWT, importPKCS8 } from 'jose';

// Sending mail as IF Cares, through the Workspace of ifcares.org.
//
// A service account has no mailbox of its own, so it impersonates a real one:
// the JWT carries `sub`, and a Workspace super admin has to authorize the
// account's client id for the `gmail.send` scope under domain wide delegation.
// Until that exists, `mailConfigured()` is false and every caller degrades
// instead of failing: the app is usable without mail, it just cannot notify.
//
// The Drive scope deliberately does NOT travel in this token. Impersonation
// applies to the whole token, so mail gets its own.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const TIMEOUT_MS = 20_000;

export class MailError extends Error {}

const unquote = (value) => {
  const trimmed = value?.trim() ?? '';
  const quoted = trimmed.length > 1 && (trimmed.startsWith('"') || trimmed.startsWith("'"));
  return quoted && trimmed.at(-1) === trimmed[0] ? trimmed.slice(1, -1) : trimmed;
};

function credentials() {
  const email = unquote(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = unquote(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).replace(/\\n/g, '\n');
  // The mailbox being sent as. Without it there is nobody to impersonate.
  const sender = unquote(process.env.MAIL_FROM);
  if (!email || !privateKey || !sender) return null;
  return { email, privateKey, sender };
}

export function mailConfigured() {
  return credentials() !== null;
}

export function mailFrom() {
  return unquote(process.env.MAIL_FROM);
}

let token = { value: '', expiresAt: 0 };

async function accessToken() {
  if (token.value && Date.now() < token.expiresAt) return token.value;

  const creds = credentials();
  if (!creds) throw new MailError('Email sending is not configured.');

  let assertion;
  try {
    const key = await importPKCS8(creds.privateKey, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(creds.email)
      // The mailbox to send as. This is the part domain wide delegation grants.
      .setSubject(creds.sender)
      .setAudience(TOKEN_URL)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);
  } catch {
    throw new MailError('The service account key could not be read.');
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
    const reason = payload.error_description || payload.error || '';
    // Google reports the two ways this fails in words nobody can act on, and
    // they need opposite fixes. "Invalid email or User ID" means the mailbox
    // does not exist at all; "unauthorized_client" means it does exist but this
    // service account was never authorized to send as it. Handing the raw
    // string to an admin clicking Send sends them down the wrong path.
    if (/invalid[ _]email or user ?id/i.test(reason)) {
      throw new MailError(
        `There is no mailbox ${creds.sender} in the Workspace. MAIL_FROM has to name a real, licensed user before anything can be sent as it.`
      );
    }
    if (/unauthorized_client|access_denied/i.test(reason)) {
      throw new MailError(
        `${creds.sender} exists, but ${creds.email} is not allowed to send as it. A Workspace admin has to authorize that service account's client id for ${SCOPE} under domain wide delegation.`
      );
    }
    throw new MailError(reason || 'Google rejected the service account.');
  }

  token = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(0, (payload.expires_in ?? 3600) - 60) * 1000,
  };
  return token.value;
}

// RFC 2047 for the subject: menu names and site names carry accents, and a raw
// header would arrive mangled.
const encodeHeader = (value) =>
  /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

function buildMime({ to, cc, subject, html, text, attachments = [] }) {
  const boundary = `ifc-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const lines = [
    `From: ${mailFrom()}`,
    `To: ${to.join(', ')}`,
    ...(cc?.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
  ];

  if (!attachments.length) {
    lines.push('Content-Type: text/html; charset=UTF-8', '', html ?? text ?? '');
    return Buffer.from(lines.join('\r\n'), 'utf8');
  }

  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`);
  lines.push('Content-Type: text/html; charset=UTF-8', '', html ?? text ?? '', '');

  const parts = [Buffer.from(lines.join('\r\n'), 'utf8')];
  for (const file of attachments) {
    const head = [
      `--${boundary}`,
      `Content-Type: ${file.mimeType ?? 'application/pdf'}; name="${file.name}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${file.name}"`,
      '',
      '',
    ].join('\r\n');
    parts.push(Buffer.from(head, 'utf8'));
    // Base64 in 76 character lines, which is what mail clients expect.
    parts.push(Buffer.from(Buffer.from(file.bytes).toString('base64').replace(/(.{76})/g, '$1\r\n'), 'utf8'));
    parts.push(Buffer.from('\r\n', 'utf8'));
  }
  parts.push(Buffer.from(`--${boundary}--`, 'utf8'));

  return Buffer.concat(parts);
}

/**
 * Sends one message. Recipients are addresses; attachments are
 * `{ name, bytes, mimeType }`.
 */
export async function sendMail({ to, cc = [], subject, html, text, attachments = [] }) {
  const recipients = (Array.isArray(to) ? to : [to]).map((value) => String(value).trim()).filter(Boolean);
  if (!recipients.length) throw new MailError('No recipient.');

  const raw = buildMime({ to: recipients, cc, subject, html, text, attachments })
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ raw }),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.warn(`[mail] ${res.status}: ${detail.slice(0, 400)}`);
    if (res.status === 403) {
      throw new MailError('Gmail refused the send. Check that the Gmail API is enabled and delegation is authorized.');
    }
    throw new MailError(`Gmail answered ${res.status}.`);
  }

  return res.json();
}

/** Splits and validates a comma separated recipient list from a form. */
export function parseRecipients(value) {
  const parts = String(value ?? '')
    .split(/[,;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const valid = [];
  const invalid = [];
  for (const part of parts) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)) valid.push(part);
    else invalid.push(part);
  }
  return { valid: [...new Set(valid)], invalid };
}

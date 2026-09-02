import { prisma } from '@/lib/db';
import { mailConfigured, sendMail, parseRecipients } from '@/lib/gmail';
import { requestReceived } from '@/lib/mail-templates';
import { notifyFailure } from '@/lib/alerts';

// Who hears about a new request.
//
// STOIC-2205 says the notice has to keep going "a los mismos destinatarios que
// hoy", and today is hardcoded in the Apps Script: kenya@ifcares.org with
// marisela@ifcares.org copied. Those are the defaults, so the day this replaces
// the old app nothing changes for either of them. They are settings rather than
// constants because the same card asks for recipients to be editable from Admin,
// and because the alternative is that the day Kenya's address changes, somebody
// has to deploy.
const KEY = 'requests.notify';
const LEGACY_TO = ['kenya@ifcares.org'];
const LEGACY_CC = ['marisela@ifcares.org'];

export async function readRequestNotifySettings() {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return { enabled: true, to: LEGACY_TO, cc: LEGACY_CC };
  try {
    const saved = JSON.parse(row.value);
    return {
      enabled: saved.enabled ?? true,
      to: Array.isArray(saved.to) ? saved.to : LEGACY_TO,
      cc: Array.isArray(saved.cc) ? saved.cc : LEGACY_CC,
    };
  } catch {
    return { enabled: true, to: LEGACY_TO, cc: LEGACY_CC };
  }
}

export async function writeRequestNotifySettings(patch) {
  const current = await readRequestNotifySettings();
  const next = { ...current };

  if (patch.enabled !== undefined) next.enabled = Boolean(patch.enabled);
  for (const field of ['to', 'cc']) {
    if (patch[field] === undefined) continue;
    const raw = Array.isArray(patch[field]) ? patch[field].join(',') : patch[field];
    const { valid, invalid } = parseRecipients(raw);
    if (invalid.length) throw new Error(`Not an email address: ${invalid[0]}`);
    next[field] = valid;
  }

  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

/**
 * Tells IF Cares a request arrived.
 *
 * Never awaited by the caller and never able to fail the request itself: a site
 * asking for sporks must not get an error because a mailbox is down. A failure
 * goes to the alert address instead, which is the only way anyone would find
 * out that the inbox stopped being announced.
 */
export async function notifyNewRequest({ request, site, requestedBy, link }) {
  try {
    const settings = await readRequestNotifySettings();
    if (!settings.enabled || !mailConfigured()) return;
    if (!settings.to.length) return;

    const message = requestReceived({
      site,
      type: request.type,
      value: request.amount ?? request.time ?? '',
      note: request.note ?? '',
      requestedBy,
      when: new Date(request.createdAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      link,
    });

    await sendMail({ to: settings.to, cc: settings.cc, ...message });
  } catch (error) {
    await notifyFailure({
      area: 'New request notification',
      error,
      context: { site, type: request?.type },
    });
  }
}

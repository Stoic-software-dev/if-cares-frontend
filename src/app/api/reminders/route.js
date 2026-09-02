import { appBaseUrl, handle, readJsonBody, requireObjectBody, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { mailConfigured, parseRecipients } from '@/lib/gmail';
import { readRequestNotifySettings, writeRequestNotifySettings } from '@/lib/request-notify';
import {
  SETTINGS_KEY,
  overdueRecipients,
  readLastPing,
  readSettings,
  runReminders,
  touchLastPing,
  writeSettings,
} from '@/lib/reminders-run';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The daily nudge for counts that were not filed. Who gets it, at what hour and
// whether it runs at all are settings an administrator changes without a deploy,
// which is the whole point of the requirement: the old system needed a developer
// to edit an Apps Script trigger.
//
// The schedule is owned by the server itself (`src/lib/reminder-scheduler.js`),
// which calls the same function this route calls. The route stays because an
// external scheduler holding the shared secret is still a supported way in, and
// because it is how the screen previews a run.

export const GET = handle(async () => {
  await requireAdmin();
  const settings = await readSettings();
  return legacyJson({
    result: 'success',
    data: {
      ...settings,
      mailReady: mailConfigured(),
      lastPingAt: await readLastPing(),
      // The other thing this screen owns: who hears about a new request.
      requestNotify: await readRequestNotifySettings(),
    },
  });
});

export const PATCH = handle(async (req) => {
  const session = await requireAdmin();
  const body = requireObjectBody(await readJsonBody(req));

  const settings = await readSettings();
  const next = { ...settings };

  if (body.enabled !== undefined) next.enabled = Boolean(body.enabled);
  if (body.hour !== undefined) {
    const hour = Number(body.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new ApiError(422, 'Pick an hour of the day.');
    next.hour = hour;
  }
  if (body.lookBackDays !== undefined) {
    const days = Number(body.lookBackDays);
    if (!Number.isInteger(days) || days < 1 || days > 14) throw new ApiError(422, 'Look back between 1 and 14 days.');
    next.lookBackDays = days;
  }
  if (body.copyTo !== undefined) {
    const { valid, invalid } = parseRecipients(Array.isArray(body.copyTo) ? body.copyTo.join(',') : body.copyTo);
    if (invalid.length) throw new ApiError(422, `Not an email address: ${invalid[0]}`);
    next.copyTo = valid;
  }

  await writeSettings(next);

  // The request notice lives on the same screen, so it is saved by the same
  // call rather than by a second endpoint that does one field.
  let requestNotify;
  if (body.requestNotify !== undefined) {
    try {
      requestNotify = await writeRequestNotifySettings(body.requestNotify);
    } catch (error) {
      throw new ApiError(422, error.message);
    }
  } else {
    requestNotify = await readRequestNotifySettings();
  }

  await logAudit({
    actor: session.user,
    action: 'reminders.update',
    entity: 'setting',
    entityId: SETTINGS_KEY,
    payload: { ...next, ...(body.requestNotify !== undefined ? { requestNotify } : {}) },
  });

  return legacyJson({ result: 'success', data: { ...next, requestNotify } });
});

// Called by an external scheduler, or by the screen for a preview. Guarded by a
// shared secret rather than a session, because a cron has no session; without
// the secret configured it refuses instead of running open.
export const POST = handle(async (req) => {
  const secret = process.env.REMINDERS_SECRET;
  const provided = req.headers.get('x-reminders-secret');
  const url = new URL(req.url);
  const preview = url.searchParams.get('preview') === '1';

  if (preview) {
    await requireAdmin();
    const settings = await readSettings();
    const { since, overdue, messages } = await overdueRecipients(settings);
    return legacyJson({
      result: 'success',
      data: {
        since,
        overdueDays: overdue.length,
        recipients: [...new Set(messages.map((message) => message.to))].length,
        sample: messages.slice(0, 5).map((message) => ({ to: message.to, site: message.site, date: message.date })),
        mailReady: mailConfigured(),
      },
    });
  }

  if (!secret) throw new ApiError(503, 'Reminders are not configured to run.');
  if (provided !== secret) throw new ApiError(401, 'Bad reminder secret.');
  // Every real call leaves a mark, before any of the reasons this run might do
  // nothing. A reminder that stops arriving looks exactly like a reminder with
  // nothing to say, and the difference matters: three missed days pauses a
  // site's meal delivery.
  await touchLastPing();

  const result = await runReminders({
    force: url.searchParams.get('force') === '1',
    baseUrl: appBaseUrl(req),
  });
  return legacyJson({ result: 'success', ...result });
});

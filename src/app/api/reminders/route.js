import { handle, readJsonBody, requireObjectBody, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { mailConfigured, mailRedirect } from '@/lib/gmail';
import { readRequestNotifySettings, writeRequestNotifySettings } from '@/lib/request-notify';
import { SETTINGS_KEY, readSettings, writeSettings } from '@/lib/reminders-run';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The daily nudge for counts that were not filed. Who gets it, at what hour and
// whether it runs at all are settings an administrator changes without a deploy,
// which is the whole point of the requirement: the old system needed a developer
// to edit an Apps Script trigger.
//
// The schedule is owned by the server itself (`src/lib/reminder-scheduler.js`),
// and that is the only thing that sends. This route only reads and writes the
// settings behind it.

export const GET = handle(async () => {
  await requireAdmin();
  const settings = await readSettings();
  return legacyJson({
    result: 'success',
    data: {
      ...settings,
      mailReady: mailConfigured(),
      // While this is set nothing reaches a real recipient. It has to be visible
      // on the screen that owns sending, or somebody turns the reminders on at
      // cutover and wonders why nobody got one.
      mailRedirectedTo: mailRedirect(),
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

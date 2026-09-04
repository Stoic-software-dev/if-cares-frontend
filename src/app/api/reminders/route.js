import { handle, readJsonBody, requireObjectBody, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { mailConfigured, mailRedirect } from '@/lib/gmail';
import { alertsConfigured } from '@/lib/alerts';
import { readRequestNotifySettings, writeRequestNotifySettings } from '@/lib/request-notify';
import {
  SETTINGS_KEY,
  overdueRecipients,
  readLastPing,
  readLastRunDay,
  readSettings,
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
// and that is the only thing that sends. This route reads and writes the
// settings, and previews a run without sending.

export const GET = handle(async () => {
  await requireAdmin();
  const settings = await readSettings();
  return legacyJson({
    result: 'success',
    data: {
      ...settings,
      mailReady: mailConfigured(),
      // Two more things that decide whether a reminder can ever arrive, and
      // which nothing on this screen used to say.
      //
      // The scheduler refuses to run without APP_URL, because every reminder is
      // a link to the day that needs filing and sixty messages whose only button
      // is broken are worse than none. It refuses QUIETLY: `lastPingAt` is
      // stamped before that check, so the screen shows a fresh heartbeat while
      // nothing has been sent. And the failure it reports goes to ALERT_EMAILS,
      // which when empty means it goes nowhere at all.
      //
      // Turning reminders on and watching nothing happen is precisely the
      // failure this feature exists to prevent, so the screen has to be able to
      // say why.
      schedulerReady: Boolean(process.env.APP_URL),
      alertsReady: alertsConfigured(),
      // While this is set nothing reaches a real recipient. It has to be visible
      // on the screen that owns sending, or somebody turns the reminders on at
      // cutover and wonders why nobody got one.
      mailRedirectedTo: mailRedirect(),
      lastPingAt: await readLastPing(),
      // Checking and sending are different facts, and only one of them is what
      // an administrator actually wants to know.
      lastRunDay: await readLastRunDay(),
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

// The preview: the same search the reminder does, sending nothing.
//
// This used to be two endpoints in one - a preview for the screen, and a way for
// an external cron holding a shared secret to trigger a real run. That cron was
// replaced by the server's own scheduler because it kept dying quietly, and
// nothing has called the secret path since. What it left behind was a second way
// to send sixty emails, guarded by a token sitting in the environment. One
// sender is easier to reason about than two, and the one that remains is the one
// this screen can actually see.
export const POST = handle(async () => {
  await requireAdmin();
  const settings = await readSettings();
  const { since, overdue, messages } = await overdueRecipients(settings);
  return legacyJson({
    result: 'success',
    data: {
      since,
      overdueDays: overdue.length,
      recipients: messages.length,
      sample: messages.slice(0, 5).map((message) => ({
        to: message.to,
        days: message.days.length,
        first: message.days[0],
      })),
      mailReady: mailConfigured(),
    },
  });
});

import { runReminders, touchLastPing } from '@/lib/reminders-run';
import { notifyFailure } from '@/lib/alerts';

// The server schedules its own reminders.
//
// This used to be a second Railway service running `curl` on a cron. It worked
// exactly twice and then went quiet for hours with the deployment still marked
// healthy, which is the failure this whole feature exists to prevent: three
// consecutive days without a count pauses a site's meal delivery, and a
// scheduler that stops looks precisely like a week with nothing to report.
//
// Owning the schedule in the process the reminders already run in removes the
// parts that were failing: a second service to keep alive, a shared secret sat
// in a start command in plain text, and an HTTP call the app made to itself.
// The route still accepts an external trigger, so nothing that worked before
// stops working.
//
// The tick is deliberately more often than hourly and does almost nothing most
// of the time: `runReminders` compares the local hour in APP_TIMEZONE against
// the administrator's setting and returns immediately unless they match. That
// keeps the hour in the screen, survives daylight saving, and means a restart
// at 8:59 does not skip the nine o'clock send.

const TICK_MS = 5 * 60 * 1000;

// A module is evaluated once per process, but a dev server reloading modules and
// a double-invoked instrumentation hook would both start a second timer. Hanging
// the flag off globalThis is what survives that.
const FLAG = Symbol.for('ifcares.reminderScheduler');

async function tick() {
  try {
    await touchLastPing();

    // Every reminder is a link to the day that needs filing, and the scheduler
    // has no request to derive the address from. Sending sixty messages whose
    // only button is broken is worse than sending none, and it is the kind of
    // wrong that looks fine from here: the send succeeds, the log says sixty.
    const baseUrl = process.env.APP_URL?.replace(/\/$/, '') || '';
    if (!baseUrl) {
      await notifyFailure({
        area: 'Reminder scheduler',
        error: new Error('APP_URL is not set, so the reminder links would point nowhere.'),
      }).catch(() => {});
      return;
    }

    // Once a day is enforced inside runReminders, against a date stored in the
    // database. In the process it would not survive the restart that is exactly
    // when double sending happens.
    const result = await runReminders({ baseUrl });

    if (result.skipped) return;

    console.log(
      `[reminders] ${result.sent} sent, ${result.failed} failed, ${result.overdue} overdue days`
    );
  } catch (error) {
    // Never let a bad tick kill the timer: the next one is five minutes away and
    // the usual cause (the database briefly unreachable) fixes itself.
    console.warn(`[reminders] tick failed: ${error.message}`);
    await notifyFailure({ area: 'Reminder scheduler', error }).catch(() => {});
  }
}

export function startReminderScheduler() {
  if (globalThis[FLAG]) return false;
  globalThis[FLAG] = true;

  // Not on the first tick immediately: boot is busy, and a reminder five minutes
  // late is a reminder on time.
  const timer = setInterval(tick, TICK_MS);
  // Node keeps the process alive for a pending timer; the server has its own
  // reason to stay up and this should not be one of them.
  timer.unref?.();

  console.log(`[reminders] scheduler started, checking every ${TICK_MS / 60000} minutes`);
  return true;
}

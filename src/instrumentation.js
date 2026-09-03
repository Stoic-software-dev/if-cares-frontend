// Runs once when the server boots. The only thing here is the reminder
// scheduler, which needs a long lived process and the Node runtime.
//
// Next 14 does not actually call this at boot: it calls it on the first request.
// Measured on 3 September, the server was ready at 15:35:42 and this ran at
// 16:47:49, when somebody finally opened the app. For a reminder that exists to
// chase sites which did NOT use the app, waiting for someone to use the app is
// circular, and on a quiet day it never resolves.
//
// What closes it is the platform healthcheck: Railway is configured to hit
// /api/health on every boot, and that first request is what arms this. Verified
// by redeploying and touching nothing - the scheduler now starts in the same
// second the server reports ready.
//
// So the healthcheck path is not decoration. Remove it and the reminders go back
// to depending on foot traffic. The heartbeat on the Reminder emails screen is
// what would show it.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startReminderScheduler } = await import('@/lib/reminder-scheduler');
  startReminderScheduler();
}

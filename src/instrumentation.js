// Runs once when the server boots. The only thing here is the reminder
// scheduler, which needs a long lived process and the Node runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startReminderScheduler } = await import('@/lib/reminder-scheduler');
  startReminderScheduler();
}

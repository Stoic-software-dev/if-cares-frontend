import { prisma } from '@/lib/db';
import { mailConfigured, sendMail } from '@/lib/gmail';
import { countOverdue } from '@/lib/mail-templates';
import { dateToYmd, localHour, todayYmd } from '@/lib/dates';
import { notifyFailure } from '@/lib/alerts';
import { applyHolidays, loadHolidays } from '@/lib/holidays';
import { logAudit } from '@/lib/audit';

// The daily nudge for counts that were not filed, as a plain function.
//
// It lives here rather than in the route because two callers need it: the route,
// for an external scheduler holding the shared secret, and the server's own
// scheduler, which has no request and no business making an HTTP call to itself
// carrying a secret it already trusts.

export const SETTINGS_KEY = 'reminders';
const LAST_PING_KEY = 'reminders.lastPing';
// The program day a run last completed on. In the database rather than in the
// process because the guard has to survive a restart: two things depend on it,
// and both are the difference between a reminder and a mistake. It stops a
// second tick inside the sending hour from mailing sixty people twice, and it
// stops a redeploy at 9:02 from doing the same.
const LAST_RUN_KEY = 'reminders.lastRunDay';

export const DEFAULTS = {
  enabled: false,
  hour: 9, // local hour in APP_TIMEZONE
  // How many days back to look. One means "yesterday", which is what the old
  // system did.
  lookBackDays: 1,
};

export async function readSettings() {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writeSettings(next) {
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
}

/** When the scheduler last got as far as this code with a valid trigger. */
export async function touchLastPing() {
  const now = new Date().toISOString();
  await prisma.appSetting.upsert({
    where: { key: LAST_PING_KEY },
    create: { key: LAST_PING_KEY, value: now },
    update: { value: now },
  });
}

export async function readLastPing() {
  const row = await prisma.appSetting.findUnique({ where: { key: LAST_PING_KEY } });
  return row?.value ?? null;
}

export async function readLastRunDay() {
  const row = await prisma.appSetting.findUnique({ where: { key: LAST_RUN_KEY } });
  return row?.value ?? '';
}

async function markRanToday(ymd) {
  await prisma.appSetting.upsert({
    where: { key: LAST_RUN_KEY },
    create: { key: LAST_RUN_KEY, value: ymd },
    update: { value: ymd },
  });
}

// The reminder window a site carries: outside it, nobody there is nagged. A site
// with no window configured is always in - the legacy skipped those, and an
// empty cell is too quiet a way to switch off a site whose meals stop after
// three missed days.
function withinReminderWindow(site, today) {
  const start = site.reminderStart ? dateToYmd(site.reminderStart) : '';
  const end = site.reminderEnd ? dateToYmd(site.reminderEnd) : '';
  if (!start || !end) return true;
  return today >= start && today <= end;
}

/**
 * Who is overdue right now, and who would hear about it. Used both by the run
 * and by the preview, so what an administrator sees before turning it on is
 * exactly what would go out.
 */
export async function overdueRecipients(settings) {
  const today = todayYmd();
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - settings.lookBackDays);
  const fromYmd = dateToYmd(from);

  const [days, counts, holidays, users] = await Promise.all([
    prisma.serviceDay.findMany({
      where: { date: { gte: from, lt: new Date(`${today}T00:00:00Z`) }, site: { active: true } },
      include: {
        site: { select: { id: true, name: true, reminderStart: true, reminderEnd: true } },
      },
    }),
    prisma.mealCount.findMany({
      where: { date: { gte: from }, voidedAt: null },
      select: { siteId: true, date: true },
    }),
    loadHolidays({ from, to: new Date(`${today}T00:00:00Z`) }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, allSites: true, sites: { select: { siteId: true } } },
    }),
  ]);

  const filed = new Set(counts.map((count) => `${count.siteId}|${dateToYmd(count.date)}`));

  const overdue = [];
  for (const day of days) {
    const ymd = dateToYmd(day.date);
    if (filed.has(`${day.siteId}|${ymd}`)) continue;
    if (!withinReminderWindow(day.site, today)) continue;
    const { meals } = applyHolidays(
      { brk: day.brk, lunch: day.lunch, snk: day.snk, sup: day.sup },
      holidays,
      day.siteId,
      ymd
    );
    if (!meals) continue; // a holiday is not overdue
    overdue.push({ siteId: day.siteId, site: day.site.name, date: ymd });
  }

  // One message per person, carrying every day they are behind on - not one per
  // person and day. The look-back reaches fourteen days, so the multiplication
  // was the setting that chases harder doubling as the setting that fills an
  // inbox: a site three days behind with two staff sent six emails in a run.
  const byRecipient = new Map();
  for (const item of overdue) {
    for (const user of users) {
      const assigned = user.allSites || user.sites.some((entry) => entry.siteId === item.siteId);
      if (!assigned || !user.email) continue;
      if (!byRecipient.has(user.email)) {
        byRecipient.set(user.email, { to: user.email, name: user.name, days: [] });
      }
      byRecipient.get(user.email).days.push({ site: item.site, date: item.date });
    }
  }

  const messages = [...byRecipient.values()];
  for (const message of messages) {
    message.days.sort((a, b) => a.date.localeCompare(b.date) || a.site.localeCompare(b.site));
  }

  return { since: fromYmd, overdue, messages };
}

/**
 * One reminder run. The server's scheduler is the only caller.
 *
 * `baseUrl` is where the links point; the scheduler has no request to derive it
 * from, so it passes APP_URL.
 *
 * Returns a plain summary and never throws for an ordinary "nothing to do":
 * being disabled or being the wrong hour is an outcome, not a failure.
 */
export async function runReminders({ baseUrl } = {}) {
  const settings = await readSettings();
  if (!settings.enabled) return { skipped: 'disabled' };

  const day = todayYmd();
  // Once a day, whatever the tick count and whatever restarted in between.
  if ((await readLastRunDay()) === day) return { skipped: 'already ran today' };
  // The scheduler ticks often; which of those ticks sends is the administrator's
  // setting, enforced here. That keeps the choice in the screen instead of in a
  // cron expression, and resolving the hour in APP_TIMEZONE means daylight
  // saving never moves the reminder.
  //
  // On or after the hour rather than exactly at it, because the alternative
  // fails silently in the way that matters: Next starts the scheduler on the
  // first request after a boot, so a deploy at 3am on a quiet night would arm it
  // at whatever time somebody first opened the app, and an exact match would
  // then skip that day entirely. Late is a reminder. Never is three missed days
  // and a site whose meals stop.
  if (localHour() < settings.hour) return { skipped: 'not the hour', hour: settings.hour };

  if (!mailConfigured()) return { skipped: 'mail not configured' };

  // Claimed before the first send, not after the last: a crash halfway through
  // sixty messages must not let the next tick start again from the top.
  await markRanToday(day);

  const { since, overdue, messages } = await overdueRecipients(settings);

  let sent = 0;
  const failures = [];
  for (const message of messages) {
    const body = countOverdue({
      name: message.name,
      days: message.days.map((day) => ({
        ...day,
        link: `${baseUrl}/meal-count?date=${day.date}&site=${encodeURIComponent(day.site)}`,
      })),
    });
    try {
      // Sequential on purpose: a burst of a hundred sends is what trips a
      // sending limit, and this job has all the time it needs.
      // eslint-disable-next-line no-await-in-loop
      await sendMail({ to: [message.to], ...body });
      sent += 1;
    } catch (error) {
      failures.push(`${message.to}: ${error.message}`);
    }
  }

  // A reminder that did not go out is the failure nobody notices, and three
  // missed days pause a site's meal delivery.
  if (failures.length) {
    await notifyFailure({
      area: 'Overdue reminders',
      error: new Error(`${failures.length} of ${messages.length} messages could not be sent`),
      context: { since, overdue: overdue.length, sent, first: failures[0] },
    });
  }

  await logAudit({
    actor: { id: null, email: 'system:reminders' },
    action: 'reminders.run',
    entity: 'setting',
    entityId: SETTINGS_KEY,
    payload: { overdue: overdue.length, sent, failed: failures.length },
  });

  return { overdue: overdue.length, sent, failed: failures.length };
}

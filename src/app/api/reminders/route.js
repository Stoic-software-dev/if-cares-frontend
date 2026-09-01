import { prisma } from '@/lib/db';
import { appBaseUrl, handle, readJsonBody, requireObjectBody, legacyJson, legacySuccess, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { mailConfigured, sendMail, parseRecipients } from '@/lib/gmail';
import { countOverdue } from '@/lib/mail-templates';
import { dateToYmd, localHour, todayYmd } from '@/lib/dates';
import { notifyFailure } from '@/lib/alerts';
import { applyHolidays, loadHolidays } from '@/lib/holidays';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The daily nudge for counts that were not filed. Who gets it, at what hour and
// whether it runs at all are settings an administrator changes without a deploy,
// which is the whole point of the requirement: the old system needed a developer
// to edit an Apps Script trigger.
//
// The schedule itself is owned by the platform's cron, which calls POST with the
// shared secret. This route decides who is overdue and writes the messages.

const SETTINGS_KEY = 'reminders';

const DEFAULTS = {
  enabled: false,
  hour: 9, // local hour in APP_TIMEZONE
  copyTo: [],
  // How many days back to look. One means "yesterday", which is what the old
  // system did.
  lookBackDays: 1,
};

async function readSettings() {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const GET = handle(async () => {
  await requireAdmin();
  const settings = await readSettings();
  return legacyJson({
    result: 'success',
    data: { ...settings, mailReady: mailConfigured() },
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

  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });

  await logAudit({
    actor: session.user,
    action: 'reminders.update',
    entity: 'setting',
    entityId: SETTINGS_KEY,
    payload: next,
  });

  return legacyJson({ result: 'success', data: next });
});

/**
 * Who is overdue right now, and who would hear about it. Used both by the run
 * and by the preview, so what an administrator sees before turning it on is
 * exactly what would go out.
 */
// The reminder window a site carries from the master (`Reminders` tab): outside
// it, nobody there is nagged. A site with no window configured is always in -
// the legacy skipped those, and an empty cell in a spreadsheet is too quiet a
// way to switch off a site whose meals stop after three missed days.
function withinReminderWindow(site, today) {
  const start = site.reminderStart ? dateToYmd(site.reminderStart) : '';
  const end = site.reminderEnd ? dateToYmd(site.reminderEnd) : '';
  if (!start || !end) return true;
  return today >= start && today <= end;
}

async function overdueRecipients(settings) {
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

  const messages = [];
  for (const item of overdue) {
    for (const user of users) {
      const assigned = user.allSites || user.sites.some((entry) => entry.siteId === item.siteId);
      if (!assigned || !user.email) continue;
      messages.push({ to: user.email, name: user.name, site: item.site, date: item.date });
    }
  }

  return { since: fromYmd, overdue, messages };
}

// Called by the scheduler. Guarded by a shared secret rather than a session,
// because a cron has no session; without the secret configured it refuses
// instead of running open.
export const POST = handle(async (req) => {
  const secret = process.env.REMINDERS_SECRET;
  const provided = req.headers.get('x-reminders-secret');
  const url = new URL(req.url);
  const preview = url.searchParams.get('preview') === '1';

  if (preview) {
    await requireAdmin();
  } else {
    if (!secret) throw new ApiError(503, 'Reminders are not configured to run.');
    if (provided !== secret) throw new ApiError(401, 'Bad reminder secret.');
  }

  const settings = await readSettings();
  if (!preview && !settings.enabled) return legacyJson({ result: 'success', skipped: 'disabled' });

  // The scheduler is expected to call every hour; which of those hours actually
  // sends is the administrator's setting, enforced here. That keeps the choice
  // in the screen instead of in a cron expression, and resolving the hour in
  // APP_TIMEZONE means daylight saving never moves the reminder.
  const forced = url.searchParams.get('force') === '1';
  if (!preview && !forced && localHour() !== settings.hour) {
    return legacyJson({ result: 'success', skipped: 'not the hour', hour: settings.hour });
  }

  const { since, overdue, messages } = await overdueRecipients(settings);

  if (preview) {
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

  if (!mailConfigured()) throw new ApiError(503, 'Email sending is not configured.');

  let sent = 0;
  const failures = [];
  for (const message of messages) {
    const base = appBaseUrl(req);
    const body = countOverdue({
      name: message.name,
      site: message.site,
      date: message.date,
      link: `${base}/meal-count?date=${message.date}&site=${encodeURIComponent(message.site)}`,
    });
    try {
      // Sequential on purpose: a burst of a hundred sends is what trips a
      // sending limit, and this job has all the time it needs.
      // eslint-disable-next-line no-await-in-loop
      await sendMail({ to: [message.to], cc: settings.copyTo, ...body });
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

  return legacyJson({ result: 'success', overdue: overdue.length, sent, failed: failures.length });
});

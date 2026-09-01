import { mailConfigured, sendMail, parseRecipients } from '@/lib/gmail';

// Somebody has to hear about a job that failed.
//
// The legacy system mailed the team when the nightly pipeline broke
// (`sendFailureAlert` and `sendPartialFailureAlert` in updateAllMeals.gs). The
// 2.0 had nothing of the sort: a consolidated claim that died halfway or a
// reminder run that sent nothing left a console warning in a log nobody reads.
// The client error screen only sees what breaks in a browser.
//
// The same failure is mailed at most once an hour. The failure that matters is
// usually the one that repeats, and a hundred identical mails is how an alert
// becomes noise nobody opens. The window lives in the process, so a restart may
// send one extra - which is the right way to be wrong.

const WINDOW_MS = 60 * 60 * 1000;
const lastSent = new Map();

function recipients() {
  return parseRecipients(process.env.ALERT_EMAILS ?? '').valid;
}

export function alertsConfigured() {
  return mailConfigured() && recipients().length > 0;
}

/**
 * Reports a server side failure. Never throws and never blocks the caller:
 * whatever went wrong is already bad enough without the alert breaking on top
 * of it.
 */
export async function notifyFailure({ area, error, context = {} }) {
  const detail = error?.message ?? String(error ?? 'unknown failure');
  const key = `${area}|${detail.slice(0, 120)}`;
  const now = Date.now();

  console.warn(`[alert] ${area}: ${detail}`);

  if (now - (lastSent.get(key) ?? 0) < WINDOW_MS) return false;

  const to = recipients();
  if (!mailConfigured() || !to.length) return false;
  lastSent.set(key, now);

  const rows = Object.entries(context)
    .map(([name, value]) => `<tr><td style="padding:2px 12px 2px 0"><b>${name}</b></td><td>${String(value)}</td></tr>`)
    .join('');

  try {
    await sendMail({
      to,
      subject: `IF Cares: ${area} failed`,
      html: `<p><b>${area}</b> failed.</p><p>${detail}</p>${rows ? `<table>${rows}</table>` : ''}`,
    });
    return true;
  } catch (mailError) {
    // The alert channel itself is down. There is nowhere left to escalate to,
    // so the log is the last stop.
    console.warn(`[alert] could not send the alert for ${area}: ${mailError.message}`);
    return false;
  }
}

// The messages the app sends. They are plain and short on purpose: these arrive
// on phones at a rec center, and the point is the one thing the reader has to do.

const SHELL = (body) => `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:560px">
  ${body}
  <p style="margin-top:28px;font-size:12px;color:#64748b">
    IF Cares Regular Year. This message was sent by the meal count app.
  </p>
</div>`;

const button = (href, label) => `
  <p style="margin:24px 0">
    <a href="${href}" style="background:#0f766e;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;display:inline-block">
      ${label}
    </a>
  </p>
  <p style="font-size:12px;color:#64748b;word-break:break-all">${href}</p>`;

export function passwordReset({ name, link, hours = 1 }) {
  return {
    subject: 'Reset your IF Cares password',
    html: SHELL(`
      <p>Hello ${name || 'there'},</p>
      <p>Use the link below to set a new password. It works once and expires in ${hours} hour${hours === 1 ? '' : 's'}.</p>
      ${button(link, 'Set a new password')}
      <p>If you did not ask for this, you can ignore this message. Nothing has changed.</p>
    `),
  };
}

// What a new account gets. It carries the same link the admin sees, so there is
// nothing to copy and paste and nothing to explain over the phone: the person
// finds out the account exists and sets their own password from the one mail.
export function welcome({ name, link, sites = [], hours = 24 }) {
  const where = sites.length ? sites.join(', ') : '';
  return {
    subject: 'Your IF Cares account is ready',
    html: SHELL(`
      <p>Hello ${name || 'there'},</p>
      <p>An account was created for you in the IF Cares meal count app${where ? ` for <strong>${where}</strong>` : ''}.</p>
      <p>Set your password with the link below to get in. It works once and expires in ${hours} hour${hours === 1 ? '' : 's'}.</p>
      ${button(link, 'Set your password')}
      <p>After that you sign in with this address and the password you chose. If the link has expired,
      use "Forgot your password?" on the sign in screen and a new one is sent here.</p>
    `),
  };
}

// The notice IF Cares gets when a site asks for something. Deliberately the
// same sentence the Apps Script sent - "The X Site has received a new request
// on DATE" - because these are skimmed, not read, and the people receiving
// them have been reading that shape for years.
export function requestReceived({ site, type, value, note, requestedBy, when, link }) {
  return {
    subject: 'New Request Received',
    html: SHELL(`
      <p>The <strong>${site} Site</strong> has received a new request on <strong>${when}</strong></p>
      <p><u>Details of the request:</u><br>
      <strong>Type:</strong> ${type}<br>
      <strong>Value:</strong> ${value || '—'}</p>
      ${note ? `<blockquote style="margin:18px 0;padding:12px 16px;background:#f1f5f9;border-radius:8px">${note}</blockquote>` : ''}
      ${link ? button(link, 'Open the request') : ''}
      <p style="font-size:13px;color:#475569">Sent by ${requestedBy}.</p>
    `),
  };
}

export function requestAnswered({ name, type, detail, site, comment, resolvedBy }) {
  return {
    subject: `Your request was answered: ${type}`,
    html: SHELL(`
      <p>Hello ${name || 'there'},</p>
      <p>Your request for <strong>${type}</strong>${detail ? ` (${detail})` : ''} at ${site} has been resolved.</p>
      ${comment ? `<blockquote style="margin:18px 0;padding:12px 16px;background:#f1f5f9;border-radius:8px">${comment}</blockquote>` : ''}
      <p style="font-size:13px;color:#475569">Resolved by ${resolvedBy}.</p>
    `),
  };
}

/**
 * Everything one person is behind on, in one message.
 *
 * It used to be one email per missing day. A site three days behind with two
 * staff produced six emails in one run, and the look-back reaches fourteen days
 * - so the setting that exists to chase harder was also the setting that filled
 * an inbox and got the whole thing marked as spam. A person needs the list once.
 */
export function countOverdue({ name, days }) {
  const one = days.length === 1;
  const rows = days
    .map(
      (day) =>
        `<li style="margin:0 0 6px"><strong>${day.date}</strong> — ${day.site} · <a href="${day.link}">submit it</a></li>`
    )
    .join('');

  return {
    subject: one
      ? 'Daily meal count and attendance overdue'
      : `${days.length} meal counts overdue`,
    html: SHELL(`
      <p>Hello ${name || 'there'},</p>
      <p>${
        one
          ? `The <strong>${days[0].date}</strong> meal count and attendance for <strong>${days[0].site}</strong> is overdue.`
          : `These meal counts have not been filed yet:`
      }</p>
      ${one ? '' : `<ul style="padding-left:18px;margin:0 0 16px">${rows}</ul>`}
      <p>Three consecutive days missing results in a pause of meal delivery, so please submit them now.</p>
      ${one ? button(days[0].link, 'Submit the count') : ''}
    `),
  };
}

// The site hears that the day it filed was signed off, with the PDF of what was
// approved attached, so the paper trail lives in their inbox and not only in the
// app.
export function countApproved({ name, site, date }) {
  return {
    subject: `Meal count approved: ${site}, ${date}`,
    html: SHELL(`
      <p>Hello ${name || 'there'},</p>
      <p>The daily meal count and attendance for <b>${site}</b> on <b>${date}</b> has been
      <b>approved</b>. A copy of what was approved is attached.</p>
      <p>Nothing else is needed from you for that day.</p>
    `),
  };
}

export function claimSent({ period, state, fileName, note }) {
  return {
    subject: `Documentation of meals claimed, ${state ? `${state} ` : ''}${period}`,
    html: SHELL(`
      <p>Attached is <strong>${fileName}</strong>.</p>
      ${note ? `<p>${note}</p>` : ''}
    `),
  };
}

// A daily form or a whole month of them, sent from the screen that shows it.
// The subject carries the site and the period because these get forwarded and
// filed, and "meal count.pdf" in an inbox six months later says nothing.
export function countSent({ site, period, fileName, note, senderName }) {
  return {
    subject: `Meal count: ${site}, ${period}`,
    html: SHELL(`
      <p>Attached is the meal count for <strong>${site}</strong>, ${period}.</p>
      ${note ? `<blockquote style="margin:18px 0;padding:12px 16px;background:#f1f5f9;border-radius:8px">${note}</blockquote>` : ''}
      <p style="font-size:13px;color:#475569">${fileName}${senderName ? ` · sent by ${senderName}` : ''}</p>
    `),
  };
}

export function signatureRequest({ period, state, link }) {
  return {
    subject: `Signature needed: meals claimed, ${state ? `${state} ` : ''}${period}`,
    html: SHELL(`
      <p>The consolidated claim for ${state ? `${state}, ` : ''}${period} is ready to sign.</p>
      <p>The link below opens the document and a place to sign it. No account is needed. It works once.</p>
      ${button(link, 'Read and sign the claim')}
    `),
  };
}

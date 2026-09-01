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

export function countOverdue({ name, site, date, link }) {
  return {
    subject: 'Daily meal count and attendance overdue',
    html: SHELL(`
      <p>Hello ${name || 'there'},</p>
      <p>The <strong>${date}</strong> meal count and attendance for <strong>${site}</strong> is overdue.</p>
      <p>Three consecutive days missing results in a pause of meal delivery, so please submit it now.</p>
      ${button(link, 'Submit the count')}
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

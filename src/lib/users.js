import crypto from 'node:crypto';
import { prisma } from '@/lib/db';
import { appBaseUrl } from '@/lib/http';
import { mailConfigured, sendMail } from '@/lib/gmail';
import { passwordReset, welcome } from '@/lib/mail-templates';

const RESET_TTL_MS = 24 * 60 * 60 * 1000; // Admin-issued links last a day.
const RESET_HOURS = RESET_TTL_MS / (60 * 60 * 1000);

export function toUserRow(user) {
  return {
    id: user.id,
    name: user.name,
    lastname: user.lastname,
    email: user.email,
    role: user.role,
    active: user.active,
    allSites: user.allSites,
    sites: (user.sites ?? []).map((us) => us.site.name).sort(),
    needsPassword: !user.passwordHash,
  };
}

export async function issueResetLink(req, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  return `${appBaseUrl(req)}/reset-password?token=${token}`;
}

const siteNames = (user) =>
  user.allSites || user.role === 'ADMIN' ? ['every site'] : (user.sites ?? []).map((us) => us.site.name).sort();

/**
 * Issues the link and, when asked, mails it to the account it belongs to.
 *
 * The send is awaited here, unlike the one behind "Forgot your password?": an
 * admin who ticked the box is owed a straight answer about whether the message
 * left, and there is no account-existence to leak on a screen that already
 * lists every account. A failed send never costs the link - it comes back
 * either way, so the admin can still copy it and hand it over.
 */
export async function deliverResetLink(req, user, { send = false, welcoming = false } = {}) {
  const link = await issueResetLink(req, user.id);
  if (!send) return { link, mail: { sent: false } };
  if (!mailConfigured()) {
    return { link, mail: { sent: false, error: 'Email sending is not set up yet.' } };
  }

  const message = welcoming
    ? welcome({ name: user.name, link, sites: siteNames(user), hours: RESET_HOURS })
    : passwordReset({ name: user.name, link, hours: RESET_HOURS });

  try {
    await sendMail({ to: [user.email], ...message });
    return { link, mail: { sent: true, to: user.email } };
  } catch (error) {
    return { link, mail: { sent: false, error: error.message } };
  }
}

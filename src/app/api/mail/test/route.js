import { handle, legacyJson } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { mailConfigured, mailFrom, mailActsAs, mailRedirect, sendMail } from '@/lib/gmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Is mail actually working?
//
// `mailConfigured()` only says the variables are set. Whether Google will let
// the service account send as MAIL_FROM depends on domain wide delegation,
// which is a Workspace admin action nothing in the app can see until a message
// is actually attempted. Without this, the first sign that delegation is missing
// is a reminder that never arrived.
//
// It sends to the caller's own address, so the diagnostic cannot be used to mail
// anyone else, and it answers with what Google said rather than a generic
// failure.
export const POST = handle(async () => {
  const session = await requireAdmin();
  const to = session.user.email;

  if (!mailConfigured()) {
    return legacyJson({
      result: 'success',
      data: { ok: false, to, from: mailFrom(), error: 'MAIL_FROM or the service account is not set.' },
    });
  }

  try {
    await sendMail({
      to: [to],
      subject: 'IF Cares: mail is working',
      html: '<p>If you are reading this, the app can send email as IF Cares.</p>',
    });
    return legacyJson({
      result: 'success',
      data: { ok: true, to, from: mailFrom(), as: mailActsAs(), redirectedTo: mailRedirect() },
    });
  } catch (error) {
    return legacyJson({
      result: 'success',
      // `as` is the half that fails: when From is an alias, the mailbox behind
      // it is what Google actually rejected, and the message names an address
      // that is nowhere in the settings unless this is shown too.
      data: { ok: false, to, from: mailFrom(), as: mailActsAs(), error: error.message },
    });
  }
});

import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacySuccess, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { requestStatusSchema } from '@/lib/validation';
import { mailConfigured, sendMail } from '@/lib/gmail';
import { requestAnswered } from '@/lib/mail-templates';
import { requestDetailText } from '@/lib/requests-text';
import { notifyFailure } from '@/lib/alerts';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handle(async (req, { params }) => {
  const session = await requireAdmin();
  const { status, responseComment } = requestStatusSchema.parse(await readJsonBody(req));

  const existing = await prisma.request.findUnique({
    where: { id: params.id },
    include: { site: { select: { name: true } }, requestedBy: { select: { name: true } } },
  });
  if (!existing) throw new ApiError(404, 'Request not found.');

  // Who resolved it and when are facts about the resolution, not about whether
  // they also wrote a note - and the screen says the note is optional. Tying
  // both to the note left a request sitting in Resolved with nobody's name on
  // it, no date, and a site that was never told. Reopening clears all of it: a
  // stale answer on an open request reads as if it had been answered.
  const resolving = status === 'RESOLVED';
  const reopening = !resolving && existing.status === 'RESOLVED';
  const newlyResolved = resolving && existing.status !== 'RESOLVED';

  await prisma.request.update({
    where: { id: params.id },
    data: {
      status,
      ...(resolving
        ? {
            ...(responseComment !== undefined ? { responseComment } : {}),
            respondedById: session.user.id,
            respondedByEmail: session.user.email ?? '',
            respondedAt: new Date(),
          }
        : {}),
      ...(reopening
        ? { responseComment: '', respondedById: null, respondedByEmail: '', respondedAt: null }
        : {}),
    },
  });

  // Telling the site is the point of answering, and it is the point whether or
  // not a note came with it - the message reads perfectly well without one. It
  // goes out when the request first reaches Resolved, or when the answer on one
  // that is already there actually CHANGES.
  //
  // "A note came with the save" was the wrong test: the screen sends the note
  // on every save, so an administrator who reopened a resolved request to read
  // it and pressed Mark resolved again mailed the site a second identical
  // answer. Comparing against what is stored is what makes re-saving free.
  const answerChanged =
    responseComment !== undefined && responseComment !== (existing.responseComment ?? '');
  const telling = newlyResolved || (resolving && answerChanged);
  if (telling && mailConfigured() && existing.requestedByEmail) {
    const message = requestAnswered({
      name: existing.requestedBy?.name,
      type: existing.type,
      detail: requestDetailText(existing),
      site: existing.site.name,
      comment: responseComment ?? existing.responseComment ?? '',
      resolvedBy: session.user.email ?? '',
    });
    // Awaited, and its failure reported: an answer the site never receives looks
    // exactly like one that arrived, and the screen said "answered" either way.
    await sendMail({ to: [existing.requestedByEmail], ...message }).catch((error) => {
      notifyFailure({
        area: 'Request answer email',
        error,
        context: { request: existing.id, to: existing.requestedByEmail, site: existing.site ?? '' },
      });
    });
    // The reminder run says how many it sent; this one said nothing at all, so
    // "was the site actually told, and how many times?" had no answer anywhere.
    console.log(`[requests] answer emailed to ${existing.requestedByEmail} (${existing.id})`);
  }

  await logAudit({
    actor: session.user,
    action: 'request.status_update',
    entity: 'request',
    entityId: params.id,
    payload: {
      from: existing.status,
      to: status,
      ...(resolving ? { answered: true } : {}),
    },
  });
  return legacySuccess();
});

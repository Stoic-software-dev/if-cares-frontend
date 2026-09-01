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

  // The answer is recorded with whoever gave it. Reopening clears it: a stale
  // resolution note on an open request reads as if it had been answered.
  const answering = responseComment !== undefined && status === 'RESOLVED';
  const reopening = status !== 'RESOLVED' && existing.status === 'RESOLVED';

  await prisma.request.update({
    where: { id: params.id },
    data: {
      status,
      ...(answering
        ? {
            responseComment: responseComment ?? '',
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

  // Telling the site is the point of answering. It goes out alongside the
  // response, so a mail failure never blocks the inbox.
  if (answering && mailConfigured() && existing.requestedByEmail) {
    const message = requestAnswered({
      name: existing.requestedBy?.name,
      type: existing.type,
      detail: requestDetailText(existing),
      site: existing.site.name,
      comment: responseComment,
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
  }

  await logAudit({
    actor: session.user,
    action: 'request.status_update',
    entity: 'request',
    entityId: params.id,
    payload: {
      from: existing.status,
      to: status,
      ...(answering ? { answered: true } : {}),
    },
  });
  return legacySuccess();
});

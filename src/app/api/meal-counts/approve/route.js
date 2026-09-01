import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { approveCountSchema } from '@/lib/validation';
import { ymdToUtcDate } from '@/lib/dates';
import { loadMealCountDetail } from '@/lib/meal-count-detail';
import { buildMealCountPdf } from '@/lib/meal-count-pdf';
import { archiveMealCountPdf, mealCountFileName } from '@/lib/pdf-archive';
import { mailConfigured, sendMail } from '@/lib/gmail';
import { countApproved } from '@/lib/mail-templates';
import { notifyFailure } from '@/lib/alerts';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// An administrator signs off on a day's count.
//
// Approving locks correction: what was approved is what was claimed, and a
// number that can still change afterwards is not an approval. Voiding stays
// available, because a count filed on the wrong day is wrong whether or not
// somebody approved it - the way back out is to void it and file it properly.
//
// Approval does NOT gate the reports. Every count that is not voided is claimed,
// approved or not, so a day nobody got around to approving can never disappear
// from a claim without anyone noticing.
//
// POST approves, PUT undoes it. Both are admin only and both leave an audit
// entry.

async function activeCount(siteName, ymd) {
  const date = ymdToUtcDate(ymd);
  if (!date) throw new ApiError(422, 'Invalid date.');

  const site = await prisma.site.findUnique({ where: { name: siteName } });
  if (!site) throw new ApiError(404, 'Site not found.');

  const count = await prisma.mealCount.findFirst({
    where: { siteId: site.id, date, voidedAt: null },
    select: { id: true, approvedAt: true, approvedByEmail: true },
  });
  if (!count) throw new ApiError(404, 'No active meal count for this date.');

  return { site, count };
}

/**
 * The follow-up an approval sends: the count as a PDF, archived and mailed to
 * the people at that site. It never decides whether the approval happened - the
 * approval is already written - so every failure here is reported and swallowed.
 *
 * It reports back how many were meant to hear and how many did, because an
 * approval that quietly notifies nobody looks exactly like one that worked.
 */
async function deliverApproval(session, siteName, ymd) {
  const detail = await loadMealCountDetail(session, siteName, ymd);
  const bytes = await buildMealCountPdf(detail);
  await archiveMealCountPdf(detail, bytes).catch((error) => {
    notifyFailure({ area: 'Archiving an approved count', error, context: { site: siteName, date: ymd } });
  });

  if (!mailConfigured()) return { sent: 0, recipients: 0, error: 'Email sending is not configured.' };

  const site = await prisma.site.findUnique({ where: { name: siteName }, select: { id: true } });
  // Only the people assigned to that site, which is what Summer does
  // (getSiteUserEmailsForApproval). Administrators with every site are
  // deliberately left out: they approve, and an approval that mails fifteen
  // people every time a day is signed off is how a useful email becomes a rule
  // in everyone's inbox.
  const users = await prisma.user.findMany({
    where: {
      active: true,
      email: { not: '' },
      sites: { some: { siteId: site.id } },
    },
    select: { name: true, email: true },
  });

  let sent = 0;
  let failure = '';
  for (const user of users) {
    const message = countApproved({ name: user.name, site: siteName, date: ymd });
    try {
      // eslint-disable-next-line no-await-in-loop
      await sendMail({
        to: [user.email],
        ...message,
        attachments: [{ name: mealCountFileName(siteName, ymd), bytes, mimeType: 'application/pdf' }],
      });
      sent += 1;
    } catch (error) {
      failure = failure || error.message;
      notifyFailure({
        area: 'Approval email',
        error,
        context: { site: siteName, date: ymd, to: user.email },
      });
    }
  }
  return { sent, recipients: users.length, error: sent === 0 ? failure : '' };
}

export const POST = handle(async (req) => {
  const session = await requireAdmin();
  const { site: siteName, date: ymd } = approveCountSchema.parse(await readJsonBody(req));
  const { count } = await activeCount(siteName, ymd);

  if (count.approvedAt) throw new ApiError(409, `Already approved by ${count.approvedByEmail}.`);

  const approvedAt = new Date();
  await prisma.mealCount.update({
    where: { id: count.id },
    data: {
      approvedAt,
      approvedById: session.user.id,
      approvedByEmail: session.user.email,
    },
  });

  await logAudit({
    actor: session.user,
    action: 'meal_count.approve',
    entity: 'meal_count',
    entityId: count.id,
    payload: { site: siteName, date: ymd },
  });

  // The PDF and the emails are the slow half. They run before answering rather
  // than after, because a request that ends is the only thing this runtime
  // promises to finish - but a failure in them never undoes the approval.
  let delivery = { sent: 0, recipients: 0, error: '' };
  try {
    delivery = await deliverApproval(session, siteName, ymd);
  } catch (error) {
    delivery = { sent: 0, recipients: 0, error: error.message };
    notifyFailure({
      area: 'Approval follow-up',
      error,
      context: { site: siteName, date: ymd },
    });
  }

  return legacyJson({
    result: 'success',
    data: {
      at: approvedAt.toISOString(),
      by: session.user.email,
      notified: delivery.sent,
      recipients: delivery.recipients,
      mailError: delivery.error,
    },
  });
});

export const PUT = handle(async (req) => {
  const session = await requireAdmin();
  const { site: siteName, date: ymd } = approveCountSchema.parse(await readJsonBody(req));
  const { count } = await activeCount(siteName, ymd);

  if (!count.approvedAt) throw new ApiError(409, 'This count is not approved.');

  await prisma.mealCount.update({
    where: { id: count.id },
    data: { approvedAt: null, approvedById: null, approvedByEmail: '' },
  });

  await logAudit({
    actor: session.user,
    action: 'meal_count.unapprove',
    entity: 'meal_count',
    entityId: count.id,
    payload: { site: siteName, date: ymd, wasApprovedBy: count.approvedByEmail },
  });

  return legacyJson({ result: 'success' });
});

import { prisma } from '@/lib/db';
import { appBaseUrl, handle, readJsonBody, requireObjectBody, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { mailConfigured, sendMail, parseRecipients, MailError } from '@/lib/gmail';
import { claimSent, signatureRequest } from '@/lib/mail-templates';
import { rebuildReport } from '@/lib/report-rebuild';
import { monthLabel } from '@/lib/report-data';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sending a claim out. Two shapes, because they are two different asks:
//
//   mode "copy" attaches the PDF, for whoever needs the document;
//   mode "signature" sends the signing link instead, for whoever has to sign it.
//
// A signing link is never sent as an attachment and the attachment never carries
// the link: mixing them is how a document meant to be read ends up signed by the
// wrong person.
export const POST = handle(async (req, { params }) => {
  const session = await requireAdmin();
  const body = requireObjectBody(await readJsonBody(req));

  const { valid, invalid } = parseRecipients(body.to);
  if (invalid.length) throw new ApiError(422, `Not an email address: ${invalid[0]}`);
  if (!valid.length) throw new ApiError(422, 'Add at least one recipient.');
  if (!mailConfigured()) throw new ApiError(503, 'Email sending is not configured yet.');

  const report = await prisma.generatedReport.findUnique({ where: { id: params.id } });
  if (!report) throw new ApiError(404, 'Report not found.');

  const period = monthLabel(report.year, report.month);
  const mode = body.mode === 'signature' ? 'signature' : 'copy';

  try {
    if (mode === 'signature') {
      if (report.signedAt) throw new ApiError(409, 'This claim is already signed.');
      if (!report.signToken) throw new ApiError(409, 'Create a signing link first.');
      const base = appBaseUrl(req);
      const message = signatureRequest({
        period,
        state: report.state,
        link: `${base}/sign/${report.signToken}`,
      });
      await sendMail({ to: valid, ...message });
    } else {
      const bytes = await rebuildReport(report);
      const message = claimSent({
        period,
        state: report.state,
        fileName: report.fileName,
        note: body.note ? String(body.note).slice(0, 500) : '',
      });
      await sendMail({
        to: valid,
        ...message,
        attachments: [{ name: report.fileName, bytes, mimeType: 'application/pdf' }],
      });
    }
  } catch (error) {
    if (error instanceof MailError) throw new ApiError(502, error.message);
    throw error;
  }

  await logAudit({
    actor: session.user,
    action: mode === 'signature' ? 'report.sign_link_sent' : 'report.sent',
    entity: 'report',
    entityId: report.id,
    payload: { to: valid.length, fileName: report.fileName },
  });

  return legacyJson({ result: 'success', data: { sent: valid.length } });
});

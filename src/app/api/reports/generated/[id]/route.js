import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { handle, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { downloadFile, driveConfigured } from '@/lib/google-drive';
import { rebuildReport } from '@/lib/report-rebuild';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The saved document. It comes from Drive when it is there, and is rebuilt from
// the counts when it is not, so a claim is never unreachable because the file
// store was unavailable the day it was made.
export const GET = handle(async (_req, { params }) => {
  await requireAdmin();
  const report = await prisma.generatedReport.findUnique({ where: { id: params.id } });
  if (!report) throw new ApiError(404, 'Report not found.');

  const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(report.fileName)}`;

  if (report.storageKey && driveConfigured()) {
    try {
      const { body } = await downloadFile(report.storageKey);
      return new Response(body, {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': disposition },
      });
    } catch {
      // Fall through and rebuild it.
    }
  }

  const bytes = await rebuildReport(report);
  return new Response(bytes, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': disposition },
  });
});

// Issuing the link that lets someone without an account sign this claim.
export const POST = handle(async (_req, { params }) => {
  const session = await requireAdmin();
  const report = await prisma.generatedReport.findUnique({ where: { id: params.id } });
  if (!report) throw new ApiError(404, 'Report not found.');
  if (report.signedAt) throw new ApiError(409, 'This claim is already signed.');

  // 32 random bytes, base64url: opaque, unguessable, and unrelated to the id of
  // the document it opens.
  const token = randomBytes(32).toString('base64url');
  await prisma.generatedReport.update({
    where: { id: report.id },
    data: { signToken: token, signTokenSetAt: new Date() },
  });

  await logAudit({
    actor: session.user,
    action: 'report.sign_link',
    entity: 'report',
    entityId: report.id,
    payload: { fileName: report.fileName },
  });

  return legacyJson({ result: 'success', data: { path: `/sign/${token}` } });
});

// Withdrawing a link that was sent to the wrong person.
export const DELETE = handle(async (_req, { params }) => {
  const session = await requireAdmin();
  const report = await prisma.generatedReport.findUnique({ where: { id: params.id } });
  if (!report) throw new ApiError(404, 'Report not found.');

  await prisma.generatedReport.update({
    where: { id: report.id },
    data: { signToken: null, signTokenSetAt: null },
  });

  await logAudit({
    actor: session.user,
    action: 'report.sign_link_revoke',
    entity: 'report',
    entityId: report.id,
    payload: {},
  });
  return legacyJson({ result: 'success' });
});

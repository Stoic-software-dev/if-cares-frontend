import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, ApiError } from '@/lib/http';
import { signReportSchema } from '@/lib/validation';
import { rebuildReport } from '@/lib/report-rebuild';
import { archivePdf } from '@/lib/pdf-archive';
import { monthLabel } from '@/lib/report-data';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The public signing step. Whoever signs a claim does not have an account and
// should not need one, so this is the only route in the app that answers without
// a session. What protects it is the token: 32 random bytes, one report, one
// use, and it expires.
//
// The token never appears in what this returns, and nothing here reveals
// anything about the rest of the system.

const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

async function reportForToken(token) {
  if (!token || token.length < 20) throw new ApiError(404, 'This link is not valid.');

  const report = await prisma.generatedReport.findUnique({ where: { signToken: token } });
  if (!report) throw new ApiError(404, 'This link is not valid, or it has already been used.');
  if (report.signedAt) throw new ApiError(409, 'This claim has already been signed.');

  const issued = report.signTokenSetAt?.getTime() ?? 0;
  if (Date.now() - issued > TOKEN_TTL_MS) throw new ApiError(410, 'This link has expired. Ask for a new one.');

  return report;
}

// What the signer sees before signing: which claim it is, and the document.
export const GET = handle(async (req, { params }) => {
  const report = await reportForToken(params.token);
  const wantsPdf = new URL(req.url).searchParams.get('pdf') === '1';

  if (wantsPdf) {
    const bytes = await rebuildReport(report);
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(report.fileName)}`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return legacyJson({
    result: 'success',
    data: {
      fileName: report.fileName,
      period: monthLabel(report.year, report.month),
      state: report.state,
      kind: report.kind,
    },
  });
});

export const POST = handle(async (req, { params }) => {
  const report = await reportForToken(params.token);
  const body = signReportSchema.parse(await readJsonBody(req));

  const bytes = await rebuildReport(report, {
    signature: body.signature,
    signedBy: body.signedBy,
    title: body.title ?? '',
  });

  const period = `${report.year}-${String(report.month).padStart(2, '0')}`;
  const file = await archivePdf({ name: report.fileName, bytes, period }).catch(() => null);

  await prisma.generatedReport.update({
    where: { id: report.id },
    data: {
      signedBy: body.signedBy,
      signedTitle: body.title ?? '',
      signature: body.signature,
      signedAt: new Date(),
      // Single use: the link stops working the moment it is used.
      signToken: null,
      signTokenSetAt: null,
      ...(file?.id ? { storageKey: file.id } : {}),
    },
  });

  await logAudit({
    // No session here: the signer is identified by the name they typed and by
    // the token they were sent.
    actor: { id: null, email: `signature:${body.signedBy}` },
    action: 'report.signed',
    entity: 'report',
    entityId: report.id,
    payload: { fileName: report.fileName, signedBy: body.signedBy },
  });

  return legacyJson({ result: 'success', data: { fileName: report.fileName } });
});

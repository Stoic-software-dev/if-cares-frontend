import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, ApiError } from '@/lib/http';
import { signReportSchema } from '@/lib/validation';
import { rebuildReport } from '@/lib/report-rebuild';
import { archivePdf } from '@/lib/pdf-archive';
import { monthLabel } from '@/lib/report-data';
import { clientIp, hit } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Rendering the claim reads every count of the month across every site in it,
// so `?pdf=1` is the most expensive thing an unauthenticated caller can ask
// for. A signer opens it once, maybe reloads it twice; anything past that is
// not somebody reading a document.
const PDF_WINDOW_MS = 60_000;
const PDF_MAX_PER_TOKEN = 10;
const PDF_MAX_PER_IP = 30;

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
    const perToken = hit({
      bucket: 'sign.pdf.token',
      key: params.token,
      limit: PDF_MAX_PER_TOKEN,
      windowMs: PDF_WINDOW_MS,
    });
    const perIp = hit({
      bucket: 'sign.pdf.ip',
      key: clientIp(req),
      limit: PDF_MAX_PER_IP,
      windowMs: PDF_WINDOW_MS,
    });
    if (perToken.limited || perIp.limited) {
      throw new ApiError(429, 'Too many requests for this document. Wait a minute and try again.');
    }

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

  // The token is spent inside the write, not before it. Reading `signedAt` and
  // then updating by id is two steps, and rebuilding the document in between
  // makes the gap seconds wide: two people on the same link - or one person
  // double tapping - both passed the check and both signed, the second name
  // overwriting the first on a document that had already been filed. The
  // condition travels with the update, so exactly one caller can claim it.
  const claimed = await prisma.generatedReport.updateMany({
    where: { id: report.id, signToken: params.token, signedAt: null },
    data: {
      signedBy: body.signedBy,
      signedTitle: body.title ?? '',
      signature: body.signature,
      signedAt: new Date(),
      // Single use: the link stops working the moment it is used.
      signToken: null,
      signTokenSetAt: null,
    },
  });
  if (claimed.count === 0) throw new ApiError(409, 'This claim has already been signed.');

  // Archiving happens after the claim is secured, so a slow or failing Drive
  // never costs the signature. The document is reproducible from the row.
  const bytes = await rebuildReport(report, {
    signature: body.signature,
    signedBy: body.signedBy,
    title: body.title ?? '',
  });

  const period = `${report.year}-${String(report.month).padStart(2, '0')}`;
  const file = await archivePdf({ name: report.fileName, bytes, period }).catch(() => null);
  if (file?.id) {
    await prisma.generatedReport.update({
      where: { id: report.id },
      data: { storageKey: file.id },
    });
  }

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

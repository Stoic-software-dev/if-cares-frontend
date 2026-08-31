import { prisma } from '@/lib/db';
import { handle, legacyJson } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Every consolidated claim that has been produced, so one can be found again
// months later without rebuilding it.
export const GET = handle(async (req) => {
  await requireAdmin();
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year')) || undefined;
  const month = Number(url.searchParams.get('month')) || undefined;

  const reports = await prisma.generatedReport.findMany({
    where: { ...(year ? { year } : {}), ...(month ? { month } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return legacyJson({
    result: 'success',
    data: reports.map((report) => ({
      id: report.id,
      year: report.year,
      month: report.month,
      state: report.state,
      kind: report.kind,
      fileName: report.fileName,
      stored: Boolean(report.storageKey),
      signedBy: report.signedBy,
      signedTitle: report.signedTitle,
      signedAt: report.signedAt ? report.signedAt.toISOString() : null,
      hasSignLink: Boolean(report.signToken),
      createdBy: report.createdByEmail,
      createdAt: report.createdAt.toISOString(),
    })),
  });
});

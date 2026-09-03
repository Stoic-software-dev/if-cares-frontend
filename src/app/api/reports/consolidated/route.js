import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { consolidatedSchema } from '@/lib/validation';
import { consolidatedBySite, consolidatedByDay, monthLabel } from '@/lib/report-data';
import { buildConsolidatedSitesPdf, buildConsolidatedDaysPdf } from '@/lib/report-pdf';
import { archivePdf, safeName } from '@/lib/pdf-archive';
import { startJob, getJob, listJobs, cancelJob } from '@/lib/report-jobs';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = {
  'claim-part1': { label: 'by site', build: consolidatedBySite, render: buildConsolidatedSitesPdf },
  'claim-part2': { label: 'by day', build: consolidatedByDay, render: buildConsolidatedDaysPdf },
};

// Starting a consolidated claim. It reads every count of the month across every
// included site, so it runs as a job and the screen polls for it.
export const POST = handle(async (req) => {
  const session = await requireAdmin();
  const body = consolidatedSchema.parse(await readJsonBody(req));
  const kind = KINDS[body.kind];
  if (!kind) throw new ApiError(422, 'Unknown report kind.');

  const period = `${body.year}-${String(body.month).padStart(2, '0')}`;
  const fileName = `${safeName(body.state || 'All')} ${period} claim ${kind.label}.pdf`;

  const jobId = startJob({
    kind: body.kind,
    label: `${monthLabel(body.year, body.month)}, ${body.state || 'every state'}`,
    work: async (report) => {
      report('Reading the counts');
      const data = await kind.build({
        year: body.year,
        month: body.month,
        state: body.state || undefined,
        excludeSites: body.excludeSites ?? [],
      });

      report('Rendering the document');
      const bytes = await kind.render(data, {
        signature: '',
        signedBy: '',
        title: body.title ?? '',
      });

      report('Filing it in Drive');
      const file = await archivePdf({ name: fileName, bytes, period }).catch((error) => {
        console.warn(`[pdf-archive] consolidated ${fileName}: ${error.message}`);
        return null;
      });

      // Recorded whether or not Drive accepted it, so the claim is always
      // recoverable from the app itself.
      const record = await prisma.generatedReport.create({
        data: {
          year: body.year,
          month: body.month,
          state: body.state || '',
          kind: body.kind,
          fileName,
          // Everything the build depended on, so the claim can be produced again
          // exactly as it was filed. Without these two the rebuild - which is
          // what the signing page serves - was a different document.
          excludeSites: body.excludeSites ?? [],
          title: body.title ?? '',
          storageKey: file?.id ?? '',
          createdById: session.user.id,
          createdByEmail: session.user.email ?? '',
        },
      });

      return {
        reportId: record.id,
        fileName,
        driveId: file?.id ?? '',
        rows: data.rows.length,
        totals: data.totals,
      };
    },
  });

  await logAudit({
    actor: session.user,
    action: 'report.consolidated_start',
    entity: 'report',
    entityId: jobId,
    payload: { kind: body.kind, year: body.year, month: body.month, state: body.state },
  });

  return legacyJson({ result: 'success', jobId });
});

// Polling. Without an id it lists what is running, which is what lets the screen
// pick a job back up after a reload.
export const GET = handle(async (req) => {
  await requireAdmin();
  const id = new URL(req.url).searchParams.get('job');
  if (!id) return legacyJson({ result: 'success', data: listJobs() });

  const job = getJob(id);
  if (!job) throw new ApiError(404, 'That report job is no longer available.');
  return legacyJson({ result: 'success', data: job });
});

export const DELETE = handle(async (req) => {
  await requireAdmin();
  const id = new URL(req.url).searchParams.get('job');
  if (!id) throw new ApiError(400, 'Missing job parameter.');
  cancelJob(id);
  return legacyJson({ result: 'success' });
});

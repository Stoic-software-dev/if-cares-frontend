import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { consolidatedSchema } from '@/lib/validation';
import { claimSiteCount, consolidatedBySite, consolidatedByDay, monthLabel } from '@/lib/report-data';
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

  // The screen refuses to build one with every site excluded; the API did not,
  // and the comment on `excludeSites` had promised a guarantee that was never
  // written. What came out was a claim with no rows, saved to the list beside
  // the real one for that month under the same name and filed over it in Drive.
  const covered = await claimSiteCount({
    year: body.year,
    month: body.month,
    state: body.state || undefined,
    excludeSites: body.excludeSites ?? [],
  });
  if (covered === 0) {
    throw new ApiError(
      422,
      body.excludeSites?.length
        ? 'A claim needs at least one site, and every site is excluded.'
        : `No site files under ${body.state || 'that state'}, so there is nothing to claim.`
    );
  }

  const period = `${body.year}-${String(body.month).padStart(2, '0')}`;
  const fileName = `${safeName(body.state || 'All')} ${period} claim ${kind.label}.pdf`;

  const jobId = startJob({
    kind: body.kind,
    label: `${monthLabel(body.year, body.month)}, ${body.state || 'every state'}`,
    work: async (report, job) => {
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

      // The last moment before this job leaves a mark anybody else can see. Up
      // to here cancelling costs nothing; past here it would be a file in the
      // office's Drive and a row in the claims list, for a document the screen
      // already reported as cancelled.
      if (job.cancelled()) return null;

      report('Filing it in Drive');
      // `distinct`: a claim for a month that already has one is filed beside it,
      // never over it, and the name that comes back is the name recorded.
      const file = await archivePdf({ name: fileName, bytes, period, distinct: true }).catch((error) => {
        console.warn(`[pdf-archive] consolidated ${fileName}: ${error.message}`);
        return null;
      });

      // Cancelling during the upload is the one window that can still leave a
      // file behind - it is already in Drive by now. The row is what the claims
      // list reads, so not writing it is what keeps the cancelled claim out of
      // the app; the stray file is named "(2)" and overwrites nothing.
      if (job.cancelled()) return null;

      // Recorded whether or not Drive accepted it, so the claim is always
      // recoverable from the app itself.
      const record = await prisma.generatedReport.create({
        data: {
          year: body.year,
          month: body.month,
          state: body.state || '',
          kind: body.kind,
          // The name Drive actually used, so signing this claim later replaces
          // its own file instead of the neighbouring month's.
          fileName: file?.name || fileName,
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
        fileName: record.fileName,
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

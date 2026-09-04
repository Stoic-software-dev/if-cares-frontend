import { handle, ApiError } from '@/lib/http';
import { requireUser, requireSiteAccess } from '@/lib/auth';
import { siteMonth, siteMonthCounts } from '@/lib/report-data';
import { buildSiteMonthBundlePdf } from '@/lib/report-pdf';
import { archivePdf, safeName } from '@/lib/pdf-archive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One site, one month: the cover sheet and every daily form behind it. Small
// enough to build inside the request: a site files at most about twenty two
// counts a month, two pages each.
export const GET = handle(async (req) => {
  const session = await requireUser();
  const url = new URL(req.url);
  const site = url.searchParams.get('site');
  const year = Number(url.searchParams.get('year'));
  const month = Number(url.searchParams.get('month'));

  if (!site) throw new ApiError(400, 'Missing site parameter.');
  if (!year || !month || month < 1 || month > 12) throw new ApiError(400, 'Missing or invalid month.');
  await requireSiteAccess(session, site);

  const data = await siteMonth({ site, year, month });
  if (!data) throw new ApiError(404, 'Site not found.');

  const bytes = await buildSiteMonthBundlePdf({
    summary: data,
    counts: await siteMonthCounts({ site, year, month }),
  });
  const name = `${safeName(site)} ${year}-${String(month).padStart(2, '0')} monthly.pdf`;

  // Drive keeps the copy of record, alongside the daily forms.
  archivePdf({ name, bytes, period: `${year}-${String(month).padStart(2, '0')}` }).catch((error) => {
    console.warn(`[pdf-archive] monthly ${site} ${year}-${month}: ${error.message}`);
  });

  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
});

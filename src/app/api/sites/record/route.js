import { prisma } from '@/lib/db';
import { handle, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { toSiteRecord, SITE_RECORD_INCLUDE } from '@/lib/site-record';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Site names carry slashes ("2025/2026 TX ..."), so they cannot ride in a path
// segment. Every screen already addresses a site by name in the query string;
// this is the same lookup for the administrative record.
export const GET = handle(async (req) => {
  await requireAdmin();
  const name = new URL(req.url).searchParams.get('site');
  if (!name) throw new ApiError(400, 'Missing site parameter.');

  const site = await prisma.site.findUnique({ where: { name }, include: SITE_RECORD_INCLUDE });
  if (!site) throw new ApiError(404, 'Site not found.');

  return legacyJson({ result: 'success', data: toSiteRecord(site) });
});

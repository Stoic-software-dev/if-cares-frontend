import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, legacySuccess, ApiError } from '@/lib/http';
import { requireUser, requireAdmin, requireSiteAccess } from '@/lib/auth';
import { requestSchema } from '@/lib/validation';
import { toCanonicalTime } from '@/lib/dates';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Same field names the request form already uses (requestType, amount, time,
// selectedSite) — at cutover the page switches from a mutating GET to this POST.
export const POST = handle(async (req) => {
  const session = await requireUser();
  const body = requestSchema.parse(await readJsonBody(req));

  const site = await prisma.site.findUnique({ where: { name: body.selectedSite } });
  if (!site || !site.active) throw new ApiError(422, 'Site not found.');
  await requireSiteAccess(session, site.name);

  const request = await prisma.request.create({
    data: {
      type: body.requestType,
      amount: body.amount ?? null,
      time: body.time ? toCanonicalTime(body.time) || null : null,
      siteId: site.id,
      requestedById: session.user.id,
      requestedByEmail: session.user.email,
    },
  });

  await logAudit({
    actor: session.user,
    action: 'request.create',
    entity: 'request',
    entityId: request.id,
    payload: { type: request.type, site: site.name },
  });
  return legacySuccess();
});

export const GET = handle(async (req) => {
  await requireAdmin();
  const status = new URL(req.url).searchParams.get('status');

  const requests = await prisma.request.findMany({
    where: status ? { status } : undefined,
    include: { site: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return legacyJson({
    result: 'success',
    data: requests.map((r) => ({
      id: r.id,
      type: r.type,
      amount: r.amount,
      time: r.time,
      status: r.status,
      site: r.site.name,
      requestedBy: r.requestedByEmail,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

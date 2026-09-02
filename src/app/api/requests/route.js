import { prisma } from '@/lib/db';
import { appBaseUrl, handle, readJsonBody, legacyJson, legacySuccess, ApiError } from '@/lib/http';
import { requireUser, requireSiteAccess, visibleSites } from '@/lib/auth';
import { requestSchema } from '@/lib/validation';
import { toCanonicalTime } from '@/lib/dates';
import { notifyNewRequest } from '@/lib/request-notify';
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
      note: body.note ?? '',
      siteId: site.id,
      requestedById: session.user.id,
      requestedByEmail: session.user.email,
    },
  });

  // The old app emailed IF Cares the moment a request came in. Losing that at
  // cutover would turn a message that reaches somebody into a row in a screen
  // nobody has open. Not awaited: a site asking for sporks must not get an
  // error because a mailbox is slow.
  notifyNewRequest({
    request,
    site: site.name,
    requestedBy: session.user.email,
    link: `${appBaseUrl(req)}/admin/requests`,
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

// Admins read everything; site staff read the requests of their own sites —
// in 2.0 a request has a visible status instead of vanishing into an email.
export const GET = handle(async (req) => {
  const session = await requireUser();
  const status = new URL(req.url).searchParams.get('status');

  const where = status ? { status } : {};
  if (session.user.role !== 'ADMIN') {
    const sites = await visibleSites(session);
    where.siteId = { in: sites.map((s) => s.id) };
  }

  const requests = await prisma.request.findMany({
    where,
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
      note: r.note,
      status: r.status,
      site: r.site.name,
      requestedBy: r.requestedByEmail,
      createdAt: r.createdAt.toISOString(),
      responseComment: r.responseComment,
      respondedBy: r.respondedByEmail,
      respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
    })),
  });
});

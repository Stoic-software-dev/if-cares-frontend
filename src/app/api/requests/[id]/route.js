import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacySuccess, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { requestStatusSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handle(async (req, { params }) => {
  const session = await requireAdmin();
  const { status } = requestStatusSchema.parse(await readJsonBody(req));

  const existing = await prisma.request.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, 'Request not found.');

  await prisma.request.update({ where: { id: params.id }, data: { status } });

  await logAudit({
    actor: session.user,
    action: 'request.status_update',
    entity: 'request',
    entityId: params.id,
    payload: { from: existing.status, to: status },
  });
  return legacySuccess();
});

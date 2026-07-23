import { prisma } from './db';

// Best-effort audit trail — never fails the request it accompanies.
export async function logAudit({ actor, action, entity, entityId = '', payload = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? '',
        action,
        entity,
        entityId: String(entityId),
        payload: payload ?? undefined,
      },
    });
  } catch (error) {
    console.error('[audit] failed to record', action, error?.message);
  }
}

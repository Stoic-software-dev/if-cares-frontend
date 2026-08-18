import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { toUserRow } from '@/lib/users';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const updateUserSchema = z.object({
  name: z.string().trim().min(1).optional(),
  lastname: z.string().trim().min(1).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
  allSites: z.boolean().optional(),
  sites: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

// STOIC-2200: edit or deactivate an account. Deactivation keeps every record
// the user ever touched; they just can't sign in.
export const PATCH = handle(async (req, { params }) => {
  const session = await requireAdmin();
  const body = updateUserSchema.parse(await readJsonBody(req));

  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing) throw new ApiError(404, 'User not found.');
  if (body.active === false && existing.id === session.user.id) {
    throw new ApiError(422, 'You cannot deactivate your own account.');
  }

  const data = {};
  for (const key of ['name', 'lastname', 'email', 'role', 'allSites', 'active']) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  if (body.sites !== undefined || body.allSites !== undefined) {
    const wantsAllSites = body.allSites ?? existing.allSites;
    const siteRows = wantsAllSites
      ? []
      : await prisma.site.findMany({ where: { name: { in: body.sites ?? [] } }, select: { id: true } });
    data.sites = {
      deleteMany: {},
      create: siteRows.map((s) => ({ siteId: s.id })),
    };
  }

  let user;
  try {
    user = await prisma.user.update({
      where: { id: params.id },
      data,
      include: { sites: { include: { site: { select: { name: true } } } } },
    });
  } catch (error) {
    if (error?.code === 'P2002') throw new ApiError(409, 'A user with this email already exists.');
    throw error;
  }

  await logAudit({
    actor: session.user,
    action: 'user.update',
    entity: 'user',
    entityId: user.id,
    payload: Object.keys(data).filter((k) => k !== 'sites'),
  });
  return legacyJson({ result: 'success', data: toUserRow(user) });
});

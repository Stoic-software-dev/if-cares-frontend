import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { toUserRow, deliverResetLink } from '@/lib/users';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireAdmin();
  const users = await prisma.user.findMany({
    include: { sites: { include: { site: { select: { name: true } } } } },
    orderBy: [{ name: 'asc' }, { lastname: 'asc' }],
  });
  return legacyJson({ result: 'success', data: users.map(toUserRow) });
});

// Bounded on purpose: a 10,000 character name is not a name, it just breaks
// every table it lands in.
const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Type a first name.').max(80),
  lastname: z.string().trim().min(1, 'Type a last name.').max(80),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['ADMIN', 'USER']),
  allSites: z.boolean().default(false),
  sites: z.array(z.string()).default([]),
  // Mailing the new account is the normal path; the admin can opt out when the
  // address is not reachable yet and they would rather hand the link over.
  sendEmail: z.boolean().default(true),
});

// STOIC-2200: create an account from the interface. The user arrives without a
// password; a one-day link is mailed to them with a welcome, and comes back in
// the response too so the admin can hand it over when mail is not an option.
export const POST = handle(async (req) => {
  const session = await requireAdmin();
  const body = createUserSchema.parse(await readJsonBody(req));

  const siteRows = body.allSites
    ? []
    : await prisma.site.findMany({ where: { name: { in: body.sites } }, select: { id: true } });

  let user;
  try {
    user = await prisma.user.create({
      data: {
        name: body.name,
        lastname: body.lastname,
        email: body.email,
        role: body.role,
        allSites: body.allSites,
        sites: { create: siteRows.map((s) => ({ siteId: s.id })) },
      },
      include: { sites: { include: { site: { select: { name: true } } } } },
    });
  } catch (error) {
    if (error?.code === 'P2002') throw new ApiError(409, 'A user with this email already exists.');
    throw error;
  }

  const { link, mail } = await deliverResetLink(req, user, { send: body.sendEmail, welcoming: true });
  await logAudit({ actor: session.user, action: 'user.create', entity: 'user', entityId: user.id });

  return legacyJson({ result: 'success', data: { user: toUserRow(user), resetLink: link, mail } });
});

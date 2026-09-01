import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handle, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { deliverResetLink } from '@/lib/users';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ sendEmail: z.boolean().default(true) });

// STOIC-2200: admin-issued password reset. The link is mailed to the account by
// default and also returned, so an admin can still copy it when the person
// cannot reach their inbox.
export const POST = handle(async (req, { params }) => {
  const session = await requireAdmin();
  // The body is optional here: posting nothing still means "give me a link".
  const raw = await req.text().catch(() => '');
  let parsed = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ApiError(400, 'Invalid JSON body.');
    }
  }
  const { sendEmail } = bodySchema.parse(parsed ?? {});

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: { sites: { include: { site: { select: { name: true } } } } },
  });
  if (!user) throw new ApiError(404, 'User not found.');
  if (!user.active) throw new ApiError(422, 'This account is deactivated.');

  const { link, mail } = await deliverResetLink(req, user, { send: sendEmail });
  await logAudit({ actor: session.user, action: 'user.reset_link', entity: 'user', entityId: user.id });

  return legacyJson({ result: 'success', data: { resetLink: link, mail } });
});

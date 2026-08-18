import { prisma } from '@/lib/db';
import { handle, legacyJson, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { issueResetLink } from '@/lib/users';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// STOIC-2200: admin-issued password reset. Until email delivery is wired the
// admin copies the link and hands it to the user directly.
export const POST = handle(async (req, { params }) => {
  const session = await requireAdmin();

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) throw new ApiError(404, 'User not found.');
  if (!user.active) throw new ApiError(422, 'This account is deactivated.');

  const resetLink = await issueResetLink(req, user.id);
  await logAudit({ actor: session.user, action: 'user.reset_link', entity: 'user', entityId: user.id });

  return legacyJson({ result: 'success', data: { resetLink } });
});

import { handle, readJsonBody, requireObjectBody, legacyJson } from '@/lib/http';
import { requireAdmin, requireUser } from '@/lib/auth';
import { SITE_STATES_KEY, readSiteStates, writeSiteStates } from '@/lib/site-states';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The states a site can be filed under. Every signed in user reads it, because
// the site screens show the badge; only an administrator changes it.
export const GET = handle(async () => {
  await requireUser();
  return legacyJson({ result: 'success', data: { states: await readSiteStates() } });
});

export const PUT = handle(async (req) => {
  const session = await requireAdmin();
  const body = requireObjectBody(await readJsonBody(req));
  const states = await writeSiteStates(body.states);

  await logAudit({
    actor: session.user,
    action: 'siteStates.update',
    entity: 'setting',
    entityId: SITE_STATES_KEY,
    payload: { states },
  });

  return legacyJson({ result: 'success', data: { states } });
});

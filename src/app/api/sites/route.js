import { handle, legacyJson } from '@/lib/http';
import { requireUser, visibleSites } from '@/lib/auth';
import { toLegacySiteListItem } from '@/lib/legacy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Legacy `?type=sites`: a RAW array of {name, spreadsheetId}, scoped to the user.
export const GET = handle(async () => {
  const session = await requireUser();
  const sites = await visibleSites(session);
  return legacyJson(sites.map(toLegacySiteListItem));
});

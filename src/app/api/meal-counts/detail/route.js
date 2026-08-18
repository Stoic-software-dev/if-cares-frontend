import { handle, legacyJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { loadMealCountDetail } from '@/lib/meal-count-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// New in 2.0 (STOIC-2199): any submitted count can be opened and read in the
// browser. GET ?site=<name>&date=YYYY-MM-DD.
export const GET = handle(async (req) => {
  const session = await requireUser();
  const url = new URL(req.url);
  const data = await loadMealCountDetail(
    session,
    url.searchParams.get('site'),
    url.searchParams.get('date')
  );
  return legacyJson({ result: 'success', data });
});

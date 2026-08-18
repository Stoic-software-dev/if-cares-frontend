import { handle } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { loadMealCountDetail } from '@/lib/meal-count-detail';
import { buildMealCountPdf } from '@/lib/meal-count-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// STOIC-2203: export a daily count as PDF. GET ?site=<name>&date=YYYY-MM-DD.
export const GET = handle(async (req) => {
  const session = await requireUser();
  const url = new URL(req.url);
  const site = url.searchParams.get('site');
  const date = url.searchParams.get('date');

  const count = await loadMealCountDetail(session, site, date);
  const bytes = await buildMealCountPdf(count);

  const safeSite = String(site).replace(/[^\w-]+/g, '_');
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="MealCount_${safeSite}_${date}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
});

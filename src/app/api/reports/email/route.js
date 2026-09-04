import { z } from 'zod';
import { handle, readJsonBody, legacyJson, ApiError } from '@/lib/http';
import { requireUser, requireSiteAccess } from '@/lib/auth';
import { mailConfigured, sendMail, parseRecipients, MailError } from '@/lib/gmail';
import { countSent } from '@/lib/mail-templates';
import { loadMealCountDetail } from '@/lib/meal-count-detail';
import { buildMealCountPdf } from '@/lib/meal-count-pdf';
import { siteMonth, siteMonthCounts, monthLabel } from '@/lib/report-data';
import { buildSiteMonthBundlePdf } from '@/lib/report-pdf';
import { safeName } from '@/lib/pdf-archive';
import { dateLabel } from '@/lib/calendar';
import { logAudit } from '@/lib/audit';
import { hit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A daily form goes to a site's own people and a monthly one to a handful more.
// Anything past this is a mailing list, and this is not the tool for one.
const MAX_RECIPIENTS = 10;
const MAX_SENDS_PER_HOUR = 30;

// STOIC-2203: "poder mandar por email cualquier PDF exportado". Consolidated
// claims already had this; the daily form and the monthly summary - the two a
// site actually deals with - could only be downloaded and then attached by
// hand, which is the step where the wrong month gets sent.
//
// It builds the same bytes the download endpoints build, from the same
// functions, so what lands in the inbox is the document that screen shows and
// not a second rendering that can drift from it.

const schema = z
  .object({
    kind: z.enum(['daily', 'monthly']),
    site: z.string().min(1, 'Site is required.'),
    to: z.string().min(1, 'Add at least one recipient.'),
    note: z.string().trim().max(500).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  })
  .refine((v) => (v.kind === 'daily' ? Boolean(v.date) : Boolean(v.year && v.month)), {
    message: 'A daily send needs a date; a monthly one needs a year and a month.',
    path: ['kind'],
  });

export const POST = handle(async (req) => {
  const session = await requireUser();
  const body = schema.parse(await readJsonBody(req));

  // Same gate as downloading it: if you cannot open the document you cannot
  // mail it to somebody else either.
  await requireSiteAccess(session, body.site);

  const { valid, invalid } = parseRecipients(body.to);
  if (invalid.length) throw new ApiError(422, `Not an email address: ${invalid[0]}`);
  if (!valid.length) throw new ApiError(422, 'Add at least one recipient.');
  if (valid.length > MAX_RECIPIENTS) {
    throw new ApiError(422, `Send to at most ${MAX_RECIPIENTS} addresses at a time.`);
  }
  if (!mailConfigured()) throw new ApiError(503, 'Email sending is not configured yet.');

  // This is the one place a signed in user can put a note and an attachment into
  // a message that leaves as ifcares.org, to any address they type. That is the
  // feature, so it stays - but unmetered it is also a way to send mail as the
  // foundation all day, and the reputation lost belongs to IF Cares.
  const { limited } = hit({
    bucket: 'report.email',
    key: session.user.id,
    limit: MAX_SENDS_PER_HOUR,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) throw new ApiError(429, 'That is a lot of sending. Try again in a little while.');

  let bytes;
  let fileName;
  let period;

  if (body.kind === 'daily') {
    const count = await loadMealCountDetail(session, body.site, body.date);
    bytes = await buildMealCountPdf(count);
    fileName = `MealCount_${safeName(body.site)}_${body.date}.pdf`;
    period = dateLabel(body.date);
  } else {
    const data = await siteMonth({ site: body.site, year: body.year, month: body.month });
    if (!data) throw new ApiError(404, 'Site not found.');
    if (!data.days.length) throw new ApiError(422, 'That month has no counts to send.');
    bytes = await buildSiteMonthBundlePdf({
      summary: data,
      counts: await siteMonthCounts({ site: body.site, year: body.year, month: body.month }),
    });
    fileName = `${safeName(body.site)} ${body.year}-${String(body.month).padStart(2, '0')} monthly.pdf`;
    period = monthLabel(body.year, body.month);
  }

  const message = countSent({
    site: body.site,
    period,
    fileName,
    note: body.note ?? '',
    senderName: session.user.email,
  });

  try {
    await sendMail({
      to: valid,
      ...message,
      attachments: [{ name: fileName, bytes, mimeType: 'application/pdf' }],
    });
  } catch (error) {
    if (error instanceof MailError) throw new ApiError(502, error.message);
    throw error;
  }

  await logAudit({
    actor: session.user,
    action: body.kind === 'daily' ? 'report.daily_sent' : 'report.monthly_sent',
    entity: 'site',
    entityId: body.site,
    payload: { site: body.site, period, to: valid.length, fileName },
  });

  return legacyJson({ result: 'success', data: { sent: valid.length, fileName } });
});

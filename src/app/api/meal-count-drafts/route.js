import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacyJson, legacySuccess, ApiError } from '@/lib/http';
import { requireUser, requireSiteAccess } from '@/lib/auth';
import { dateToYmd, todayYmd, ymdToUtcDate } from '@/lib/dates';
import { acceptTap, normalizeMarks } from '@/lib/count-drafts.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A meal count saved for later (STOIC-2691). One per site and day, on the
// server, so a count started on one phone is finished on another. The form
// writes every tap here; nothing is checked against the calendar until the
// count is submitted, which is where that rule already lives.

// Unsent days stop being worth keeping at the same age the phone used to drop
// them at.
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_STUDENTS = 1000;

const marksSchema = z.object({
  att: z.boolean().optional(),
  brk: z.boolean().optional(),
  lunch: z.boolean().optional(),
  snk: z.boolean().optional(),
  sup: z.boolean().optional(),
  // When it was tapped, in ms (STOIC-2771). Older versions of the app send none.
  at: z.number().optional(),
});
const timeSchema = z.string().regex(/^(\d{2}:\d{2})?$/, 'That is not a time.');

const patchSchema = z.object({
  site: z.string().min(1),
  date: z.string().min(1),
  timeIn: timeSchema.optional(),
  timeOut: timeSchema.optional(),
  marks: z.record(z.string().min(1).max(64), marksSchema).default({}),
});

async function resolveDay(session, siteName, ymd) {
  const site = await prisma.site.findUnique({ where: { name: String(siteName ?? '') } });
  if (!site || !site.active) throw new ApiError(422, 'Site not found.');
  await requireSiteAccess(session, site.name);
  const date = ymdToUtcDate(ymd);
  if (!date) throw new ApiError(422, 'Invalid date.');
  if (ymd > todayYmd()) throw new ApiError(422, 'That day has not happened yet.');
  return { site, date };
}

const isFiled = (siteId, date) =>
  prisma.mealCount.findFirst({
    where: { siteId, date, voidedAt: null },
    select: { id: true, createdAt: true, submittedByEmail: true, submittedBy: { select: { name: true, lastname: true } } },
  });

// Who filed a day, for the phone that loaded it without signal (STOIC-2771).
const filedBy = (count) =>
  [count.submittedBy?.name, count.submittedBy?.lastname].filter(Boolean).join(' ').trim() ||
  count.submittedByEmail ||
  'someone at this site';

function toPayload(draft) {
  if (!draft) return null;
  return {
    timeIn: draft.timeIn,
    timeOut: draft.timeOut,
    updatedByName: draft.updatedByName,
    updatedAt: draft.updatedAt.toISOString(),
    marks: Object.fromEntries(
      draft.entries.map((entry) => [
        entry.studentId,
        {
          att: entry.att,
          brk: entry.brk,
          lunch: entry.lunch,
          snk: entry.snk,
          sup: entry.sup,
          at: entry.markedAt ? entry.markedAt.getTime() : null,
        },
      ])
    ),
  };
}

const sweepOld = () =>
  prisma.mealCountDraft.deleteMany({ where: { updatedAt: { lt: new Date(Date.now() - MAX_AGE_MS) } } }).catch(() => {});

export const GET = handle(async (req) => {
  const session = await requireUser();
  const params = new URL(req.url).searchParams;
  const { site, date } = await resolveDay(session, params.get('site'), params.get('date'));
  await sweepOld();

  // A day already filed has nothing left to finish.
  const filed = await isFiled(site.id, date);
  if (filed) {
    await prisma.mealCountDraft.deleteMany({ where: { siteId: site.id, date } });
    return legacyJson({
      draft: null,
      submitted: true,
      submittedBy: filedBy(filed),
      submittedAt: filed.createdAt.toISOString(),
    });
  }

  const draft = await prisma.mealCountDraft.findUnique({
    where: { siteId_date: { siteId: site.id, date } },
    include: { entries: true },
  });
  return legacyJson({ draft: toPayload(draft), submitted: false });
});

// Merges what one device changed since its last save. Students are rows of
// their own, so two phones each marking half the roster add up; the same
// student touched on both keeps the newer tap (STOIC-2771), so a phone coming
// back after hours without signal does not undo what another phone did since.
// The taps that lost come back in `kept`, with what the server holds instead,
// so the phone shows that and not its own older mark.
export const PATCH = handle(async (req) => {
  const session = await requireUser();
  const body = patchSchema.parse(await readJsonBody(req));
  const { site, date } = await resolveDay(session, body.site, body.date);

  if (await isFiled(site.id, date)) {
    throw new ApiError(409, 'A meal count for this date was already submitted.');
  }

  // Only students of this site: an id from another roster is ignored rather
  // than written into a count it does not belong to.
  const ids = Object.keys(body.marks);
  if (ids.length > MAX_STUDENTS) throw new ApiError(422, 'That is more students than any roster has.');
  const known = ids.length
    ? new Set(
        (await prisma.student.findMany({ where: { siteId: site.id, id: { in: ids } }, select: { id: true } })).map(
          (student) => student.id
        )
      )
    : new Set();

  const byName = [session.user.name, session.user.lastname].filter(Boolean).join(' ').trim() || session.user.email;
  const times = {
    ...(body.timeIn !== undefined ? { timeIn: body.timeIn } : {}),
    ...(body.timeOut !== undefined ? { timeOut: body.timeOut } : {}),
  };

  const write = () =>
    prisma.$transaction(async (tx) => {
      const draft = await tx.mealCountDraft.upsert({
        where: { siteId_date: { siteId: site.id, date } },
        create: { siteId: site.id, date, updatedByName: byName, ...times },
        update: { updatedByName: byName, ...times },
      });
      const candidates = ids.filter((id) => known.has(id));
      const existing = candidates.length
        ? await tx.mealCountDraftEntry.findMany({ where: { draftId: draft.id, studentId: { in: candidates } } })
        : [];
      const byStudent = new Map(existing.map((entry) => [entry.studentId, entry]));
      const now = Date.now();
      const winners = [];
      const kept = {};
      for (const id of candidates) {
        const current = byStudent.get(id);
        const { accept, at } = acceptTap({
          incomingAt: body.marks[id].at,
          existingAt: current?.markedAt ? current.markedAt.getTime() : null,
          now,
        });
        if (accept) winners.push({ id, at });
        else kept[id] = { att: current.att, brk: current.brk, lunch: current.lunch, snk: current.snk, sup: current.sup };
      }
      // Replace the rows of the students in this save, two statements for the
      // whole batch: "everyone present gets snack" is two hundred students in a
      // single save, and a round trip each would outlast the transaction. Not
      // raw SQL: behind the Supabase pooler a raw statement does not always get
      // the app's schema on its search path, and fails as "does not exist".
      if (winners.length) {
        await tx.mealCountDraftEntry.deleteMany({
          where: { draftId: draft.id, studentId: { in: winners.map((winner) => winner.id) } },
        });
        await tx.mealCountDraftEntry.createMany({
          data: winners.map(({ id, at }) => ({
            draftId: draft.id,
            studentId: id,
            markedAt: new Date(at),
            ...normalizeMarks(body.marks[id]),
          })),
        });
      }
      return { draft, kept };
      // Serializable: two phones saving the same student at once would both
      // read the old time and both win. One of them is refused (P2034) and
      // writes again, after the other, against what the other left.
    }, { isolationLevel: 'Serializable' });

  let result;
  try {
    result = await write();
  } catch (error) {
    // Two phones saving at the same moment can both try to create the day, or
    // the same student's row; the one that loses writes again, after the other.
    if (error?.code !== 'P2002' && error?.code !== 'P2034') throw error;
    result = await write();
  }
  const { draft, kept } = result;

  return legacySuccess({
    data: {
      updatedAt: draft.updatedAt.toISOString(),
      updatedByName: draft.updatedByName,
      date: dateToYmd(date),
      kept,
    },
  });
});

// Start over: the saved marks go for everyone, not only on this device.
export const DELETE = handle(async (req) => {
  const session = await requireUser();
  const params = new URL(req.url).searchParams;
  const { site, date } = await resolveDay(session, params.get('site'), params.get('date'));
  await prisma.mealCountDraft.deleteMany({ where: { siteId: site.id, date } });
  return legacySuccess();
});

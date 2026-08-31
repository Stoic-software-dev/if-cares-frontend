import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacySuccess, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { ymdToUtcDate, toCanonicalTime } from '@/lib/dates';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rowSchema = z.tuple([
  z.number(), // number
  z.string(), // name
  z.union([z.number(), z.string(), z.null()]), // age
  z.boolean(), // attendance
  z.boolean(), // breakfast
  z.boolean(), // lunch
  z.boolean(), // snack
  z.boolean(), // supper
]);

const correctionSchema = z.object({
  site: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeIn: z.string().min(1),
  timeOut: z.string().min(1),
  note: z.string().trim().max(500).default(''),
  data: z.array(rowSchema).min(1),
});

// STOIC-2201: an Administrator edits a submitted count. The full prior state is
// stored as a MealCountCorrection snapshot first, so originals are never
// overwritten; reports read the current (corrected) values.
export const POST = handle(async (req) => {
  const session = await requireAdmin();
  const body = correctionSchema.parse(await readJsonBody(req));

  const site = await prisma.site.findUnique({ where: { name: body.site } });
  if (!site) throw new ApiError(404, 'Site not found.');

  const date = ymdToUtcDate(body.date);
  if (!date) throw new ApiError(422, 'Invalid date.');

  // Voided counts are not corrected: they are not the count of record any more.
  const count = await prisma.mealCount.findFirst({
    where: { siteId: site.id, date, voidedAt: null },
    include: { entries: { orderBy: { number: 'asc' } } },
  });
  if (!count) throw new ApiError(404, 'No meal count was submitted for this date.');

  const timeIn = toCanonicalTime(body.timeIn);
  const timeOut = toCanonicalTime(body.timeOut);
  if (!timeIn || !timeOut) throw new ApiError(422, 'Time in and time out are required.');

  const roster = await prisma.student.findMany({
    where: { siteId: site.id },
    select: { id: true, name: true },
  });
  const byName = new Map(roster.map((s) => [s.name.trim().toLowerCase(), s.id]));

  await prisma.$transaction(async (tx) => {
    await tx.mealCountCorrection.create({
      data: {
        mealCountId: count.id,
        correctedById: session.user.id,
        correctedByEmail: session.user.email,
        note: body.note,
        previous: {
          timeIn: count.timeIn,
          timeOut: count.timeOut,
          entries: count.entries.map((e) => ({
            number: e.number,
            name: e.name,
            age: e.age,
            attendance: e.attendance,
            breakfast: e.breakfast,
            lunch: e.lunch,
            snack: e.snack,
            supper: e.supper,
          })),
        },
      },
    });
    await tx.mealCount.update({ where: { id: count.id }, data: { timeIn, timeOut } });
    await tx.mealCountEntry.deleteMany({ where: { mealCountId: count.id } });
    await tx.mealCountEntry.createMany({
      data: body.data.map(([number, name, age, attendance, breakfast, lunch, snack, supper]) => ({
        mealCountId: count.id,
        studentId: byName.get(String(name).trim().toLowerCase()) ?? null,
        number,
        name: String(name),
        age: age === '' || age === null ? null : Number(age),
        attendance,
        breakfast,
        lunch,
        snack,
        supper,
      })),
    });
  });

  await logAudit({
    actor: session.user,
    action: 'mealcount.correct',
    entity: 'mealCount',
    entityId: count.id,
    payload: { site: site.name, date: body.date },
  });
  return legacySuccess();
});

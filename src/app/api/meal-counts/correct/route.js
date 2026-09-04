import { z } from 'zod';
import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacySuccess, ApiError } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { ymdToUtcDate, toCanonicalTime } from '@/lib/dates';
import { mealsNotServed, mealsOrAll } from '@/lib/calendar';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Where each meal sits in a correction row, which is the submit row's shape:
// [number, name, age, attendance, breakfast, lunch, snack, supper].
const MEAL_COLUMN = { brk: 4, lunch: 5, snk: 6, sup: 7 };

// Bounded for the same reason the submit path is: a roster is a few hundred
// names, and a position or an age below zero is not one.
const rowSchema = z.tuple([
  z.number().int().min(0, 'A roster position cannot be negative.'), // number
  z.string().trim().min(1, 'A roster row needs a name.').max(120, 'That name is too long.'), // name
  z.union([
    z.number().int().min(0, 'An age cannot be negative.').max(120, 'That age is not plausible.'),
    z.literal(''),
    z.null(),
  ]), // age
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
  data: z.array(rowSchema).min(1).max(1000, 'That is more students than any roster has.'),
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
  // What was approved is what was claimed. Correcting it after the fact would
  // make the approval a signature on numbers that changed underneath it; the way
  // out of a wrong approved count is to undo the approval, or to void it.
  const count = await prisma.mealCount.findFirst({
    where: { siteId: site.id, date, voidedAt: null },
    include: { entries: { orderBy: { number: 'asc' } } },
  });
  if (!count) throw new ApiError(404, 'No meal count was submitted for this date.');
  if (count.approvedAt) {
    throw new ApiError(
      409,
      `Approved by ${count.approvedByEmail} and locked. Undo the approval first, or void the count.`
    );
  }

  const timeIn = toCanonicalTime(body.timeIn);
  const timeOut = toCanonicalTime(body.timeOut);
  if (!timeIn || !timeOut) throw new ApiError(422, 'Time in and time out are required.');
  if (timeOut <= timeIn) throw new ApiError(422, 'Time out has to be after time in.');

  // The meals a correction may touch: what this day's calendar opens, plus what
  // the count already carries.
  //
  // The second half is why this is not simply the submit rule. A count filed
  // years ago on a calendar that has since changed still has to be correctable
  // as what it is - refusing the meals already in it would make the record
  // unfixable. But a meal that neither the calendar opens nor the count holds is
  // a new claim being written from nothing, and the screen does not even draw a
  // column for it: it offers exactly this union. Without the check here the API
  // was again the looser of the two.
  const serviceDay = await prisma.serviceDay.findUnique({
    where: { siteId_date: { siteId: site.id, date } },
    select: { brk: true, lunch: true, snk: true, sup: true },
  });
  const open = mealsOrAll(serviceDay);
  const allowed = {
    brk: open.brk || count.entries.some((entry) => entry.breakfast),
    lunch: open.lunch || count.entries.some((entry) => entry.lunch),
    snk: open.snk || count.entries.some((entry) => entry.snack),
    sup: open.sup || count.entries.some((entry) => entry.supper),
  };
  const refused = mealsNotServed(allowed).filter((meal) =>
    body.data.some((row) => row[MEAL_COLUMN[meal.key]])
  );
  if (refused.length) {
    const names = refused.map((meal) => meal.label.toLowerCase()).join(', ');
    throw new ApiError(422, `This site does not serve ${names} on that day.`);
  }

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
        // Same rule as filing: a meal is served to somebody who was there.
        attendance: attendance || breakfast || lunch || snack || supper,
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

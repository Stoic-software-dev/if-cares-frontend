import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacySuccess, ApiError } from '@/lib/http';
import { requireUser, requireSiteAccess } from '@/lib/auth';
import { mealCountSchema } from '@/lib/validation';
import { isoInstantToYmd, ymdToUtcDate, toCanonicalTime } from '@/lib/dates';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Legacy `{actionType:'mealCount', values:{...}}` accepted verbatim. One count
// per site+date — the DB unique constraint is the duplicate guard GAS used to
// provide by dropping the date from validDates.
export const POST = handle(async (req) => {
  const session = await requireUser();
  const { values } = mealCountSchema.parse(await readJsonBody(req));

  const site = await prisma.site.findUnique({ where: { name: values.site } });
  if (!site || !site.active) throw new ApiError(422, 'Site not found.');
  await requireSiteAccess(session, site.name);

  // The client sends dayjs.toISOString() taken at its local midnight; resolve
  // the calendar date in the program timezone so it matches the client's
  // 'YYYY-MM-DD' draft key.
  const ymd = isoInstantToYmd(values.date);
  const date = ymd ? ymdToUtcDate(ymd) : null;
  if (!date) throw new ApiError(422, 'Invalid date.');

  const serviceDay = await prisma.serviceDay.findUnique({
    where: { siteId_date: { siteId: site.id, date } },
  });
  if (!serviceDay) throw new ApiError(422, 'This date is not available for meal counts.');

  const timeIn = toCanonicalTime(values.timeIn);
  const timeOut = toCanonicalTime(values.timeOut);
  if (!timeIn) throw new ApiError(422, 'Time In is required.');
  if (!timeOut) throw new ApiError(422, 'Time Out is required.');

  // Best-effort link of each submitted row back to a roster student. The legacy
  // payload carries no student ids and its "number" is just the alphabetical
  // position at submission time, so the name is the strongest key.
  const roster = await prisma.student.findMany({
    where: { siteId: site.id },
    select: { id: true, name: true },
  });
  const byName = new Map(roster.map((s) => [s.name.trim().toLowerCase(), s.id]));

  let mealCount;
  try {
    mealCount = await prisma.$transaction(async (tx) => {
      const created = await tx.mealCount.create({
        data: {
          siteId: site.id,
          date,
          timeIn,
          timeOut,
          signature: values.signature,
          source: 'APP',
          submittedById: session.user.id,
          submittedByEmail: session.user.email,
        },
      });
      await tx.mealCountEntry.createMany({
        data: values.data.map(([number, name, age, attendance, breakfast, lunch, snack, supper]) => ({
          mealCountId: created.id,
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
      return created;
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      throw new ApiError(409, 'A meal count for this date was already submitted.');
    }
    throw error;
  }

  await logAudit({
    actor: session.user,
    action: 'mealcount.create',
    entity: 'mealCount',
    entityId: mealCount.id,
    payload: { site: site.name, date: ymd, students: values.data.length },
  });
  return legacySuccess();
});

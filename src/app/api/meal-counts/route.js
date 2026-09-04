import { prisma } from '@/lib/db';
import { handle, readJsonBody, legacySuccess, ApiError } from '@/lib/http';
import { requireUser, requireSiteAccess } from '@/lib/auth';
import { mealCountSchema } from '@/lib/validation';
import { isoInstantToYmd, ymdToUtcDate, toCanonicalTime, todayYmd } from '@/lib/dates';
import { mealsNotServed } from '@/lib/calendar';
import { applyHolidays, loadHolidays } from '@/lib/holidays';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Where each meal sits in a legacy submission row:
// [number, name, age, attendance, breakfast, lunch, snack, supper].
const MEAL_COLUMN = { brk: 4, lunch: 5, snk: 6, sup: 7 };

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

  // A meal count is taken at the point of service, so a day that has not
  // happened cannot have one. The form has always said so; the API did not, and
  // accepted a count dated seven weeks out - meals claimed for reimbursement
  // before anybody served them.
  if (ymd > todayYmd()) {
    throw new ApiError(422, 'That day has not happened yet.');
  }

  const serviceDay = await prisma.serviceDay.findUnique({
    where: { siteId_date: { siteId: site.id, date } },
  });
  if (!serviceDay) throw new ApiError(422, 'This date is not available for meal counts.');

  // The calendar keeps the day, holidays are subtracted from it, so the check
  // has to happen here rather than by looking for a missing ServiceDay row.
  const holidays = await loadHolidays({ from: date, to: date });
  const { meals: openMeals, holiday } = applyHolidays(
    { brk: serviceDay.brk, lunch: serviceDay.lunch, snk: serviceDay.snk, sup: serviceDay.sup },
    holidays,
    site.id,
    ymd
  );
  if (!openMeals) {
    throw new ApiError(422, `${holiday || 'That day'} is a holiday at this site, so no meals are served.`);
  }

  // Only the meals this day actually serves. Until now the check above was the
  // whole guard: it refused a day where EVERY meal was closed and said nothing
  // about a row claiming breakfast on a lunch-only day. The form gets this right
  // and renders one column, so the rule lived in the browser alone - and the
  // reports add up whatever flag is true, without ever consulting the calendar.
  const closed = mealsNotServed(openMeals);
  if (closed.length) {
    const claimed = closed.filter((meal) => values.data.some((row) => row[MEAL_COLUMN[meal.key]]));
    if (claimed.length) {
      const names = claimed.map((meal) => meal.label.toLowerCase()).join(', ');
      throw new ApiError(422, `This site does not serve ${names} on that day.`);
    }
  }

  const timeIn = toCanonicalTime(values.timeIn);
  const timeOut = toCanonicalTime(values.timeOut);
  if (!timeIn) throw new ApiError(422, 'Time In is required.');
  if (!timeOut) throw new ApiError(422, 'Time Out is required.');
  // Both are canonical "HH:MM:SS", so comparing them as strings is comparing the
  // clock. A count that ends before it starts printed exactly that way on the
  // form that goes to the state.
  if (timeOut <= timeIn) throw new ApiError(422, 'Time out has to be after time in.');

  // Best-effort link of each submitted row back to a roster student. The legacy
  // payload carries no student ids and its "number" is just the alphabetical
  // position at submission time, so the name is the strongest key.
  const roster = await prisma.student.findMany({
    where: { siteId: site.id },
    select: { id: true, name: true },
  });
  const byName = new Map(roster.map((s) => [s.name.trim().toLowerCase(), s.id]));

  // A voided count does not block the day: the partial unique index only covers
  // active rows, so the site files it again and both submissions stay on record.
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
          // A meal is served to somebody who was there. The form enforces it;
          // this keeps any other client from filing a snack for an absentee.
          attendance: attendance || breakfast || lunch || snack || supper,
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

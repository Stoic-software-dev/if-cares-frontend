// What happened to a count loaded without signal by the time the signal came
// back (STOIC-2771). The answer is what the sheet shows before the person does
// anything else: whether the count can still be sent, and what changed.
//
// Plain module with no imports, so the rules here are tested with node --test
// without booting Next.

export const OFFLINE_COUNT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const MEALS = ['brk', 'lunch', 'snk', 'sup'];

// record: what the phone kept (lib/offline): { site, date, updatedAt,
//   roster: [{ id, name }], markedIds: [id], mealsMarked: [meal] }.
// siteData: the site in the calendar read now ({ validDates, excludedDates }),
//   undefined when the account no longer has the site.
// roster: the site's roster now, [{ id, name }].
// filed: { submitted, submittedBy, submittedAt } from the saved-count read.
// today: 'YYYY-MM-DD' in the program's time zone.
//
// status, in the order it is decided:
//   expired    kept longer than 7 days; removed
//   site-gone  the account no longer works this site; removed
//   submitted  somebody filed the day meanwhile; removed
//   future     the phone's date was wrong; removed
//   closed     the day no longer has service (closed, or a holiday); removed
//   ready      can be reviewed and sent
export function reviewOfflineCount({ record, now, siteData, roster, filed, today }) {
  const base = { site: record.site, date: record.date, newStudents: [], goneStudents: [], strippedMeals: [], changed: false };

  if (now - (record.updatedAt ?? record.startedAt ?? 0) > OFFLINE_COUNT_MAX_AGE_MS) return { ...base, status: 'expired' };
  if (!siteData) return { ...base, status: 'site-gone' };
  if (filed?.submitted || (siteData.excludedDates ?? []).includes(record.date)) {
    return { ...base, status: 'submitted', submittedBy: filed?.submittedBy ?? '', submittedAt: filed?.submittedAt ?? '' };
  }
  if (record.date > today) return { ...base, status: 'future' };
  const open = siteData.validDates?.[record.date];
  if (!open) return { ...base, status: 'closed' };

  const before = new Set((record.roster ?? []).map((student) => student.id));
  const current = new Set((roster ?? []).map((student) => student.id));
  const names = new Map((record.roster ?? []).map((student) => [student.id, student.name]));

  const newStudents = (roster ?? []).filter((student) => !before.has(student.id)).map((student) => student.name);
  // Only students who were marked: one nobody marked leaving changes nothing in
  // the count.
  const goneStudents = (record.markedIds ?? []).filter((id) => !current.has(id)).map((id) => names.get(id) ?? 'A student');
  const strippedMeals = MEALS.filter((meal) => (record.mealsMarked ?? []).includes(meal) && !open[meal]);

  return {
    ...base,
    status: 'ready',
    newStudents,
    goneStudents,
    strippedMeals,
    // The signature certifies the count it was put on. Marks taken off make it
    // a different count, so it has to be signed again. A new student, unmarked,
    // leaves the count as it was.
    changed: goneStudents.length > 0 || strippedMeals.length > 0,
  };
}

// The record's summary of the marks, kept up to date as the count is taken.
export function summarizeMarks(marks) {
  const markedIds = [];
  const meals = new Set();
  for (const [id, mark] of marks) {
    if (!mark?.att) continue;
    markedIds.push(id);
    for (const meal of MEALS) if (mark[meal]) meals.add(meal);
  }
  return { markedIds, mealsMarked: MEALS.filter((meal) => meals.has(meal)) };
}

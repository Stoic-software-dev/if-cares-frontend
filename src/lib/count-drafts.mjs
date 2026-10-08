// A meal count saved for later (STOIC-2691), as the form rebuilds it.
//
// Plain module with no imports, so the rules here are tested with node --test
// without booting Next.

export const MARK_KEYS = ['att', 'brk', 'lunch', 'snk', 'sup'];
const MEALS = ['brk', 'lunch', 'snk', 'sup'];

export const emptyMarks = () => ({ att: false, brk: false, lunch: false, snk: false, sup: false });

// A meal is served to somebody who was there, the same rule the form applies on
// every tap and the API applies on submit.
export function normalizeMarks(marks) {
  const out = emptyMarks();
  for (const key of MARK_KEYS) out[key] = Boolean(marks?.[key]);
  if (MEALS.some((key) => out[key])) out.att = true;
  return out;
}

const anyMark = (marks) => MARK_KEYS.some((key) => marks?.[key]);

// Rebuilds the form from what the server holds and what this device has not
// sent yet. The device wins per student: those are taps made here after the
// server copy was read. Then:
//   - students no longer on the roster are dropped, and how many is reported;
//   - meals the day no longer serves (closed after the save, or a holiday put
//     on it) are taken off and named, instead of the submit failing at the end
//     of a two hundred name roster.
//
// rows: the roster, [{ id }]. server / local: { [studentId]: marks }.
// dayMeals: { brk, lunch, snk, sup } as the calendar has the day now.
export function rebuildDraft({ rows, server = {}, local = {}, dayMeals }) {
  const saved = { ...server, ...local };
  const ids = new Set(rows.map((row) => row.id));
  const savedIds = Object.keys(saved).filter((id) => anyMark(saved[id]));

  const stripped = new Set();
  const marks = new Map();
  for (const row of rows) {
    const raw = saved[row.id];
    if (!raw) {
      marks.set(row.id, emptyMarks());
      continue;
    }
    const next = { ...emptyMarks(), att: Boolean(raw.att) };
    for (const meal of MEALS) {
      if (!raw[meal]) continue;
      if (dayMeals && !dayMeals[meal]) stripped.add(meal);
      else next[meal] = true;
    }
    marks.set(row.id, normalizeMarks(next));
  }

  const kept = savedIds.filter((id) => ids.has(id));

  return {
    marks,
    anyMarked: kept.some((id) => anyMark(marks.get(id))),
    // Students who had marks and are no longer on the roster. The saved copy
    // only holds the students somebody touched, so a name added since cannot be
    // told apart from one nobody has reached yet, and is not counted.
    gone: savedIds.length - kept.length,
    stripped: MEALS.filter((meal) => stripped.has(meal)),
  };
}

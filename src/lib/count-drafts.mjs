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

// Which of two marks for the same student is the one to keep (STOIC-2771). Each
// carries `at`, when it was tapped, in ms. A phone that was offline for hours
// sends its taps late, and the later tap is the one that stands, not the later
// arrival. When either has no time (written before the field existed), the
// device's wins, as it always did.
export function newerMark(server, local) {
  if (!server) return local;
  if (!local) return server;
  if (local.at == null || server.at == null) return local;
  return server.at > local.at ? server : local;
}

// The server side of the same rule: whether a tap arriving now replaces the row
// already there, and the time to store with it. A phone whose clock runs ahead
// would otherwise win every argument for as long as it is ahead, so no tap is
// taken as later than the moment it reached the server. A tap with no time
// comes from a version of the app that did not send one, and is taken as now.
export function acceptTap({ incomingAt, existingAt, now }) {
  const at = typeof incomingAt === 'number' && Number.isFinite(incomingAt) ? Math.min(incomingAt, now) : now;
  return { accept: existingAt == null || at >= existingAt, at };
}

// Rebuilds the form from what the server holds and what this device has not
// sent yet. Per student the newer tap wins (newerMark); a device mark with no
// time wins, those being taps made here after the server copy was read. Then:
//   - students no longer on the roster are dropped, and how many is reported;
//   - meals the day no longer serves (closed after the save, or a holiday put
//     on it) are taken off and named, instead of the submit failing at the end
//     of a two hundred name roster.
//
// rows: the roster, [{ id }]. server / local: { [studentId]: marks }.
// dayMeals: { brk, lunch, snk, sup } as the calendar has the day now.
export function rebuildDraft({ rows, server = {}, local = {}, dayMeals }) {
  const saved = { ...server };
  for (const [id, mark] of Object.entries(local)) saved[id] = newerMark(server[id], mark);
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

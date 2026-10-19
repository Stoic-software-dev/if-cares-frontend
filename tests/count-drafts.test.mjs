import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptTap, newerMark, normalizeMarks, rebuildDraft } from '../src/lib/count-drafts.mjs';

const rows = [{ id: 'ana' }, { id: 'ben' }, { id: 'cy' }];
const allMeals = { brk: true, lunch: true, snk: true, sup: true };
const marked = (extra = {}) => ({ att: true, brk: false, lunch: false, snk: false, sup: false, ...extra });

test('two people marking different students add up', () => {
  const server = { ana: marked({ snk: true }), ben: marked() };
  const local = { cy: marked({ sup: true }) };
  const { marks, anyMarked } = rebuildDraft({ rows, server, local, dayMeals: allMeals });
  assert.equal(anyMarked, true);
  assert.deepEqual(marks.get('ana'), marked({ snk: true }));
  assert.deepEqual(marks.get('ben'), marked());
  assert.deepEqual(marks.get('cy'), marked({ sup: true }));
});

test('what this device has not sent yet wins over the server for the same student', () => {
  const server = { ana: marked({ snk: true }) };
  const local = { ana: { att: false, brk: false, lunch: false, snk: false, sup: false } };
  const { marks, anyMarked } = rebuildDraft({ rows, server, local, dayMeals: allMeals });
  assert.equal(marks.get('ana').att, false);
  assert.equal(anyMarked, false);
});

test('marks for students no longer on the roster are dropped and counted', () => {
  const server = { ana: marked(), gone: marked({ snk: true }) };
  const { marks, gone } = rebuildDraft({ rows, server, dayMeals: allMeals });
  assert.equal(marks.has('gone'), false);
  assert.equal(gone, 1);
});

test('meals the day no longer serves are taken off and named', () => {
  const server = { ana: marked({ snk: true, sup: true }), ben: marked({ brk: true }) };
  const dayMeals = { brk: false, lunch: false, snk: true, sup: false };
  const { marks, stripped } = rebuildDraft({ rows, server, dayMeals });
  assert.deepEqual(marks.get('ana'), marked({ snk: true }));
  // Ben stays present: he was there, only the meal is gone.
  assert.deepEqual(marks.get('ben'), marked());
  assert.deepEqual(stripped, ['brk', 'sup']);
});

test('a draft with nothing ticked is not brought back', () => {
  const server = { ana: { att: false } };
  assert.equal(rebuildDraft({ rows, server, dayMeals: allMeals }).anyMarked, false);
});

test('a meal always comes with attendance', () => {
  assert.deepEqual(normalizeMarks({ lunch: true }), marked({ lunch: true }));
  assert.deepEqual(normalizeMarks(undefined), { att: false, brk: false, lunch: false, snk: false, sup: false });
});

// STOIC-2771: a phone offline for hours sends its taps late.
test('the later tap wins, not the later arrival', () => {
  const server = { ana: { ...marked({ snk: true }), at: 4_000 } };
  const local = { ana: { att: false, brk: false, lunch: false, snk: false, sup: false, at: 3_000 } };
  const { marks } = rebuildDraft({ rows, server, local, dayMeals: allMeals });
  assert.deepEqual(marks.get('ana'), marked({ snk: true }));
});

test('a newer tap on this device still wins over an older one on the server', () => {
  const server = { ana: { ...marked({ snk: true }), at: 3_000 } };
  const local = { ana: { att: false, brk: false, lunch: false, snk: false, sup: false, at: 4_000 } };
  const { marks } = rebuildDraft({ rows, server, local, dayMeals: allMeals });
  assert.equal(marks.get('ana').att, false);
});

test('a mark without a time keeps the old rule: this device wins', () => {
  assert.equal(newerMark({ att: true, at: 9_000 }, { att: false }).att, false);
  assert.equal(newerMark({ att: true }, { att: false, at: 1 }).att, false);
});

test('the server keeps the newer tap and never trusts a clock ahead of it', () => {
  assert.deepEqual(acceptTap({ incomingAt: 3_000, existingAt: 4_000, now: 10_000 }), { accept: false, at: 3_000 });
  assert.deepEqual(acceptTap({ incomingAt: 5_000, existingAt: 4_000, now: 10_000 }), { accept: true, at: 5_000 });
  // A phone an hour ahead does not get to win for that hour.
  assert.deepEqual(acceptTap({ incomingAt: 99_000, existingAt: 4_000, now: 10_000 }), { accept: true, at: 10_000 });
  // Nothing there yet, or a row from before the column.
  assert.equal(acceptTap({ incomingAt: 1, existingAt: null, now: 10_000 }).accept, true);
  // An older app sends no time: taken as now.
  assert.deepEqual(acceptTap({ incomingAt: undefined, existingAt: 4_000, now: 10_000 }), { accept: true, at: 10_000 });
});

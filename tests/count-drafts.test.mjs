import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMarks, rebuildDraft } from '../src/lib/count-drafts.mjs';

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

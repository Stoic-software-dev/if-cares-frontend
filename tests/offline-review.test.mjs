import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFLINE_COUNT_MAX_AGE_MS, reviewOfflineCount, summarizeMarks } from '../src/lib/offline-review.mjs';

const DAY = 24 * 60 * 60 * 1000;
const now = 100 * DAY;
const today = '2026-10-19';
const record = {
  site: 'North',
  date: '2026-10-19',
  updatedAt: now - DAY,
  roster: [
    { id: 'ana', name: 'Ana' },
    { id: 'ben', name: 'Ben' },
    { id: 'cy', name: 'Cy' },
  ],
  markedIds: ['ana', 'ben'],
  mealsMarked: ['snk', 'sup'],
};
const roster = record.roster;
const siteData = { validDates: { '2026-10-19': { brk: false, lunch: false, snk: true, sup: true } }, excludedDates: [] };
const review = (over = {}) => reviewOfflineCount({ record, now, siteData, roster, filed: { submitted: false }, today, ...over });

test('nothing changed: ready, signature stands', () => {
  const result = review();
  assert.equal(result.status, 'ready');
  assert.equal(result.changed, false);
  assert.deepEqual(result.newStudents, []);
});

test('a new student is named, unmarked, and does not change the count', () => {
  const result = review({ roster: [...roster, { id: 'dee', name: 'Dee' }] });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.newStudents, ['Dee']);
  assert.equal(result.changed, false);
});

test('a marked student taken off the roster changes the count; an unmarked one does not', () => {
  const withoutBen = review({ roster: roster.filter((s) => s.id !== 'ben') });
  assert.deepEqual(withoutBen.goneStudents, ['Ben']);
  assert.equal(withoutBen.changed, true);
  const withoutCy = review({ roster: roster.filter((s) => s.id !== 'cy') });
  assert.deepEqual(withoutCy.goneStudents, []);
  assert.equal(withoutCy.changed, false);
});

test('a meal the day no longer serves, if marked, changes the count', () => {
  const lessMeals = { ...siteData, validDates: { '2026-10-19': { brk: false, lunch: false, snk: true, sup: false } } };
  const result = review({ siteData: lessMeals });
  assert.deepEqual(result.strippedMeals, ['sup']);
  assert.equal(result.changed, true);
});

test('the day closed or became a holiday: cannot be sent', () => {
  assert.equal(review({ siteData: { validDates: {}, excludedDates: [] } }).status, 'closed');
});

test('somebody filed the day meanwhile: who and when', () => {
  const result = review({ filed: { submitted: true, submittedBy: 'Maria Lopez', submittedAt: '2026-10-19T20:00:00.000Z' } });
  assert.equal(result.status, 'submitted');
  assert.equal(result.submittedBy, 'Maria Lopez');
  // The calendar alone also says so.
  assert.equal(review({ siteData: { ...siteData, excludedDates: ['2026-10-19'] } }).status, 'submitted');
});

test('the phone had the wrong date: a day that has not happened', () => {
  assert.equal(review({ record: { ...record, date: '2026-10-20' } }).status, 'future');
});

test('the site is no longer this account\'s', () => {
  assert.equal(review({ siteData: undefined }).status, 'site-gone');
});

test('after 7 days without being sent it is removed, whatever else is true', () => {
  const old = { ...record, updatedAt: now - OFFLINE_COUNT_MAX_AGE_MS - 1 };
  assert.equal(review({ record: old, siteData: undefined }).status, 'expired');
  assert.equal(review({ record: { ...record, updatedAt: now - OFFLINE_COUNT_MAX_AGE_MS } }).status, 'ready');
});

test('the summary lists who is marked and which meals carry a mark', () => {
  const marks = new Map([
    ['ana', { att: true, brk: false, lunch: false, snk: true, sup: false }],
    ['ben', { att: false, brk: false, lunch: false, snk: false, sup: false }],
    ['cy', { att: true, brk: false, lunch: false, snk: false, sup: true }],
  ]);
  assert.deepEqual(summarizeMarks(marks), { markedIds: ['ana', 'cy'], mealsMarked: ['snk', 'sup'] });
});

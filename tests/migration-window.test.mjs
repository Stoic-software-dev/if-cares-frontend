import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tabNameToYmd, monthsToFetch, datesSince } from '../src/lib/migration-window.mjs';

test('a legacy tab name reads as the date it names, in both spellings', () => {
  assert.equal(tabNameToYmd('10/1/2026'), '2026-10-01');
  assert.equal(tabNameToYmd(' 09/30/2026 '), '2026-09-30');
  assert.equal(tabNameToYmd('10012026'), '2026-10-01');
  assert.equal(tabNameToYmd('Roster'), null);
});

test('without a start date every month with a dated tab is fetched, once each', () => {
  const tabs = ['Roster', '09/29/2026', '09/30/2026', '10/01/2026', '10/2/2026'];
  assert.deepEqual(monthsToFetch(tabs), ['9/2026', '10/2026']);
});

test('with a start date the months that end before it are not fetched', () => {
  const tabs = ['10/01/2025', '08/10/2026', '09/30/2026', '10/01/2026', '10/26/2026'];
  assert.deepEqual(monthsToFetch(tabs, '2026-10-01'), ['10/2026']);
  // A start in the middle of a month still fetches that month.
  assert.deepEqual(monthsToFetch(tabs, '2026-09-15'), ['9/2026', '10/2026']);
  assert.deepEqual(monthsToFetch(tabs, '2026-11-01'), []);
});

test('only the days from the start date on are imported', () => {
  const dates = { '09/30/2026': { a: 1 }, '10/01/2026': { b: 2 }, '10/26/2026': { c: 3 }, Notes: {} };
  assert.deepEqual(Object.keys(datesSince(dates, '2026-10-01')), ['10/01/2026', '10/26/2026']);
  assert.deepEqual(Object.keys(datesSince(dates)), Object.keys(dates));
  assert.deepEqual(datesSince(undefined, '2026-10-01'), {});
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patternFromServed, mealsServedOn } from '../src/lib/served-pattern.mjs';

const none = { brk: false, lunch: false, snk: false, sup: false };

test('a meal served on most of a weekday\'s days enters that weekday', () => {
  const template = patternFromServed([
    { dow: 1, days: 10, brk: 0, lunch: 9, snk: 10, sup: 0 }, // Monday
    { dow: 2, days: 10, brk: 0, lunch: 0, snk: 10, sup: 8 }, // Tuesday
  ]);
  assert.deepEqual(template, {
    mon: { ...none, lunch: true, snk: true },
    tue: { ...none, snk: true, sup: true },
  });
});

test('a meal served on half the days or fewer is left out', () => {
  const template = patternFromServed([{ dow: 3, days: 10, brk: 5, lunch: 0, snk: 10, sup: 1 }]);
  assert.deepEqual(template, { wed: { ...none, snk: true } });
});

test('a weekday opened only once or twice is an exception, not a service day', () => {
  assert.deepEqual(patternFromServed([{ dow: 6, days: 2, brk: 0, lunch: 0, snk: 2, sup: 0 }]), {});
  assert.deepEqual(patternFromServed([{ dow: 6, days: 3, brk: 0, lunch: 0, snk: 3, sup: 0 }]), {
    sat: { ...none, snk: true },
  });
});

test('a weekday whose counts served no meal at all is not a service day', () => {
  assert.deepEqual(patternFromServed([{ dow: 5, days: 12, brk: 0, lunch: 0, snk: 0, sup: 0 }]), {});
  assert.deepEqual(patternFromServed([]), {});
  assert.deepEqual(patternFromServed(undefined), {});
});

test('a day served a meal when at least one student got it', () => {
  const served = mealsServedOn([
    { breakfast: false, lunch: false, snack: true, supper: false },
    { breakfast: false, lunch: false, snack: false, supper: false },
    { breakfast: false, lunch: false, snack: true, supper: true },
  ]);
  assert.deepEqual(served, { ...none, snk: true, sup: true });
});

test('a day with nobody served, or no rows, served nothing', () => {
  assert.deepEqual(mealsServedOn([{ breakfast: false, lunch: false, snack: false, supper: false }]), none);
  assert.deepEqual(mealsServedOn([]), none);
  assert.deepEqual(mealsServedOn(undefined), none);
});

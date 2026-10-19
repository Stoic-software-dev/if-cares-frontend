import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITE_USER_SESSION_MS, sessionMsFor, shouldRefreshSession } from '../src/lib/session-policy.mjs';

const HOUR = 60 * 60 * 1000;

test('a site user stays signed in 14 days, an administrator 8 hours', () => {
  assert.equal(sessionMsFor('USER'), 14 * 24 * HOUR);
  assert.equal(sessionMsFor('ADMIN'), 8 * HOUR);
  assert.equal(sessionMsFor('ADMIN', '12'), 12 * HOUR);
  // The setting never stretches a site user's session, or shortens it.
  assert.equal(sessionMsFor('USER', '1'), SITE_USER_SESSION_MS);
});

test('opening the app restarts a site user\'s 14 days once the cookie is an hour old', () => {
  const now = 1_000_000_000;
  const fresh = now + SITE_USER_SESSION_MS - 10 * 60 * 1000;
  const anHourOld = now + SITE_USER_SESSION_MS - 2 * HOUR;
  assert.equal(shouldRefreshSession({ role: 'USER', expiresAtMs: fresh, now }), false);
  assert.equal(shouldRefreshSession({ role: 'USER', expiresAtMs: anHourOld, now }), true);
});

test('an administrator\'s session slides only in its last 4 hours, as before', () => {
  const now = 1_000_000_000;
  assert.equal(shouldRefreshSession({ role: 'ADMIN', expiresAtMs: now + 6 * HOUR, now }), false);
  assert.equal(shouldRefreshSession({ role: 'ADMIN', expiresAtMs: now + 3 * HOUR, now }), true);
});

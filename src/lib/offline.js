'use client';

import { useSyncExternalStore } from 'react';

// Offline mode for site users (STOIC-2771). What a site user's phone keeps so
// the app opens and the meal count can be taken with no signal:
//   - who is signed in, so the app opens as them without asking the server;
//   - the reads their screens need (sites, calendar, rosters, site hours,
//     menus), as they were the last time there was signal;
//   - each count loaded without signal, with its signature, until it is sent.
//
// Everything but the identity is stored under the account's id, so another
// person signing in on the same phone sees none of it. Administrators get none
// of this: their screens need the server, and the account is never remembered.
//
// localStorage and not IndexedDB: the screens read it while they render, and
// a site's rosters, calendar and a signature are a few hundred KB at most.

const USER_KEY = 'ifc.offline.user';
const PREFIX = 'ifc.offline.';
const ADMIN_ROLE = 3202;

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Unlike the rest of the app's storage, failing here is said: a count that was
// not kept is a count that is lost. Returns whether it was written.
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Blocked storage holds nothing to remove.
  }
}

function keysStartingWith(prefix) {
  try {
    return Object.keys(localStorage).filter((key) => key.startsWith(prefix));
  } catch {
    return [];
  }
}

// --- Who is signed in --------------------------------------------------------

let accountId = null;

export const offlineEligible = (user) => Boolean(user) && user.role !== ADMIN_ROLE;

// Called with every user the server confirms. A site user is remembered; an
// administrator is not, and nothing is stored for them.
export function setAccount(user) {
  if (offlineEligible(user)) {
    accountId = user.id;
    write(USER_KEY, { user, at: Date.now() });
    requestPersistence();
  } else {
    accountId = null;
    if (user) remove(USER_KEY);
  }
  emitCounts();
}

// The account the app opens as when the server cannot be reached.
export function rememberedUser() {
  return read(USER_KEY)?.user ?? null;
}

// Signing out: without signal, the app no longer opens as anybody. What the
// account kept stays under its id and comes back when it signs in again.
export function forgetAccount() {
  accountId = null;
  remove(USER_KEY);
  clearMenuFiles();
  emitCounts();
}

// The account was deactivated: nothing of it stays on the phone, student names
// least of all.
export function wipeAccount(userId) {
  if (!userId) return;
  for (const key of keysStartingWith(`${PREFIX}${userId}.`)) remove(key);
  // The marks not sent yet, kept by the count screen under the same id.
  for (const key of keysStartingWith(`ifc.draft.${userId}.`)) remove(key);
  if (rememberedUser()?.id === userId) forgetAccount();
  clearMenuFiles();
}

export const currentAccountId = () => accountId;

// Asks the browser not to clear this site's storage when the phone runs low on
// space. Safari still clears a site not used in 7 days unless it is installed
// on the home screen, which is why the app offers to install itself.
function requestPersistence() {
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    // Not offered by this browser.
  }
}

// --- Saved reads -------------------------------------------------------------

const readKey = (userId, path) => `${PREFIX}${userId}.get.${path}`;

export function saveRead(path, value) {
  if (!accountId) return;
  write(readKey(accountId, path), { value, at: Date.now() });
}

// { value, at } or null.
export function savedRead(path) {
  if (!accountId) return null;
  return read(readKey(accountId, path));
}

// The menu files go through the service worker's cache, which is shared by the
// whole phone; signing out or a deactivated account empties it.
function clearMenuFiles() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'clear-menus' });
  } catch {
    // No service worker: nothing cached.
  }
}

// --- Counts loaded without signal -------------------------------------------
//
// { site, date, startedAt, updatedAt, roster: [{ id, name }], dayMeals,
//   signature: dataURL | null, marked: number }
// `roster` and `dayMeals` are what the phone had when the count was loaded, so
// what changed meanwhile can be told on the way back.

const countPrefix = (userId) => `${PREFIX}${userId}.count.`;
const countKey = (userId, site, date) => `${countPrefix(userId)}${site}|${date}`;

export function offlineCount(site, date) {
  if (!accountId) return null;
  return read(countKey(accountId, site, date));
}

export function putOfflineCount(record) {
  if (!accountId) return false;
  const ok = write(countKey(accountId, record.site, record.date), { ...record, updatedAt: Date.now() });
  emitCounts();
  return ok;
}

export function removeOfflineCount(site, date) {
  if (!accountId) return;
  remove(countKey(accountId, site, date));
  emitCounts();
}

export function offlineCounts() {
  if (!accountId) return [];
  return keysStartingWith(countPrefix(accountId))
    .map(read)
    .filter(Boolean)
    .sort((a, b) => (a.date === b.date ? a.site.localeCompare(b.site) : a.date.localeCompare(b.date)));
}

const countListeners = new Set();
function emitCounts() {
  for (const listener of countListeners) listener();
}

// --- Whether the server can be reached ---------------------------------------

let connection = { offline: false, savedAt: null };
const connectionListeners = new Set();

function setConnection(next) {
  if (next.offline === connection.offline && next.savedAt === connection.savedAt) return;
  connection = next;
  for (const listener of connectionListeners) listener();
}

// A read just came back from the server.
export function markOnline() {
  setConnection({ offline: false, savedAt: null });
}

// A read failed for lack of a connection and was answered from the phone. The
// oldest saved time is the one shown: that is how stale the screen can be.
export function markOffline(savedAt) {
  const oldest = connection.offline && connection.savedAt ? Math.min(connection.savedAt, savedAt ?? Infinity) : savedAt;
  setConnection({ offline: true, savedAt: Number.isFinite(oldest) ? oldest : null });
}

export function useConnection() {
  return useSyncExternalStore(
    (listener) => {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
    () => connection,
    () => connection
  );
}

let countsSnapshot = null;
export function useOfflineCounts() {
  return useSyncExternalStore(
    (listener) => {
      const wrapped = () => {
        countsSnapshot = null;
        listener();
      };
      countListeners.add(wrapped);
      return () => countListeners.delete(wrapped);
    },
    () => {
      if (!countsSnapshot) countsSnapshot = offlineCounts();
      return countsSnapshot;
    },
    () => []
  );
}

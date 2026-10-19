'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, isConnectionError } from '@/lib/api-client';
import { markOffline, markOnline, savedRead, saveRead } from '@/lib/offline';

// Session-lived cache for the reads that are expensive on the server and
// identical across screens: the site list, the whole meal-count calendar and
// the menus listing (a Drive call). Refetching these on every navigation is
// what made moving between sections feel slow.
//
// Stale-while-revalidate: a cached value paints immediately and is refreshed in
// the background; a write invalidates the entry so the next read is honest.
const store = new Map(); // path -> { value, at, promise }

const DEFAULT_MAX_AGE = 60_000;

// Bumped by a full clear. A read already on its way when the account changed
// belongs to the previous account, and must not land in the new one's cache.
let generation = 0;

export function invalidate(path) {
  if (path) store.delete(path);
  else {
    store.clear();
    generation += 1;
  }
}

export function peek(path) {
  return store.get(path)?.value;
}

// The reads a site user's phone keeps for when there is no signal (STOIC-2771):
// what the dashboard, the roster, the menus and the meal count need. Saved on
// every successful read, answered from the phone when the server cannot be
// reached. Nothing is kept for an administrator (see lib/offline).
function keptOffline(path) {
  return (
    path === SITES_PATH ||
    path === ALL_MEALS_PATH ||
    path === MENUS_PATH ||
    path.startsWith('/api/students/roster?') ||
    path.startsWith('/api/sites/data?')
  );
}

// { value, saved }: `saved` is true when it came from the phone, not the server.
async function readThrough(path) {
  try {
    const value = await apiGet(path);
    if (keptOffline(path)) saveRead(path, value);
    markOnline();
    return { value, saved: false };
  } catch (error) {
    const kept = isConnectionError(error) && keptOffline(path) ? savedRead(path) : null;
    if (!kept) throw error;
    markOffline(kept.at);
    return { value: kept.value, saved: true };
  }
}

// A plain read that falls back to what the phone kept. For the reads that are
// not worth holding in memory between screens, like a site's roster.
export async function offlineGet(path) {
  return (await readThrough(path)).value;
}

// The same, saying whether the answer came from the phone.
export const offlineRead = readThrough;

export async function cachedGet(path, { maxAge = DEFAULT_MAX_AGE, force = false } = {}) {
  const entry = store.get(path);
  const fresh = entry && Date.now() - entry.at < maxAge;
  if (entry && fresh && !force) return entry.value;
  if (entry?.promise && !force) return entry.promise;

  const started = generation;
  const promise = readThrough(path)
    .then(({ value, saved }) => {
      // An answer from the phone is never fresh: the next read asks the server.
      if (started === generation) store.set(path, { value, at: saved ? 0 : Date.now() });
      return value;
    })
    .catch((error) => {
      if (started === generation) store.delete(path);
      throw error;
    });

  store.set(path, { ...(entry ?? {}), promise });
  return promise;
}

/**
 * Reads `path` through the cache. Returns the cached value on the first render
 * when there is one, so a revisit paints with no spinner at all.
 */
export function useCachedGet(path, { maxAge = DEFAULT_MAX_AGE, enabled = true } = {}) {
  const [data, setData] = useState(() => (path ? peek(path) : undefined));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(() => enabled && Boolean(path) && peek(path) === undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    (force) => {
      if (!enabled || !path) return Promise.resolve();
      const cached = peek(path);
      if (cached !== undefined && !force) {
        setData(cached);
        setLoading(false);
      }
      return cachedGet(path, { maxAge, force })
        .then((value) => {
          if (!mounted.current) return;
          setData(value);
          setError('');
        })
        .catch((err) => {
          if (!mounted.current) return;
          if (peek(path) === undefined) setError(err.message);
        })
        .finally(() => {
          if (mounted.current) setLoading(false);
        });
    },
    [path, maxAge, enabled]
  );

  useEffect(() => {
    run(false);
  }, [run]);

  const refresh = useCallback(() => {
    setError('');
    setLoading(peek(path) === undefined);
    return run(true);
  }, [run, path]);

  return { data, error, loading, refresh };
}

// The paths shared across screens, named so an invalidation after a write is
// impossible to typo.
export const SITES_PATH = '/api/sites';
export const SITES_WITH_INACTIVE_PATH = '/api/sites?includeInactive=1';
export const ALL_MEALS_PATH = '/api/meal-counts/all';
// The states a site can be filed under. Read on every site screen, changed
// once in a while by an administrator.
export const SITE_STATES_PATH = '/api/site-states';
// Menus still come from Drive through the legacy Apps Script; they are the
// slowest read in the product and change once a month.
export const MENUS_PATH = '/api/reports/files';

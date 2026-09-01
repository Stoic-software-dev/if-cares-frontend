'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '@/lib/api-client';

// Session-lived cache for the reads that are expensive on the server and
// identical across screens: the site list, the whole meal-count calendar and
// the menus listing (a Drive call). Refetching these on every navigation is
// what made moving between sections feel slow.
//
// Stale-while-revalidate: a cached value paints immediately and is refreshed in
// the background; a write invalidates the entry so the next read is honest.
const store = new Map(); // path -> { value, at, promise }

const DEFAULT_MAX_AGE = 60_000;

export function invalidate(path) {
  if (path) store.delete(path);
  else store.clear();
}

export function peek(path) {
  return store.get(path)?.value;
}

export async function cachedGet(path, { maxAge = DEFAULT_MAX_AGE, force = false } = {}) {
  const entry = store.get(path);
  const fresh = entry && Date.now() - entry.at < maxAge;
  if (entry && fresh && !force) return entry.value;
  if (entry?.promise && !force) return entry.promise;

  const promise = apiGet(path)
    .then((value) => {
      store.set(path, { value, at: Date.now() });
      return value;
    })
    .catch((error) => {
      store.delete(path);
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
// Menus still come from Drive through the legacy Apps Script; they are the
// slowest read in the product and change once a month.
export const MENUS_PATH = '/api/reports/files';

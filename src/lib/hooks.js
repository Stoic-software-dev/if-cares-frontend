'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Reads once on mount (never during render, so SSR and the first client paint
// agree) and writes through on every change.
export function useStoredState(key, fallback) {
  const [value, setValue] = useState(fallback);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) setValue(JSON.parse(stored));
    } catch {
      // Blocked storage is fine: the fallback stands for this session.
    }
    setHydrated(true);
  }, [key]);

  const update = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Not persisting is acceptable.
        }
        return resolved;
      });
    },
    [key]
  );

  return [value, update, hydrated];
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const onChange = (event) => setMatches(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

// Work-in-progress protection lives in <UnsavedGuard /> (components/common),
// which pairs the browser's own reload prompt with the product's dialog for
// in-app navigation.

// Global keyboard shortcut. Ignores keystrokes typed into a field so "k" in a
// search box never opens the palette.
export function useHotkey(key, handler, { meta = true } = {}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const comboOk = meta ? event.metaKey || event.ctrlKey : !event.metaKey && !event.ctrlKey && !typing;
      if (!comboOk) return;
      if (event.key.toLowerCase() !== key.toLowerCase()) return;
      event.preventDefault();
      handler(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, handler, meta]);
}

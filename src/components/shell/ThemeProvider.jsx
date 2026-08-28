'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'ifc.theme';

const ThemeContext = createContext({ theme: 'system', resolved: 'light', setTheme: () => {} });

// The class is written by the inline script in layout.js before paint; this
// provider owns it from then on. Three states: system (default), light, dark.
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('system');
  const [resolved, setResolved] = useState('light');

  const apply = useCallback((next) => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const isDark = next === 'dark' || (next === 'system' && media.matches);
    document.documentElement.classList.toggle('dark', isDark);
    setResolved(isDark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    let stored = 'system';
    try {
      stored = localStorage.getItem(STORAGE_KEY) || 'system';
    } catch {
      // Private mode or blocked storage: the system preference still works.
    }
    setThemeState(stored);
    apply(stored);
  }, [apply]);

  // Following the OS only matters while the user has not pinned a mode.
  useEffect(() => {
    if (theme !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme, apply]);

  const setTheme = useCallback(
    (next) => {
      setThemeState(next);
      apply(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Not persisting is acceptable; the session still switches.
      }
    },
    [apply]
  );

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

'use client';

import { useEffect } from 'react';

// Registers public/sw.js, which lets a site user's phone open the app with no
// signal (STOIC-2771). Not in development: there every page is rebuilt on each
// request, and a kept copy would only hide the change being worked on.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Without it the app works as before, online only.
    });
  }, []);
  return null;
}

'use client';

// Sends a browser crash to /api/monitoring. Everything here is best effort by
// design: reporting an error must never be able to cause one, and must never
// block or slow the screen the user is already having trouble with.

const seen = new Set();

function keyOf(message, stack) {
  return `${message}|${String(stack ?? '').slice(0, 200)}`;
}

/**
 * @param {unknown} error the thrown value, which is not always an Error
 * @param {'boundary'|'window'|'promise'} source where it was caught
 */
export function reportError(error, source = 'boundary') {
  try {
    const message = String(error?.message ?? error ?? 'Unknown error').slice(0, 500);
    if (!message) return;

    // The same failure inside a render loop would otherwise fire on every
    // frame. Once per session per signature is enough to know it happened.
    const key = keyOf(message, error?.stack);
    if (seen.has(key)) return;
    seen.add(key);

    const body = JSON.stringify({
      message,
      stack: String(error?.stack ?? '').slice(0, 4000),
      pathname: window.location?.pathname ?? '',
      source,
    });

    // keepalive so a crash during navigation still gets reported.
    fetch('/api/monitoring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting failed. There is nowhere left to report that to.
  }
}

let installed = false;

/** Catches what never reaches a React boundary: listeners, timers, promises. */
export function installGlobalErrorReporting() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    // Failed image or script loads surface here too and are not app crashes.
    if (!event.error) return;
    reportError(event.error, 'window');
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, 'promise');
  });
}

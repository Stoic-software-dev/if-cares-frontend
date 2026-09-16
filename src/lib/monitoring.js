'use client';

// Sends a browser crash to /api/monitoring. Everything here is best effort by
// design: reporting an error must never be able to cause one, and must never
// block or slow the screen the user is already having trouble with.

const seen = new Set();

function keyOf(message, stack) {
  return `${message}|${String(stack ?? '').slice(0, 200)}`;
}

// Next signals a redirect and a 404 by throwing. Those are control flow, not
// crashes, and reporting them fills the log with entries nobody can act on:
// three of the first four real entries this screen ever collected were one
// `redirect()` on the root route, twice as a literal NEXT_REDIRECT and once as
// React #419, which is what the same throw looks like from inside a streamed
// Suspense boundary. A log that cries wolf is how the real crash gets missed.
const NEXT_CONTROL_FLOW = /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/;
// React's own name for "the server aborted this boundary, carry on in the
// browser". By the time it is reported the page has already recovered, and the
// cause, if there is one, reports itself separately.
const REACT_SUSPENSE_ABORT = /Minified React error #(418|419|421|422|423)\b/;

function isNoise(error, message) {
  const digest = String(error?.digest ?? '');
  return (
    NEXT_CONTROL_FLOW.test(digest) ||
    NEXT_CONTROL_FLOW.test(message) ||
    REACT_SUSPENSE_ABORT.test(message)
  );
}

/**
 * What to call a thrown value that is not an Error.
 *
 * `String(anEvent)` is "[object Event]", and that is what the log filled up
 * with: a promise rejected with an Event - which is what every wrapped image,
 * script or media load does when it fails - arrived as a row with no message,
 * no stack and nothing to act on. The window 'error' listener already skips
 * those; the rejection handler passed them straight through.
 */
function describe(value) {
  if (value?.message) return String(value.message);
  if (typeof value === 'string') return value;
  if (typeof Event !== 'undefined' && value instanceof Event) {
    const target = value.target;
    const src = target?.src || target?.href;
    // A resource that failed to load is not an application crash.
    if (src) return '';
    return `Rejected with a ${value.type} event`;
  }
  if (value && typeof value === 'object') {
    const asString = String(value);
    if (asString === '[object Object]' || /^\[object \w+\]$/.test(asString)) {
      try {
        return `Rejected with ${JSON.stringify(value).slice(0, 200)}`;
      } catch {
        return 'Rejected with a value that is not an error';
      }
    }
    return asString;
  }
  return value === undefined || value === null ? '' : String(value);
}

/**
 * @param {unknown} error the thrown value, which is not always an Error
 * @param {'boundary'|'window'|'promise'} source where it was caught
 */
export function reportError(error, source = 'boundary') {
  try {
    const message = describe(error).slice(0, 500);
    if (!message) return;
    if (isNoise(error, message)) return;

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

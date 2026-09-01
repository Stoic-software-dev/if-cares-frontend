import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

// Error carrying an HTTP status plus a message the legacy UI renders verbatim.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function legacyJson(payload, init) {
  return NextResponse.json(payload, init);
}

export function legacySuccess(extra = {}, init) {
  return NextResponse.json({ result: 'success', ...extra }, init);
}

export function legacyError(message, status = 400) {
  return NextResponse.json({ result: 'error', message }, { status });
}

// The existing UI posts JSON with Content-Type: text/plain;charset=utf-8 (GAS
// CORS workaround), so bodies are read as text and parsed manually.
// The address the app is reachable at, for links that travel outside the
// browser (emails, copied reset links). Behind a proxy the request origin is
// the internal listener - on Railway that is https://localhost:8080 - so the
// configured APP_URL wins, then what the proxy forwarded, and only then the
// origin, which is right when running locally.
export function appBaseUrl(req) {
  const configured = process.env.APP_URL?.replace(/\/$/, '');
  if (configured) return configured;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (host) {
    const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim() || 'https';
    return `${proto}://${host}`;
  }
  return new URL(req.url).origin;
}

export async function readJsonBody(req) {
  const raw = await req.text();
  if (!raw) throw new ApiError(400, 'Empty request body.');
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'Invalid JSON body.');
  }
}

// Wraps a route handler and converts thrown errors into legacy-shaped responses.
export function handle(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (error) {
      if (error instanceof ApiError) {
        return legacyError(error.message, error.status);
      }
      if (error instanceof ZodError) {
        const first = error.issues?.[0];
        const field = first?.path?.length ? first.path.join('.') : '';
        // The schema's own message is written for the person reading it. Only
        // when there is none - a field left out entirely, where Zod has nothing
        // to say - is the field name worth showing, and then it is the whole
        // point of the message rather than a technical suffix on the end of one.
        // A field left out entirely has no message worth showing. Zod's own text
        // for it - "Invalid input", or "Invalid input: expected string, received
        // undefined" depending on the version - tells the reader nothing, so
        // that is the one case where naming the field IS the message.
        const generic = !first?.message || /^(required|invalid input)/i.test(first.message);
        return legacyError(
          generic ? (field ? `${field} is required.` : 'Invalid input.') : first.message,
          422
        );
      }
      if (error?.code === 'P2002') {
        return legacyError('Duplicate entry.', 409);
      }
      console.error('[api] unhandled error:', error);
      return legacyError('Unexpected server error. Please try again.', 500);
    }
  };
}

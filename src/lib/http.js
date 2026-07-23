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
        const where = first?.path?.length ? ` (${first.path.join('.')})` : '';
        return legacyError(`${first?.message || 'Invalid input.'}${where}`, 422);
      }
      if (error?.code === 'P2002') {
        return legacyError('Duplicate entry.', 409);
      }
      console.error('[api] unhandled error:', error);
      return legacyError('Unexpected server error. Please try again.', 500);
    }
  };
}

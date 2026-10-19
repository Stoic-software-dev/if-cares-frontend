// Thin fetch wrapper for the app's own API. Reads the legacy response contract:
// GETs return raw JSON; writes return { result: 'success' | 'error', message? }.

export class ApiClientError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Status 0: the request never reached the server. Screens read `!err.status` as
// "no connection" (STOIC-2771), and the message is what a person can act on
// instead of the browser's "Failed to fetch".
export const NO_CONNECTION = 'No connection. This needs a connection.';

export const isConnectionError = (error) => error instanceof ApiClientError && error.status === 0;

// `timeoutMs`: give up and treat it as no connection. A phone with one bar or
// behind a captive portal can leave a request hanging for a minute.
async function send(path, init, timeoutMs) {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetch(path, controller ? { ...init, signal: controller.signal } : init);
  } catch {
    throw new ApiClientError(NO_CONNECTION, 0);
  } finally {
    clearTimeout(timer);
  }
}

async function parse(res) {
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok || body?.result === 'error') {
    throw new ApiClientError(body?.message || `Request failed (${res.status})`, res.status);
  }
  return body;
}

export async function apiGet(path, { timeoutMs } = {}) {
  const res = await send(path, { cache: 'no-store' }, timeoutMs);
  return parse(res);
}

export async function apiPost(path, body) {
  const res = await send(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parse(res);
}

// Uploads. The Content-Type header is deliberately not set: the browser has to
// write it itself so the multipart boundary travels with it.
export async function apiUpload(path, formData) {
  const res = await send(path, { method: 'POST', body: formData });
  return parse(res);
}

export async function apiPut(path, body) {
  const res = await send(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parse(res);
}

export async function apiDelete(path) {
  const res = await send(path, { method: 'DELETE' });
  return parse(res);
}

export async function apiPatch(path, body) {
  const res = await send(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parse(res);
}

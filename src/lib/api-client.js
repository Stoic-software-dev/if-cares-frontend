// Thin fetch wrapper for the app's own API. Reads the legacy response contract:
// GETs return raw JSON; writes return { result: 'success' | 'error', message? }.

export class ApiClientError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
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

export async function apiGet(path) {
  const res = await fetch(path, { cache: 'no-store' });
  return parse(res);
}

export async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parse(res);
}

export async function apiPatch(path, body) {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parse(res);
}

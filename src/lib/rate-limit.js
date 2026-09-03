// Fixed-window counters, in the server process.
//
// The client error endpoint grew one of these because it is the only write a
// signed out caller can reach. Sign in is the other one, and it had none: fifteen
// wrong passwords in eleven seconds were all answered, at full speed, with no
// lockout — which is a credential stuffing surface and, because every attempt
// costs a bcrypt hash at cost 12, a way to pin the CPU with a handful of
// requests. Password reset had none either, so one address could be mailed a
// link as often as anyone liked and collect unbounded live tokens.
//
// In-process is the right size for this app: it runs as a single long lived Node
// server, and the window is a minute. A restart forgives whoever was being
// limited, which is a fair trade for not adding a store to keep this in.

const buckets = new Map(); // bucket -> Map(key -> { count, resetAt })

function bucketOf(name) {
  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = new Map();
    buckets.set(name, bucket);
  }
  return bucket;
}

/**
 * Counts a hit and says whether it is over the limit.
 * @returns {{ limited: boolean, retryAfterSec: number }}
 */
export function hit({ bucket: name, key, limit, windowMs }) {
  const bucket = bucketOf(name);
  const now = Date.now();
  const entry = bucket.get(key);

  if (!entry || now > entry.resetAt) {
    bucket.set(key, { count: 1, resetAt: now + windowMs });
    // The map would grow forever on a busy server otherwise.
    if (bucket.size > 5000) {
      for (const [k, v] of bucket) if (now > v.resetAt) bucket.delete(k);
    }
    return { limited: false, retryAfterSec: 0 };
  }

  entry.count += 1;
  const limited = entry.count > limit;
  return { limited, retryAfterSec: limited ? Math.ceil((entry.resetAt - now) / 1000) : 0 };
}

/** Forgets a key — used when a sign in succeeds, so a typo costs nothing later. */
export function clear(name, key) {
  bucketOf(name).delete(key);
}

/**
 * The caller's address, as far as it can be known.
 *
 * Behind a proxy the leftmost `x-forwarded-for` entry is written by the client,
 * so it is a hint and not an identity: anyone can spread their attempts across
 * as many fake addresses as they like. Every limit that protects a specific
 * account is therefore keyed on the account as well, which is the half an
 * attacker cannot vary.
 */
export function clientIp(req) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'local'
  );
}

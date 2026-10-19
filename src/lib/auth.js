import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from './db';
import { ApiError } from './http';
import { sessionMsFor } from './session-policy.mjs';

const BCRYPT_ROUNDS = 12;

export function cookieName() {
  return process.env.AUTH_COOKIE_NAME || 'ifc_session';
}

// Per role: see session-policy.mjs.
export function sessionTtlMs(role) {
  return sessionMsFor(role, process.env.SESSION_TTL_HOURS);
}

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new ApiError(500, 'Server auth is not configured (AUTH_SECRET).');
  }
  return new TextEncoder().encode(secret);
}

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Constant-shape compare used when the user does not exist (timing parity).
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZLR6BpQtdy3G1WwT0PPhU9nQ8H1u1u';
export function dummyPasswordCompare(password) {
  return bcrypt.compare(password, DUMMY_HASH);
}

export async function issueSessionCookie(user) {
  const ttl = sessionTtlMs(user.role);
  const expiresAt = Date.now() + ttl;
  const token = await new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(secretKey());

  cookies().set(cookieName(), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(ttl / 1000),
  });
  return expiresAt;
}

export function clearSessionCookie() {
  cookies().set(cookieName(), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

// Verifies the JWT then loads the user fresh from the DB (instant deactivation
// and role changes; site assignments are never trusted from the token).
// `accountGone` tells a valid session for an account that was deactivated or
// removed apart from one that simply ended: a phone holding that account's
// rosters for offline use (STOIC-2771) throws them away on the first.
async function readSession() {
  const token = cookies().get(cookieName())?.value;
  if (!token) return { session: null };
  let payload;
  try {
    ({ payload } = await jwtVerify(token, secretKey()));
  } catch {
    return { session: null };
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { sites: { include: { site: true } } },
  });
  if (!user || !user.active) return { session: null, accountGone: true };
  // How long a session lasts depends on the role (session-policy.mjs). A site
  // user made an administrator would otherwise keep a 14 day session as an
  // administrator: a change of role ends it.
  if (payload.role && payload.role !== user.role) return { session: null };
  return { session: { user, expiresAtMs: (payload.exp || 0) * 1000 } };
}

export async function getSession() {
  return (await readSession()).session;
}

// `tellGone`: answer 403 instead of 401 when the account was deactivated. Only
// /api/auth/me asks for it; every other screen reads 401 as "sign in again",
// which is right for a deactivated account too.
export async function requireUser({ tellGone = false } = {}) {
  const { session, accountGone } = await readSession();
  if (accountGone && tellGone) throw new ApiError(403, 'This account is no longer active.');
  if (!session) throw new ApiError(401, 'Not signed in.');
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.user.role !== 'ADMIN') throw new ApiError(403, 'Admin access required.');
  return session;
}

export function canAccessSiteName(user, siteName) {
  if (user.role === 'ADMIN' || user.allSites) return true;
  return (user.sites || []).some((us) => us.site?.name === siteName);
}

export async function requireSiteAccess(session, siteName) {
  if (!canAccessSiteName(session.user, siteName)) {
    throw new ApiError(403, 'You do not have access to this site.');
  }
}

// Sites visible to a session: all active sites for admin/allSites, otherwise
// the active sites the user is assigned to.
export async function visibleSites(session) {
  if (session.user.role === 'ADMIN' || session.user.allSites) {
    return prisma.site.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }
  return (session.user.sites || [])
    .map((us) => us.site)
    .filter((site) => site && site.active)
    .sort((a, b) => a.name.localeCompare(b.name));
}

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from './db';
import { ApiError } from './http';

const BCRYPT_ROUNDS = 12;

export function cookieName() {
  return process.env.AUTH_COOKIE_NAME || 'ifc_session';
}

export function sessionTtlMs() {
  const hours = Number(process.env.SESSION_TTL_HOURS || 8);
  return (Number.isFinite(hours) && hours > 0 ? hours : 8) * 60 * 60 * 1000;
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
  const expiresAt = Date.now() + sessionTtlMs();
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
    maxAge: Math.floor(sessionTtlMs() / 1000),
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
export async function getSession() {
  const token = cookies().get(cookieName())?.value;
  if (!token) return null;
  let payload;
  try {
    ({ payload } = await jwtVerify(token, secretKey()));
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { sites: { include: { site: true } } },
  });
  if (!user || !user.active) return null;
  return { user, expiresAtMs: (payload.exp || 0) * 1000 };
}

export async function requireUser() {
  const session = await getSession();
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

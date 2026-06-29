import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required in production");
}
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-me-in-production-please-32chars"
);
const COOKIE = "pos_session";
const MAX_AGE = 60 * 60 * 12; // 12h

export interface SessionUser {
  id: number;
  username: string;
  fullName: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  branchId: number | null;
  branchName: string | null;
  tenantId: number | null;
  tenantStatus: string | null; // TRIAL | ACTIVE | SUSPENDED | CANCELLED
  tenantPlan: string | null;
  isSuperAdmin: boolean;
  tokenVersion: number; // must match the DB user.tokenVersion (logout bumps it)
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(SECRET);

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return (payload as { user: SessionUser }).user;
  } catch {
    return null;
  }
}

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "INVALID" | "LOCKED" | "INACTIVE" };

// Authenticate by username + password (or PIN), with account lockout.
export async function authenticate(username: string, secret: string): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: true, branch: true, tenant: true },
  });
  if (!user) {
    // equalize response time so a missing username can't be distinguished from a wrong password
    // by latency (user enumeration). Compare against a fixed valid-format hash; result ignored.
    await bcrypt.compare(secret, "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy");
    return { ok: false, reason: "INVALID" };
  }
  if (!user.isActive) return { ok: false, reason: "INACTIVE" };
  if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, reason: "LOCKED" };

  const ok =
    (await verifyPassword(secret, user.passwordHash)) ||
    (user.pin ? await verifyPassword(secret, user.pin) : false);

  if (!ok) {
    // atomic increment so concurrent failed attempts can't lose counts and slip past the lockout
    const { failedLogins } = await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: { increment: 1 } },
      select: { failedLogins: true },
    });
    if (failedLogins >= MAX_FAILED) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) },
      });
      return { ok: false, reason: "LOCKED" };
    }
    return { ok: false, reason: "INVALID" };
  }

  if (user.failedLogins > 0 || user.lockedUntil)
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });

  return {
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roleCode: user.role.code,
      roleName: user.role.name,
      permissions: JSON.parse(user.role.permissions) as string[],
      branchId: user.branchId,
      branchName: user.branch?.name ?? null,
      tenantId: user.tenantId,
      tenantStatus: user.tenant?.status ?? null,
      tenantPlan: user.tenant?.plan ?? null,
      isSuperAdmin: user.isSuperAdmin,
      tokenVersion: user.tokenVersion,
    },
  };
}

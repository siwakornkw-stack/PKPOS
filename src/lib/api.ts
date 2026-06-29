import "server-only";
import { NextResponse } from "next/server";
import { getSession, type SessionUser } from "./auth";
import { hasPermission, type PermissionKey } from "./permissions";
import { isBlocked } from "./plans";
import { prisma } from "./db";

// Standard error envelope (matches the Error Handling slide: 400/401/403/...).
export function apiError(status: number, message: string, detail?: unknown) {
  return NextResponse.json(
    { error: { code: status, message, detail } },
    { status }
  );
}

// Guard a route handler: requires a session and (optionally) a permission.
export async function requireAuth(
  perm?: PermissionKey
): Promise<{ user: SessionUser } | NextResponse> {
  const user = await getSession();
  if (!user) return apiError(401, "ยังไม่ได้เข้าสู่ระบบ");
  // freshness: a deactivated user's still-valid JWT must stop working before its 12h expiry.
  // (Tenant-suspension is gated in requireBranch only, so a suspended owner can still reach billing.)
  const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { isActive: true, tokenVersion: true } });
  if (!fresh || !fresh.isActive) return apiError(401, "บัญชีถูกปิดใช้งาน กรุณาเข้าสู่ระบบใหม่");
  // server-side logout: a token whose version is behind the user's current one is revoked
  if (fresh.tokenVersion !== user.tokenVersion) return apiError(401, "เซสชันสิ้นสุด กรุณาเข้าสู่ระบบใหม่");
  if (perm && !hasPermission(user.permissions, perm)) {
    return apiError(403, "ไม่มีสิทธิ์ใช้งานฟังก์ชันนี้");
  }
  return { user };
}

// Like requireAuth but also guarantees the user is bound to a branch.
// Use for any route that reads/writes branch-scoped data.
export async function requireBranch(
  perm?: PermissionKey
): Promise<{ user: SessionUser; branchId: number } | NextResponse> {
  const auth = await requireAuth(perm);
  if (auth instanceof Response) return auth;
  if (auth.user.branchId == null) return apiError(403, "บัญชีนี้ไม่ได้ผูกกับสาขา");
  // Authoritative freshness gate (one query): the JWT copy can be up to 12h stale, so we
  // re-read the user's live isActive + the tenant's status. Blocks a just-deactivated user
  // and a just-suspended/expired tenant from hitting branch APIs until the token expires.
  const u = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { isActive: true, tenant: { select: { status: true, trialEndsAt: true } } },
  });
  if (!u || !u.isActive) return apiError(401, "บัญชีถูกปิดใช้งาน กรุณาเข้าสู่ระบบใหม่");
  if (u.tenant && isBlocked(u.tenant, new Date()))
    return apiError(402, "บัญชีถูกระงับ - กรุณาต่ออายุการใช้งาน");
  return { user: auth.user, branchId: auth.user.branchId };
}

// Platform owner only (super-admin), for /api/admin/* tenant management.
export async function requireSuperAdmin(): Promise<{ user: SessionUser } | NextResponse> {
  const user = await getSession();
  if (!user) return apiError(401, "ยังไม่ได้เข้าสู่ระบบ");
  if (!user.isSuperAdmin) return apiError(403, "เฉพาะผู้ดูแลระบบแพลตฟอร์ม");
  // re-verify against the DB (the JWT can be up to 12h stale): a revoked super-admin or a
  // server-side logout must lose admin access immediately, not only at token expiry.
  const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { isActive: true, isSuperAdmin: true, tokenVersion: true } });
  if (!fresh || !fresh.isActive || !fresh.isSuperAdmin) return apiError(403, "เฉพาะผู้ดูแลระบบแพลตฟอร์ม");
  if (fresh.tokenVersion !== user.tokenVersion) return apiError(401, "เซสชันสิ้นสุด กรุณาเข้าสู่ระบบใหม่");
  return { user };
}

export async function writeAudit(opts: {
  userId?: number | null;
  action: string;
  entity?: string;
  entityId?: string | number;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      userId: opts.userId ?? null,
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId != null ? String(opts.entityId) : null,
      before: opts.before ? JSON.stringify(opts.before) : null,
      after: opts.after ? JSON.stringify(opts.after) : null,
      ip: opts.ip ?? null,
    },
  });
}

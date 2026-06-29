import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS, canGrantRole } from "@/lib/permissions";
import { hashPassword } from "@/lib/auth";
import { PLANS } from "@/lib/plans";

export async function GET() {
  const auth = await requireAuth(PERMISSIONS.SETTINGS_MANAGE);
  if (auth instanceof Response) return auth;

  const users = await prisma.user.findMany({
    where: { tenantId: auth.user.tenantId, isSuperAdmin: false },
    orderBy: { id: "asc" },
    include: { role: true, branch: { select: { name: true } } },
  });
  const roles = await prisma.role.findMany({ orderBy: { id: "asc" } });
  const branches = await prisma.branch.findMany({ where: { tenantId: auth.user.tenantId ?? -1 }, orderBy: { id: "asc" }, select: { id: true, name: true } });

  return Response.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      roleName: u.role.name,
      roleCode: u.role.code,
      branchId: u.branchId,
      branch: u.branch?.name ?? "-",
      isActive: u.isActive,
    })),
    roles: roles.map((r) => ({
      code: r.code,
      name: r.name,
      permissions: JSON.parse(r.permissions) as string[],
    })),
    branches,
  });
}

const createSchema = z.object({
  username: z.string().min(3),
  fullName: z.string().min(1),
  roleCode: z.string().min(1),
  branchId: z.number().int().nullable().optional(),
  pin: z.string().min(4).max(20),
});

// POST: create a staff user
export async function POST(req: NextRequest) {
  const auth = await requireAuth(PERMISSIONS.USER_MANAGE);
  if (auth instanceof Response) return auth;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลผู้ใช้ไม่ถูกต้อง", parsed.error.flatten());
  const d = parsed.data;

  const dup = await prisma.user.findUnique({ where: { username: d.username } });
  if (dup) return apiError(409, "ชื่อผู้ใช้นี้มีอยู่แล้ว");

  const role = await prisma.role.findUnique({ where: { code: d.roleCode } });
  if (!role) return apiError(400, "ไม่พบบทบาทที่เลือก");
  // role ceiling: cannot create a user with more permissions than the caller holds
  if (!canGrantRole(auth.user.permissions, JSON.parse(role.permissions) as string[]))
    return apiError(403, "ไม่มีสิทธิ์กำหนดบทบาทนี้");

  // a supplied branchId must belong to the caller's tenant (no cross-tenant placement)
  let branchId = auth.user.branchId;
  if (d.branchId != null) {
    const b = await prisma.branch.findUnique({ where: { id: d.branchId } });
    if (!b || b.tenantId !== auth.user.tenantId) return apiError(400, "ไม่พบสาขา");
    branchId = d.branchId;
  }

  // enforce the subscription plan's user limit
  const plan = PLANS[auth.user.tenantPlan ?? "TRIAL"] ?? PLANS.TRIAL;
  const userCount = await prisma.user.count({ where: { tenantId: auth.user.tenantId } });
  if (userCount >= plan.maxUsers)
    return apiError(403, `แผน ${plan.name} จำกัด ${plan.maxUsers} ผู้ใช้ - อัปเกรดแผนเพื่อเพิ่ม`);

  const hash = await hashPassword(d.pin);
  const user = await prisma.user.create({
    data: {
      username: d.username,
      fullName: d.fullName,
      passwordHash: hash,
      pin: hash,
      roleId: role.id,
      branchId,
      tenantId: auth.user.tenantId,
    },
  });
  await writeAudit({ userId: auth.user.id, action: "create_user", entity: "user", entityId: user.id });
  return Response.json({ ok: true, id: user.id });
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS, canGrantRole } from "@/lib/permissions";
import { hashPassword } from "@/lib/auth";

const schema = z.object({
  fullName: z.string().min(1).optional(),
  roleCode: z.string().optional(),
  isActive: z.boolean().optional(),
  pin: z.string().min(4).max(20).optional(), // reset PIN
});

// PATCH: edit a user (role, active, name) or reset PIN
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(PERMISSIONS.USER_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");
  const d = parsed.data;

  const target = await prisma.user.findUnique({ where: { id } });
  // tenant-scope: never touch another tenant's user or a platform super-admin (cross-tenant IDOR)
  if (!target || target.tenantId !== auth.user.tenantId || target.isSuperAdmin)
    return apiError(404, "ไม่พบผู้ใช้");
  // no self privilege/active edits (prevents self-escalation and self-lockout)
  if (id === auth.user.id && (d.roleCode || d.isActive != null))
    return apiError(403, "แก้บทบาท/สถานะของตัวเองไม่ได้");

  const data: Record<string, unknown> = {};
  if (d.fullName) data.fullName = d.fullName;
  if (d.isActive != null) data.isActive = d.isActive;
  if (d.roleCode) {
    const role = await prisma.role.findUnique({ where: { code: d.roleCode } });
    if (!role) return apiError(400, "ไม่พบบทบาท");
    // role ceiling: cannot grant a role broader than the caller's own permissions
    if (!canGrantRole(auth.user.permissions, JSON.parse(role.permissions) as string[]))
      return apiError(403, "ไม่มีสิทธิ์กำหนดบทบาทนี้");
    data.roleId = role.id;
  }
  if (d.pin) {
    const hash = await hashPassword(d.pin);
    data.passwordHash = hash;
    data.pin = hash;
    data.failedLogins = 0;
    data.lockedUntil = null;
  }

  await prisma.user.update({ where: { id }, data });
  await writeAudit({
    userId: auth.user.id, action: d.pin ? "reset_pin" : "update_user",
    entity: "user", entityId: id,
  });
  return Response.json({ ok: true });
}

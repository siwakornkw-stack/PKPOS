import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, apiError, writeAudit } from "@/lib/api";
import { deleteTenantCascade } from "@/lib/tenant-admin";

const schema = z.object({
  status: z.enum(["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"]).optional(),
  plan: z.enum(["TRIAL", "BASIC", "PRO"]).optional(),
  extendDays: z.number().int().optional(), // extend trial/subscription
});

const delSchema = z.object({ confirm: z.string(), force: z.boolean().optional() });

// GET: a tenant's detail incl. its users + branches (super-admin only; no secrets).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      branches: { select: { id: true, code: true, name: true }, orderBy: { id: "asc" } },
      users: {
        orderBy: { id: "asc" },
        select: {
          id: true, username: true, fullName: true, isActive: true,
          lockedUntil: true, createdAt: true,
          role: { select: { code: true, name: true } },
          branch: { select: { name: true } },
        },
      },
    },
  });
  if (!tenant) return apiError(404, "ไม่พบ tenant");

  return Response.json({
    tenant: {
      id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan, status: tenant.status,
      trialEndsAt: tenant.trialEndsAt, currentPeriodEnd: tenant.currentPeriodEnd, createdAt: tenant.createdAt,
      cardBrand: tenant.cardBrand, cardLast4: tenant.cardLast4,
      branches: tenant.branches,
      users: tenant.users.map((u) => ({
        id: u.id, username: u.username, fullName: u.fullName, isActive: u.isActive,
        locked: !!(u.lockedUntil && u.lockedUntil > new Date()),
        role: u.role.name, roleCode: u.role.code, branch: u.branch?.name ?? null, createdAt: u.createdAt,
      })),
    },
  });
}

// PATCH: super-admin manages a tenant (activate/suspend/extend/change plan).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return apiError(404, "ไม่พบ tenant");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.status) data.status = d.status;
  if (d.plan) data.plan = d.plan;
  if (d.extendDays) {
    const base = tenant.status === "TRIAL"
      ? (tenant.trialEndsAt && tenant.trialEndsAt > new Date() ? tenant.trialEndsAt : new Date())
      : (tenant.currentPeriodEnd && tenant.currentPeriodEnd > new Date() ? tenant.currentPeriodEnd : new Date());
    const next = new Date(base.getTime() + d.extendDays * 86400000);
    if (tenant.status === "TRIAL") data.trialEndsAt = next; else data.currentPeriodEnd = next;
  }

  await prisma.tenant.update({ where: { id }, data });
  await writeAudit({ userId: auth.user.id, action: "admin_update_tenant", entity: "tenant", entityId: id, after: data });
  return Response.json({ ok: true });
}

// DELETE: permanently remove a tenant and ALL of its data (super-admin only). Irreversible.
// Requires confirm === tenant.slug; refuses an ACTIVE tenant unless force:true (fat-finger guard).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) return apiError(404, "ไม่พบ tenant");

  const parsed = delSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.confirm !== tenant.slug)
    return apiError(400, "พิมพ์ slug ของร้านให้ตรงเพื่อยืนยันการลบถาวร");
  if (tenant.status === "ACTIVE" && !parsed.data.force)
    return apiError(409, "ร้านนี้สถานะ ACTIVE (อาจมีลูกค้าจ่ายเงินอยู่) - ระงับก่อนหรือส่ง force");

  const deleted = await prisma.$transaction((tx) => deleteTenantCascade(tx, id), { timeout: 30000 });
  await writeAudit({
    userId: auth.user.id, action: "delete_tenant", entity: "tenant", entityId: id,
    before: { name: tenant.name, slug: tenant.slug, status: tenant.status }, after: deleted,
  });
  return Response.json({ ok: true, deleted });
}

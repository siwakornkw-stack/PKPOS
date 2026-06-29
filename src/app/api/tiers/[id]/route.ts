import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  name: z.string().min(1).optional(),
  minSpent: z.number().nonnegative().optional(),
  pointMultiplier: z.number().positive().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.PROMOTION_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  const existing = await prisma.memberTier.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== auth.user.tenantId) return apiError(404, "ไม่พบระดับสมาชิก");

  const tier = await prisma.memberTier.update({ where: { id }, data: parsed.data });
  await writeAudit({ userId: auth.user.id, action: "update_tier", entity: "member_tier", entityId: id });
  return Response.json({ tier });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.PROMOTION_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);
  const existing = await prisma.memberTier.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== auth.user.tenantId) return apiError(404, "ไม่พบระดับสมาชิก");
  // detach members on this tier first (FK is optional)
  await prisma.member.updateMany({ where: { tierId: id }, data: { tierId: null } });
  await prisma.memberTier.delete({ where: { id } });
  await writeAudit({ userId: auth.user.id, action: "delete_tier", entity: "member_tier", entityId: id });
  return Response.json({ ok: true });
}

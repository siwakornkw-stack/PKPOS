import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  name: z.string().min(1).optional(),
  pointsCost: z.number().int().positive().optional(),
  value: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.PROMOTION_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  const existing = await prisma.reward.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== auth.user.tenantId) return apiError(404, "ไม่พบของรางวัล");

  const reward = await prisma.reward.update({ where: { id }, data: parsed.data });
  await writeAudit({ userId: auth.user.id, action: "update_reward", entity: "reward", entityId: id });
  return Response.json({ reward });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.PROMOTION_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);
  const existing = await prisma.reward.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== auth.user.tenantId) return apiError(404, "ไม่พบของรางวัล");
  await prisma.reward.delete({ where: { id } });
  await writeAudit({ userId: auth.user.id, action: "delete_reward", entity: "reward", entityId: id });
  return Response.json({ ok: true });
}

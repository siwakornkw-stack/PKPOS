import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  name: z.string().min(1).optional(),
  value: z.number().positive().optional(),
  minSpend: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  memberOnly: z.boolean().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  days: z.string().regex(/^[0-6]*$/).nullable().optional(),
  startMin: z.number().int().min(0).max(1439).nullable().optional(),
  endMin: z.number().int().min(0).max(1439).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.PROMOTION_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  const existing = await prisma.promotion.findUnique({ where: { id } });
  if (!existing || existing.branchId !== auth.branchId) return apiError(404, "ไม่พบโปรโมชัน");

  const { startsAt, endsAt, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (startsAt !== undefined) data.startsAt = startsAt === "" ? null : new Date(startsAt);
  if (endsAt !== undefined) data.endsAt = endsAt === "" ? null : new Date(endsAt);

  const promo = await prisma.promotion.update({ where: { id }, data });
  await writeAudit({ userId: auth.user.id, action: "update_promotion", entity: "promotion", entityId: id });
  return Response.json({ promotion: promo });
}

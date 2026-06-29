import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// Loyalty tiers are tenant-wide (shared across the business's branches).

export async function GET() {
  const auth = await requireBranch();
  if (auth instanceof Response) return auth;
  if (auth.user.tenantId == null) return Response.json({ tiers: [] });
  const tiers = await prisma.memberTier.findMany({
    where: { tenantId: auth.user.tenantId },
    orderBy: { minSpent: "asc" },
  });
  return Response.json({ tiers });
}

const schema = z.object({
  name: z.string().min(1),
  minSpent: z.number().nonnegative().default(0),
  pointMultiplier: z.number().positive().default(1),
  sortOrder: z.number().int().default(0),
});

export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.PROMOTION_MANAGE);
  if (auth instanceof Response) return auth;
  if (auth.user.tenantId == null) return apiError(400, "บัญชีนี้ไม่ผูกกับร้าน");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลระดับสมาชิกไม่ถูกต้อง");

  const dup = await prisma.memberTier.findFirst({ where: { tenantId: auth.user.tenantId, name: parsed.data.name } });
  if (dup) return apiError(409, "ชื่อระดับนี้มีอยู่แล้ว");

  const tier = await prisma.memberTier.create({ data: { ...parsed.data, tenantId: auth.user.tenantId } });
  await writeAudit({ userId: auth.user.id, action: "create_tier", entity: "member_tier", entityId: tier.id });
  return Response.json({ tier });
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// Reward catalog is tenant-wide. GET is open to any branch user (POS shows it to
// redeem); create/edit needs PROMOTION_MANAGE.

export async function GET() {
  const auth = await requireBranch();
  if (auth instanceof Response) return auth;
  if (auth.user.tenantId == null) return Response.json({ rewards: [] });
  const rewards = await prisma.reward.findMany({
    where: { tenantId: auth.user.tenantId },
    orderBy: { pointsCost: "asc" },
  });
  return Response.json({ rewards });
}

const schema = z
  .object({
    name: z.string().min(1),
    pointsCost: z.number().int().positive(),
    type: z.enum(["DISCOUNT_AMOUNT", "FREE_ITEM"]),
    value: z.number().nonnegative().default(0),
    menuItemId: z.number().int().nullable().default(null),
    isActive: z.boolean().default(true),
  })
  .refine((d) => (d.type === "FREE_ITEM" ? d.menuItemId != null : d.value > 0), {
    message: "FREE_ITEM ต้องเลือกเมนู, DISCOUNT_AMOUNT ต้องระบุมูลค่า",
  });

export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.PROMOTION_MANAGE);
  if (auth instanceof Response) return auth;
  if (auth.user.tenantId == null) return apiError(400, "บัญชีนี้ไม่ผูกกับร้าน");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, parsed.error.issues[0]?.message ?? "ข้อมูลของรางวัลไม่ถูกต้อง");

  // a FREE_ITEM reward must point at a menu item in one of the tenant's branches
  if (parsed.data.menuItemId != null) {
    const mi = await prisma.menuItem.findFirst({
      where: { id: parsed.data.menuItemId, branch: { tenantId: auth.user.tenantId } },
    });
    if (!mi) return apiError(400, "ไม่พบเมนูที่เลือก");
  }

  const reward = await prisma.reward.create({ data: { ...parsed.data, tenantId: auth.user.tenantId } });
  await writeAudit({ userId: auth.user.id, action: "create_reward", entity: "reward", entityId: reward.id });
  return Response.json({ reward });
}

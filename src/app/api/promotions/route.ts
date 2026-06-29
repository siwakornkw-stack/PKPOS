import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { promoActiveNow } from "@/lib/promo";
import { timeWindowActive } from "@/lib/timewin";

// GET: promotions for the branch. ?all=1 returns every promo (management),
// otherwise only the ones currently redeemable at the POS (active + date + time
// window + usage cap). memberOnly is enforced at apply time, not hidden here.
export async function GET(req: NextRequest) {
  const auth = await requireBranch();
  if (auth instanceof Response) return auth;
  const all = req.nextUrl.searchParams.get("all") === "1";

  const promos = await prisma.promotion.findMany({
    where: { branchId: auth.branchId },
    orderBy: { id: "desc" },
  });
  const now = new Date();
  const list = all
    ? promos
    : promos.filter(
        (p) =>
          promoActiveNow(p, now) &&
          timeWindowActive(now, p.days, p.startMin, p.endMin) &&
          (p.usageLimit == null || p.usedCount < p.usageLimit)
      );
  return Response.json({ promotions: list });
}

const schema = z
  .object({
    code: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["PERCENT", "AMOUNT"]).default("PERCENT"),
    value: z.number().nonnegative().default(0),
    minSpend: z.number().nonnegative().default(0),
    isActive: z.boolean().default(true),
    scope: z.enum(["ORDER", "ITEM", "CATEGORY", "BXGY"]).default("ORDER"),
    menuItemId: z.number().int().nullable().default(null),
    categoryId: z.number().int().nullable().default(null),
    buyQty: z.number().int().positive().nullable().default(null),
    getQty: z.number().int().positive().nullable().default(null),
    memberOnly: z.boolean().default(false),
    days: z.string().regex(/^[0-6]*$/).nullable().default(null),
    startMin: z.number().int().min(0).max(1439).nullable().default(null),
    endMin: z.number().int().min(0).max(1439).nullable().default(null),
    usageLimit: z.number().int().positive().nullable().default(null),
  })
  .refine((d) => (d.scope === "BXGY" ? d.menuItemId != null && d.buyQty != null && d.getQty != null : true), {
    message: "BXGY ต้องระบุเมนู, จำนวนซื้อ, จำนวนแถม",
  })
  .refine((d) => (d.scope === "ITEM" ? d.menuItemId != null : true), { message: "โปรเฉพาะเมนูต้องระบุเมนู" })
  .refine((d) => (d.scope === "CATEGORY" ? d.categoryId != null : true), { message: "โปรเฉพาะหมวดต้องระบุหมวด" })
  .refine((d) => (d.scope !== "BXGY" ? d.value > 0 : true), { message: "ต้องระบุมูลค่าส่วนลด" });

// POST: create a promotion (management)
export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.PROMOTION_MANAGE);
  if (auth instanceof Response) return auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, parsed.error.issues[0]?.message ?? "ข้อมูลโปรโมชันไม่ถูกต้อง");
  const d = parsed.data;

  // scope targets must belong to this branch (no cross-branch reference)
  if (d.menuItemId != null) {
    const mi = await prisma.menuItem.findUnique({ where: { id: d.menuItemId } });
    if (!mi || mi.branchId !== auth.branchId) return apiError(400, "ไม่พบเมนูที่เลือก");
  }
  if (d.categoryId != null) {
    const c = await prisma.menuCategory.findUnique({ where: { id: d.categoryId } });
    if (!c || c.branchId !== auth.branchId) return apiError(400, "ไม่พบหมวดที่เลือก");
  }

  const promo = await prisma.promotion.create({ data: { ...d, branchId: auth.branchId } });
  await writeAudit({ userId: auth.user.id, action: "create_promotion", entity: "promotion", entityId: promo.id });
  return Response.json({ promotion: promo });
}

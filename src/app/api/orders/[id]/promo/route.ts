import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { PERMISSIONS } from "@/lib/permissions";
import { recalcOrder } from "@/lib/orders";
import { promoDiscount, promoEligible, type PromoLine } from "@/lib/promo";

const schema = z.object({ promotionId: z.number().int().nullable() });

// POST: apply (or clear) a promotion on an order. Anyone with POS access can
// apply an eligible promo - this is NOT a manual discount override.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  if (!rateLimit(`promo:${auth.user.id}`, 100, 60_000)) return apiError(429, "ดำเนินการถี่เกินไป ลองใหม่อีกครั้ง");
  const orderId = Number((await params).id);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  const order = await prisma.salesOrder.findUnique({
    where: { id: orderId },
    include: { items: { where: { status: { not: "VOID" } }, include: { menuItem: { select: { categoryId: true } } } } },
  });
  if (!order || order.branchId !== auth.branchId) return apiError(404, "ไม่พบออเดอร์");
  if (["PAID", "VOID", "CLOSED"].includes(order.status)) return apiError(409, "ออเดอร์นี้ปิดแล้ว");
  // a non-promo discount (a voucher) is mutually exclusive with a promotion: discount>0 with no
  // promotionId means a voucher is active, so block applying a promo on top of it.
  if (parsed.data.promotionId != null && order.promotionId == null && order.discount > 0)
    return apiError(409, "บิลนี้มีส่วนลดจากโค้ดอยู่แล้ว ยกเลิกก่อนใช้โปรโมชัน");

  let discount = 0;
  if (parsed.data.promotionId != null) {
    const promo = await prisma.promotion.findUnique({ where: { id: parsed.data.promotionId } });
    if (!promo || promo.branchId !== auth.branchId) return apiError(404, "ไม่พบโปรโมชัน");
    if (!promoEligible(promo, new Date(), order.memberId != null)) {
      if (promo.memberOnly && order.memberId == null) return apiError(422, "โปรนี้สำหรับสมาชิกเท่านั้น");
      return apiError(422, "โปรโมชันหมดอายุหรือไม่อยู่ในช่วงเวลาที่ใช้ได้");
    }
    const lines: PromoLine[] = order.items.map((it) => ({
      menuItemId: it.menuItemId,
      categoryId: it.menuItem.categoryId,
      qty: it.qty,
      unitPrice: it.unitPrice,
      lineAmount: it.lineAmount,
    }));
    discount = promoDiscount(promo, lines, order.subtotal);
    if (discount <= 0) return apiError(422, `โปรนี้ใช้กับบิลนี้ไม่ได้ (ยอดขั้นต่ำ ${promo.minSpend} บาท หรือไม่มีสินค้าที่ร่วมรายการ)`);
  }

  await prisma.salesOrder.update({
    where: { id: orderId },
    data: { discount, promotionId: parsed.data.promotionId },
  });
  const updated = await recalcOrder(prisma, orderId);
  await writeAudit({
    userId: auth.user.id, action: "apply_promo", entity: "sales_order", entityId: orderId,
    after: { promotionId: parsed.data.promotionId, discount },
  });

  return Response.json({ ok: true, discount, netAmount: updated?.netAmount });
}

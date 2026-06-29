import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { recalcOrder } from "@/lib/orders";
import { simpleDiscount } from "@/lib/promo";

const schema = z.object({ code: z.string().min(1) });

// Apply a single-use voucher to an order (marks it used).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  const orderId = Number((await params).id);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "กรุณากรอกโค้ด");

  const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
  if (!order || order.branchId !== auth.branchId) return apiError(404, "ไม่พบออเดอร์");
  if (["PAID", "VOID", "CLOSED", "REFUNDED"].includes(order.status))
    return apiError(409, "ออเดอร์นี้ปิดแล้ว");
  // a voucher and a promotion (or another voucher) are mutually exclusive: one discount source
  // per bill. Otherwise applying a voucher would silently overwrite an active promo's discount
  // while leaving promotionId set, corrupting promo usage accounting at payment.
  if (order.promotionId != null || order.discount > 0)
    return apiError(409, "บิลนี้มีส่วนลด/โปรโมชันอยู่แล้ว ยกเลิกก่อนใช้โค้ด");

  const voucher = await prisma.voucher.findUnique({
    where: { branchId_code: { branchId: auth.branchId, code: parsed.data.code.trim() } },
  });
  if (!voucher) return apiError(404, "ไม่พบโค้ดนี้");
  if (voucher.used) return apiError(409, "โค้ดนี้ถูกใช้ไปแล้ว");

  const discount = simpleDiscount(voucher.type, voucher.value, voucher.minSpend, order.subtotal);
  if (discount <= 0) return apiError(422, `ยอดไม่ถึงขั้นต่ำ ${voucher.minSpend} บาท`);

  const ok = await prisma.$transaction(async (tx) => {
    // atomically claim the single-use voucher: only one order can consume it
    const claim = await tx.voucher.updateMany({ where: { id: voucher.id, used: false }, data: { used: true, usedAt: new Date() } });
    if (claim.count === 0) throw new Error("USED");
    await tx.salesOrder.update({ where: { id: orderId }, data: { discount } });
    await recalcOrder(tx, orderId);
    return true;
  }).catch((e) => {
    if (e instanceof Error && e.message === "USED") return false;
    throw e;
  });
  if (!ok) return apiError(409, "โค้ดนี้ถูกใช้ไปแล้ว");

  await writeAudit({ userId: auth.user.id, action: "apply_voucher", entity: "sales_order", entityId: orderId, after: { code: voucher.code, discount } });
  return Response.json({ ok: true, discount });
}

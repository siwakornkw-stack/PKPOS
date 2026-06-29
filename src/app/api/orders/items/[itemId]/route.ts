import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { recalcOrder } from "@/lib/orders";

const schema = z.object({
  status: z.enum(["PENDING", "COOKING", "DONE", "SERVED", "VOID"]),
});

// PATCH: update a single order line status.
// Kitchen uses COOKING/DONE/SERVED; POS uses VOID (needs ORDER_VOID).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const itemId = Number((await params).itemId);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "สถานะไม่ถูกต้อง");

  const perm =
    parsed.data.status === "VOID" ? PERMISSIONS.ORDER_VOID : PERMISSIONS.KITCHEN_VIEW;
  const auth = await requireAuth(perm);
  if (auth instanceof Response) return auth;

  const item = await prisma.salesOrderItem.findUnique({
    where: { id: itemId },
    include: { order: true },
  });
  if (!item || item.order.branchId !== auth.user.branchId)
    return apiError(404, "ไม่พบรายการ");
  if (["PAID", "VOID", "CLOSED"].includes(item.order.status))
    return apiError(409, "ออเดอร์นี้ปิดแล้ว แก้ไขรายการไม่ได้");

  if (parsed.data.status === "VOID") {
    // voiding a line changes the order total - keep both writes atomic, and re-claim the
    // order inside the tx so a concurrent /pay cannot settle it while we void a line.
    const ok = await prisma.$transaction(async (tx) => {
      const claim = await tx.salesOrder.updateMany({
        where: { id: item.orderId, status: { notIn: ["PAID", "VOID", "CLOSED", "REFUNDED"] } },
        data: { status: item.order.status },
      });
      if (claim.count === 0) throw new Error("CLOSED");
      await tx.salesOrderItem.update({ where: { id: itemId }, data: { status: "VOID" } });
      await recalcOrder(tx, item.orderId);
      return true;
    }).catch((e) => {
      if (e instanceof Error && e.message === "CLOSED") return false;
      throw e;
    });
    if (!ok) return apiError(409, "ออเดอร์นี้ปิดแล้ว แก้ไขรายการไม่ได้");
    await writeAudit({
      userId: auth.user.id, action: "void_item", entity: "sales_order_item", entityId: itemId,
    });
  } else {
    await prisma.salesOrderItem.update({
      where: { id: itemId },
      data: { status: parsed.data.status },
    });
  }

  return Response.json({ ok: true });
}

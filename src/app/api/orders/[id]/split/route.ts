import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { PERMISSIONS } from "@/lib/permissions";
import { recalcOrder } from "@/lib/orders";
import { nextDocNo } from "@/lib/docno";

const schema = z.object({
  itemIds: z.array(z.number().int()).min(1),
  tableId: z.number().int().nullable().optional(),
});

// Split: move the selected line items out of this order into a new order.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  if (!rateLimit(`split:${auth.user.id}`, 100, 60_000)) return apiError(429, "ดำเนินการถี่เกินไป ลองใหม่อีกครั้ง");
  const orderId = Number((await params).id);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  const order = await prisma.salesOrder.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order || order.branchId !== auth.branchId) return apiError(404, "ไม่พบออเดอร์");
  if (["PAID", "VOID", "CLOSED", "REFUNDED"].includes(order.status))
    return apiError(409, "ออเดอร์นี้ปิดแล้ว");
  // redeemed points/reward are debited from the member up-front and live on this order;
  // splitting can't safely divide them, so require removing the redemption first.
  if (order.pointsRedeemed > 0 || order.rewardId)
    return apiError(409, "บิลนี้มีการแลกแต้ม/ของรางวัล - ยกเลิกการแลกก่อนแยกบิล");
  // a target table must belong to THIS branch (no cross-branch/tenant table write)
  if (parsed.data.tableId != null) {
    const t = await prisma.diningTable.findFirst({ where: { id: parsed.data.tableId, branchId: auth.branchId } });
    if (!t) return apiError(404, "ไม่พบโต๊ะปลายทาง");
  }

  const live = order.items.filter((i) => i.status !== "VOID");
  const moving = live.filter((i) => parsed.data.itemIds.includes(i.id));
  if (moving.length === 0) return apiError(400, "ไม่ได้เลือกรายการ");
  if (moving.length === live.length) return apiError(422, "ต้องเหลืออย่างน้อย 1 รายการในบิลเดิม");

  const branch = await prisma.branch.findUnique({ where: { id: auth.branchId } });
  if (!branch) return apiError(500, "ไม่พบข้อมูลสาขา");

  const open = ["DRAFT", "SENT", "SERVED"];
  const newOrder = await prisma.$transaction(async (tx) => {
    // atomically claim the source order so a concurrent /pay cannot settle it mid-split
    // (writing status to its own open value locks the row + the WHERE guard rejects if closed).
    const claim = await tx.salesOrder.updateMany({
      where: { id: orderId, status: { in: open } },
      data: { status: order.status },
    });
    if (claim.count === 0) throw new Error("CLOSED");

    const created = await tx.salesOrder.create({
      data: {
        docNo: await nextDocNo("SO", branch.code, tx),
        branchId: auth.branchId,
        orderType: order.orderType,
        tableId: parsed.data.tableId ?? null,
        guestCount: 1,
        memberId: order.memberId, // carry the member so the split-off bill still earns/links loyalty
        userId: auth.user.id,
        shiftId: order.shiftId,
        status: order.status,
      },
    });
    // move only items that still belong to THIS order (scope by orderId); all must move
    const moved = await tx.salesOrderItem.updateMany({
      where: { id: { in: moving.map((i) => i.id) }, orderId, status: { not: "VOID" } },
      data: { orderId: created.id },
    });
    if (moved.count !== moving.length) throw new Error("CONFLICT");
    // a bill-level promo/voucher discount can't be meaningfully divided across the two bills,
    // so clear it on the source order (the new order starts with none). Re-apply after splitting.
    if (order.promotionId != null || order.discount > 0)
      await tx.salesOrder.update({ where: { id: orderId }, data: { promotionId: null, discount: 0 } });
    if (parsed.data.tableId)
      // branch-scoped (validated above); split bills share a table so don't force-claim AVAILABLE
      await tx.diningTable.updateMany({ where: { id: parsed.data.tableId, branchId: auth.branchId }, data: { status: "OCCUPIED" } });
    await recalcOrder(tx, orderId);
    await recalcOrder(tx, created.id);
    return created;
  }).catch((e) => {
    if (e instanceof Error && (e.message === "CLOSED" || e.message === "CONFLICT")) return null;
    throw e;
  });
  if (!newOrder) return apiError(409, "ออเดอร์ถูกแก้ไขโดยรายการอื่น กรุณาลองใหม่");

  await writeAudit({
    userId: auth.user.id, action: "split_order", entity: "sales_order", entityId: orderId,
    after: { newOrderId: newOrder.id, movedItems: moving.length },
  });

  return Response.json({ ok: true, newOrderId: newOrder.id, newDocNo: newOrder.docNo });
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { PERMISSIONS } from "@/lib/permissions";
import { recalcOrder } from "@/lib/orders";

const schema = z.object({ tableId: z.number().int() });

// Move/transfer an open order to another table.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  if (!rateLimit(`move:${auth.user.id}`, 100, 60_000)) return apiError(429, "ดำเนินการถี่เกินไป ลองใหม่อีกครั้ง");
  const orderId = Number((await params).id);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
  if (!order || order.branchId !== auth.branchId) return apiError(404, "ไม่พบออเดอร์");
  if (!["DRAFT", "SENT", "SERVED"].includes(order.status))
    return apiError(409, "ออเดอร์นี้ปิดแล้ว");

  const target = await prisma.diningTable.findFirst({ where: { id: parsed.data.tableId, branchId: auth.branchId } });
  if (!target) return apiError(404, "ไม่พบโต๊ะปลายทาง");
  if (target.status !== "AVAILABLE" && target.id !== order.tableId)
    return apiError(409, "โต๊ะปลายทางไม่ว่าง");

  const open = ["DRAFT", "SENT", "SERVED"];
  const ok = await prisma.$transaction(async (tx) => {
    // claim the order is still open (a concurrent /pay must not settle it mid-move)
    const claimO = await tx.salesOrder.updateMany({ where: { id: orderId, status: { in: open } }, data: { status: order.status } });
    if (claimO.count === 0) throw new Error("CLOSED");
    // atomically claim the target table so two moves can't occupy it at once
    if (target.id !== order.tableId) {
      const claimT = await tx.diningTable.updateMany({ where: { id: target.id, branchId: auth.branchId, status: "AVAILABLE" }, data: { status: "OCCUPIED" } });
      if (claimT.count === 0) throw new Error("TABLE_TAKEN");
      if (order.tableId) await tx.diningTable.update({ where: { id: order.tableId }, data: { status: "AVAILABLE" } });
    }
    // moving to a table implies dine-in for POS/QR orders, but never reclassify an aggregator
    // delivery order (that would add a dine-in service charge and break reconciliation)
    const keepType = ["GRAB", "LINEMAN", "SHOPEE", "ROBINHOOD"].includes(order.source);
    await tx.salesOrder.update({
      where: { id: orderId },
      data: { tableId: target.id, ...(keepType ? {} : { orderType: "DINE_IN" }) },
    });
    // DINE_IN may add a service charge the order didn't have - recompute totals
    await recalcOrder(tx, orderId);
    return true;
  }).catch((e) => {
    if (e instanceof Error && (e.message === "CLOSED" || e.message === "TABLE_TAKEN")) return e.message;
    throw e;
  });
  if (ok === "CLOSED") return apiError(409, "ออเดอร์นี้ปิดแล้ว");
  if (ok === "TABLE_TAKEN") return apiError(409, "โต๊ะปลายทางไม่ว่าง");

  await writeAudit({
    userId: auth.user.id, action: "move_table", entity: "sales_order", entityId: orderId,
    after: { from: order.tableId, to: target.id },
  });

  return Response.json({ ok: true });
}

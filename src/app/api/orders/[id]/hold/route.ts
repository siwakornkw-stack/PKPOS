import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({ name: z.string().min(1) });

// Park/hold an open order (e.g. takeaway waiting for payment). Frees its table.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  const orderId = Number((await params).id);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "กรุณาตั้งชื่อบิล");

  const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
  if (!order || order.branchId !== auth.branchId) return apiError(404, "ไม่พบออเดอร์");
  if (!["DRAFT", "SENT", "SERVED"].includes(order.status))
    return apiError(409, "ออเดอร์นี้ปิดแล้ว");

  const ok = await prisma.$transaction(async (tx) => {
    // atomically claim: only hold an order still open, so a concurrent /pay can't be undone by
    // flipping a just-PAID order back to HELD (the unconditional update did exactly that).
    const claim = await tx.salesOrder.updateMany({
      where: { id: orderId, status: { in: ["DRAFT", "SENT", "SERVED"] } },
      data: { status: "HELD", holdName: parsed.data.name, tableId: null },
    });
    if (claim.count === 0) throw new Error("CLOSED");
    if (order.tableId)
      await tx.diningTable.update({ where: { id: order.tableId }, data: { status: "AVAILABLE" } });
    return true;
  }).catch((e) => {
    if (e instanceof Error && e.message === "CLOSED") return false;
    throw e;
  });
  if (!ok) return apiError(409, "ออเดอร์นี้ปิดแล้ว");

  await writeAudit({ userId: auth.user.id, action: "hold_order", entity: "sales_order", entityId: orderId });
  return Response.json({ ok: true });
}

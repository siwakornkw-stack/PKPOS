import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { recalcOrder, resolveOrderItems } from "@/lib/orders";
import { lineAmount } from "@/lib/totals";

const schema = z.object({
  items: z
    .array(
      z.object({
        menuItemId: z.number().int(),
        qty: z.number().int().min(1),
        options: z.array(z.number().int()).optional(),
        note: z.string().optional(),
        discount: z.number().nonnegative().default(0),
        unitPrice: z.number().positive().optional(), // open-price items only
      })
    )
    .min(1),
});

// POST: append a new round of items to an open order, send to kitchen
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  const { user, branchId } = auth;
  const orderId = Number((await params).id);

  const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
  if (!order || order.branchId !== branchId) return apiError(404, "ไม่พบออเดอร์");
  if (["PAID", "VOID", "CLOSED"].includes(order.status))
    return apiError(409, "ออเดอร์นี้ปิดแล้ว แก้ไขไม่ได้");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  let resolved;
  try {
    resolved = await resolveOrderItems(prisma, branchId, order.orderType, parsed.data.items);
  } catch {
    return apiError(400, "มีเมนูที่ไม่พบในระบบ");
  }

  const ok = await prisma.$transaction(async (tx) => {
    // re-claim the order inside the tx: a concurrent /pay must not have closed it
    const claim = await tx.salesOrder.updateMany({
      where: { id: orderId, status: { notIn: ["PAID", "VOID", "CLOSED", "REFUNDED"] } },
      data: { status: order.status },
    });
    if (claim.count === 0) throw new Error("CLOSED");

    for (const i of resolved) {
      await tx.salesOrderItem.create({
        data: {
          orderId,
          menuItemId: i.menuItemId,
          name: i.name,
          qty: i.qty,
          unitPrice: i.unitPrice,
          discount: i.discount,
          lineAmount: lineAmount(i),
          status: "PENDING",
          note: i.note,
          options: { create: i.optionRows.map((o) => ({ name: o.name, priceDelta: o.priceDelta })) },
        },
      });
    }
    if (order.status === "DRAFT")
      await tx.salesOrder.update({ where: { id: orderId }, data: { status: "SENT" } });
    await recalcOrder(tx, orderId);
    return true;
  }).catch((e) => {
    if (e instanceof Error && e.message === "CLOSED") return false;
    throw e;
  });
  if (!ok) return apiError(409, "ออเดอร์นี้ปิดแล้ว แก้ไขไม่ได้");

  await writeAudit({
    userId: user.id, action: "add_items", entity: "sales_order", entityId: orderId,
  });

  const updated = await prisma.salesOrder.findUnique({
    where: { id: orderId },
    include: { items: { orderBy: { createdAt: "asc" } }, table: true },
  });
  return Response.json({ order: updated });
}

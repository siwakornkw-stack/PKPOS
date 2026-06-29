import { prisma } from "@/lib/db";
import { requireBranch } from "@/lib/api";

// GET: tables + their current active order (for the Table Map)
export async function GET() {
  const auth = await requireBranch();
  if (auth instanceof Response) return auth;
  const { branchId } = auth; // concrete branch - never leak tables across branches via a null filter

  const tables = await prisma.diningTable.findMany({
    where: { branchId },
    orderBy: [{ posY: "asc" }, { posX: "asc" }],
    include: {
      salesOrders: {
        where: { status: { in: ["DRAFT", "SENT", "SERVED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { items: true },
      },
    },
  });

  const result = tables.map((t) => {
    const order = t.salesOrders[0];
    return {
      id: t.id,
      code: t.code,
      zone: t.zone,
      seats: t.seats,
      status: t.status,
      qrToken: t.qrToken,
      posX: t.posX,
      posY: t.posY,
      order: order
        ? {
            id: order.id,
            docNo: order.docNo,
            guestCount: order.guestCount,
            itemCount: order.items.filter((i) => i.status !== "VOID").length,
            netAmount: order.netAmount,
            subtotal: order.subtotal,
            createdAt: order.createdAt,
          }
        : null,
    };
  });

  return Response.json({ tables: result });
}

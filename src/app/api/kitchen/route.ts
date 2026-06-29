import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// GET: active kitchen tickets (orders with items not yet served).
// ?station=<name> routes only items whose category belongs to that station.
export async function GET(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.KITCHEN_VIEW);
  if (auth instanceof Response) return auth;
  const { branchId } = auth; // concrete branch - never leak tickets across branches via a null filter
  const station = req.nextUrl.searchParams.get("station");

  const orders = await prisma.salesOrder.findMany({
    where: {
      branchId,
      status: { in: ["SENT", "SERVED"] },
      items: { some: { status: { in: ["PENDING", "COOKING", "DONE"] } } },
    },
    orderBy: { createdAt: "asc" },
    include: {
      table: true,
      items: {
        where: { status: { in: ["PENDING", "COOKING", "DONE"] } },
        orderBy: { createdAt: "asc" },
        include: {
          options: true,
          menuItem: {
            select: {
              isCombo: true,
              category: { select: { station: true } },
              comboComponents: { include: { menuItem: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  const stationsSet = new Set<string>();
  const tickets = orders
    .map((o) => {
      const items = o.items
        .filter((i) => {
          const st = i.menuItem.category.station ?? null;
          if (st) stationsSet.add(st);
          return !station || st === station;
        })
        .map((i) => ({
          id: i.id,
          name: i.name,
          qty: i.qty,
          note: i.note,
          status: i.status,
          station: i.menuItem.category.station ?? null,
          options: i.options.map((o) => o.name),
          combo: i.menuItem.isCombo ? i.menuItem.comboComponents.map((c) => `${c.qty}x ${c.menuItem.name}`) : [],
        }));
      return {
        id: o.id,
        docNo: o.docNo,
        orderType: o.orderType,
        table: o.table?.code ?? null,
        queueNo: o.queueNo,
        createdAt: o.createdAt,
        items,
      };
    })
    .filter((t) => t.items.length > 0);

  return Response.json({ tickets, stations: [...stationsSet].sort() });
}

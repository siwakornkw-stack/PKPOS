import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { round2 } from "./format";
import { nextDocNo } from "./docno";
import { computeTotals } from "./totals";
import { effectiveBasePrice } from "./pricing";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface ItemPayload {
  menuItemId: number;
  qty: number;
  options?: number[]; // chosen Option ids
  note?: string;
  discount?: number;
  unitPrice?: number; // only honored for isOpenPrice items (cashier-entered price)
}

export interface ResolvedItem {
  menuItemId: number;
  name: string;
  qty: number;
  unitPrice: number; // base (per channel) + option deltas
  discount: number;
  note?: string;
  optionRows: { name: string; priceDelta: number }[];
}

// Resolve POS payload items into priced order lines (server is source of truth):
// applies per-channel price override and validated modifier options.
export async function resolveOrderItems(
  client: Tx,
  branchId: number,
  orderType: string,
  items: ItemPayload[]
): Promise<ResolvedItem[]> {
  const menuItems = await client.menuItem.findMany({
    where: { id: { in: items.map((i) => i.menuItemId) }, branchId },
    include: { prices: true, timePrices: true, optionGroups: { include: { group: { include: { options: true } } } } },
  });
  const byId = new Map(menuItems.map((m) => [m.id, m]));
  if (items.some((i) => !byId.has(i.menuItemId))) throw new Error("BAD_MENU");

  const now = new Date();
  return items.map((i) => {
    const m = byId.get(i.menuItemId)!;
    // open-price items take the cashier-entered price; everything else is priced by the
    // server (per-channel override, time-window price, or base) - never trust a client price.
    let base: number;
    if (m.isOpenPrice) {
      if (!(i.unitPrice && i.unitPrice > 0)) throw new Error("OPEN_PRICE_REQUIRED");
      base = round2(i.unitPrice);
    } else {
      const channelPrice = m.prices.find((p) => p.channel === orderType)?.price;
      base = effectiveBasePrice(m.price, channelPrice, m.timePrices, orderType, now);
    }

    const valid = new Map<number, { name: string; priceDelta: number }>();
    for (const link of m.optionGroups)
      for (const o of link.group.options) valid.set(o.id, { name: o.name, priceDelta: o.priceDelta });

    const optionRows = (i.options ?? [])
      .filter((id) => valid.has(id))
      .map((id) => ({ name: valid.get(id)!.name, priceDelta: valid.get(id)!.priceDelta }));

    const deltas = optionRows.reduce((s, o) => s + o.priceDelta, 0);
    return {
      menuItemId: m.id,
      name: m.name,
      qty: i.qty,
      unitPrice: round2(base + deltas),
      discount: i.discount ?? 0,
      note: i.note,
      optionRows,
    };
  });
}

// Recalculate and persist an order's totals from its current (non-void) items.
export async function recalcOrder(tx: Tx, orderId: number) {
  const order = await tx.salesOrder.findUnique({
    where: { id: orderId },
    include: { items: true, branch: { select: { taxRate: true, serviceRate: true } } },
  });
  if (!order) return null;
  const inputs = order.items.filter((i) => i.status !== "VOID");
  const totals = computeTotals(inputs, order.orderType, order.discount, {
    taxRate: order.branch.taxRate,
    serviceRate: order.noServiceCharge ? 0 : order.branch.serviceRate, // waived service charge
  }, order.pointsDiscount); // redeemed-points discount
  return tx.salesOrder.update({ where: { id: orderId }, data: totals });
}

// Apply a paid order's recipe (BOM) consumption to ingredient stock.
// type "SALE_DEDUCT" removes stock (payment); "REFUND_RETURN" returns it (refund).
export async function applyRecipeStock(
  tx: Tx,
  orderId: number,
  branchId: number,
  branchCode: string,
  userId: number,
  type: "SALE_DEDUCT" | "REFUND_RETURN"
) {
  const items = await tx.salesOrderItem.findMany({
    where: { orderId, status: { not: "VOID" } },
    include: {
      menuItem: {
        include: {
          recipeItems: true,
          comboComponents: { include: { menuItem: { include: { recipeItems: true } } } },
        },
      },
    },
  });

  // aggregate consumption per ingredient (combos expand to their components)
  const need = new Map<number, number>();
  const add = (ingredientId: number, qty: number) =>
    need.set(ingredientId, (need.get(ingredientId) ?? 0) + qty);
  for (const it of items) {
    // a combo expands to its components...
    if (it.menuItem.isCombo)
      for (const comp of it.menuItem.comboComponents)
        for (const r of comp.menuItem.recipeItems) add(r.ingredientId, r.qty * comp.qty * it.qty);
    // ...and ALSO consumes its own recipe (shared packaging/sauce); a normal item has no components
    for (const r of it.menuItem.recipeItems) add(r.ingredientId, r.qty * it.qty);
  }

  const sign = type === "SALE_DEDUCT" ? -1 : 1;
  for (const [ingredientId, qty] of need) {
    const ing = await tx.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ing) continue;
    const balanceAfter = round2(ing.stockQty + sign * qty);
    await tx.ingredient.update({ where: { id: ingredientId }, data: { stockQty: balanceAfter } });
    await tx.stockMovement.create({
      data: {
        docNo: await nextDocNo("STK", branchCode, tx),
        branchId,
        ingredientId,
        type,
        qty: round2(sign * qty),
        balanceAfter,
        refType: "SO",
        refId: orderId,
        createdBy: userId,
      },
    });
  }
}

import type { Item, Order } from "../types";
import { round2 } from "./totals";

// Voided bills stay in the ledger for the audit trail but must never reach a total.
export function liveOrders(orders: Order[]): Order[] {
  return orders.filter((o) => !o.voided);
}

export function salesTotal(orders: Order[]): number {
  return round2(orders.reduce((s, o) => s + o.total, 0));
}

export interface Slice {
  name: string;
  amount: number;
  count: number;
}

// Split by how the bill was paid. Orders saved before QR existed have no `method` and are cash.
export function paymentMix(orders: Order[]): Slice[] {
  const cash = orders.filter((o) => o.method !== "qr");
  const qr = orders.filter((o) => o.method === "qr");
  return [
    { name: "เงินสด", amount: salesTotal(cash), count: cash.length },
    { name: "QR พร้อมเพย์", amount: salesTotal(qr), count: qr.length },
  ].filter((s) => s.count > 0);
}

export function byCategory(orders: Order[]): Slice[] {
  const map = new Map<string, Slice>();
  for (const o of orders) {
    for (const l of o.lines) {
      const name = l.category || "อื่นๆ";
      const cur = map.get(name) ?? { name, amount: 0, count: 0 };
      cur.amount = round2(cur.amount + l.price * l.qty);
      cur.count += l.qty;
      map.set(name, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export interface HourBucket {
  hour: number;
  amount: number;
  count: number;
}

// 24 buckets so the chart keeps a stable x-axis even on a quiet day.
export function hourly(orders: Order[]): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, amount: 0, count: 0 }));
  for (const o of orders) {
    const b = buckets[new Date(o.ts).getHours()];
    b.amount = round2(b.amount + o.total);
    b.count += 1;
  }
  return buckets;
}

export interface SellerRow {
  name: string;
  qty: number;
  revenue: number;
}

export function bestSellers(orders: Order[], limit = 5): SellerRow[] {
  const map = new Map<string, SellerRow>();
  for (const o of orders) {
    for (const l of o.lines) {
      const cur = map.get(l.name) ?? { name: l.name, qty: 0, revenue: 0 };
      cur.qty += l.qty;
      cur.revenue = round2(cur.revenue + l.price * l.qty);
      map.set(l.name, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}

export const LOW_STOCK = 5;

// Items the vendor opted into tracking that are at or below the reorder line.
export function lowStock(items: Item[]): Item[] {
  return items
    .filter((i) => i.active && i.stock !== undefined && i.stock <= LOW_STOCK)
    .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
}

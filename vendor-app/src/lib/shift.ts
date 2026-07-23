import type { CashMove, Order } from "../types";
import { round2 } from "./totals";

// Cash that should be in the drawer right now: what it opened with, plus cash sales,
// plus any manual in/out. QR sales never touch the drawer.
export function expectedCash(openFloat: number, orders: Order[], moves: CashMove[]): number {
  const cashSales = orders
    .filter((o) => !o.voided && o.method !== "qr")
    .reduce((s, o) => s + o.total, 0);
  const moved = moves.reduce((s, m) => s + m.amount, 0);
  return round2(openFloat + cashSales + moved);
}

// Positive = drawer has more than it should (over), negative = short.
export function variance(counted: number, expected: number): number {
  return round2(counted - expected);
}

export function ordersInShift(orders: Order[], openTs: number, closeTs?: number): Order[] {
  return orders.filter((o) => o.ts >= openTs && (closeTs === undefined || o.ts <= closeTs));
}

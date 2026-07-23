import type { Item, OrderLine } from "../types";
import { round2 } from "./totals";

// Stock is opt-in per item: `stock === undefined` means the vendor never wants to count that
// item, so it always sells. Off-menu lines carry a random itemId that matches nothing here.
export function isTracked(item: Item): boolean {
  return item.stock !== undefined;
}

// How many more of this item can go in the cart, given what is already there.
// Infinity for untracked items so callers can compare without special-casing.
export function remaining(item: Item, inCart: number): number {
  return isTracked(item) ? (item.stock as number) - inCart : Infinity;
}

export function cartQty(lines: OrderLine[], itemId: string): number {
  return lines.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.qty, 0);
}

// Returns only the items whose stock actually moved, so the caller writes the minimum to IndexedDB.
function adjust(items: Item[], lines: OrderLine[], sign: 1 | -1): Item[] {
  const changed: Item[] = [];
  for (const item of items) {
    if (!isTracked(item)) continue;
    const qty = cartQty(lines, item.id);
    if (qty === 0) continue;
    changed.push({ ...item, stock: round2((item.stock as number) + sign * qty) });
  }
  return changed;
}

// Called once on payment — never while the cart is being edited.
export function applyStock(items: Item[], lines: OrderLine[]): Item[] {
  return adjust(items, lines, -1);
}

// Puts the goods back on the shelf when a bill is voided.
export function restock(items: Item[], lines: OrderLine[]): Item[] {
  return adjust(items, lines, 1);
}

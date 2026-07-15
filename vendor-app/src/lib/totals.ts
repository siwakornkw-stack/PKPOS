import type { OrderLine } from "../types";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function cartTotal(lines: OrderLine[]): number {
  return round2(lines.reduce((s, l) => s + l.price * l.qty, 0));
}

export function changeDue(received: number, total: number): number {
  return round2(Math.max(0, received - total));
}

// Discount never pushes the payable below zero.
export function applyDiscount(subtotal: number, discount: number): number {
  return round2(Math.max(0, subtotal - discount));
}

export function pctToBaht(subtotal: number, pct: number): number {
  return round2((subtotal * pct) / 100);
}

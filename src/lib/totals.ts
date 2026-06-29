import { TAX_RATE, SERVICE_CHARGE_RATE } from "./constants";
import { round2 } from "./format";

// Pure order-totals math. Kept out of orders.ts (which is server-only) so the
// POS client can share the exact same calculation as the server.
export interface LineLike {
  qty: number;
  unitPrice: number;
  discount?: number;
}

export function lineAmount(i: LineLike): number {
  // never let a line go negative (item discount capped at the line subtotal)
  return round2(Math.max(0, i.qty * i.unitPrice - (i.discount ?? 0)));
}

interface Rates {
  taxRate: number;
  serviceRate: number;
}

// Totals model (VAT-exclusive). Service charge applies to dine-in only.
// Rates default to the global constants; pass branch rates to override.
export function computeTotals(
  items: LineLike[],
  orderType: string,
  orderDiscount = 0,
  rates: Rates = { taxRate: TAX_RATE, serviceRate: SERVICE_CHARGE_RATE },
  extraDiscount = 0 // e.g. redeemed loyalty points (applied after the order discount)
) {
  const subtotal = round2(items.reduce((s, i) => s + lineAmount(i), 0));
  // clamp each discount to the live subtotal so a stale absolute discount (e.g. after
  // items are voided/split out) can never exceed the remaining bill or persist a wrong value.
  const discount = round2(Math.min(Math.max(0, orderDiscount), subtotal));
  const pointsDiscount = round2(Math.min(Math.max(0, extraDiscount), Math.max(0, subtotal - discount)));
  const afterDiscount = Math.max(0, round2(subtotal - discount - pointsDiscount));
  const serviceCharge =
    orderType === "DINE_IN" ? round2(afterDiscount * rates.serviceRate) : 0;
  const taxAmount = round2((afterDiscount + serviceCharge) * rates.taxRate);
  const netAmount = round2(afterDiscount + serviceCharge + taxAmount);
  return { subtotal, discount, pointsDiscount, serviceCharge, taxAmount, netAmount };
}

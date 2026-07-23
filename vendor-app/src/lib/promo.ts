import type { Promo } from "../types";
import { round2 } from "./totals";

// Baht taken off `subtotal` by this promo. 0 when it does not apply, and never more
// than the subtotal itself (a 100% promo makes the bill free, never negative).
export function promoDiscount(promo: Promo, subtotal: number): number {
  if (!promo.active || subtotal < promo.minSpend) return 0;
  const raw = promo.type === "percent" ? (subtotal * promo.value) / 100 : promo.value;
  return round2(Math.min(Math.max(0, raw), subtotal));
}

export function eligiblePromos(promos: Promo[], subtotal: number): Promo[] {
  return promos.filter((p) => promoDiscount(p, subtotal) > 0);
}

// The promo that saves the customer the most — what the vendor would pick by hand anyway.
export function bestPromo(promos: Promo[], subtotal: number): Promo | null {
  let best: Promo | null = null;
  let bestVal = 0;
  for (const p of promos) {
    const d = promoDiscount(p, subtotal);
    if (d > bestVal) {
      best = p;
      bestVal = d;
    }
  }
  return best;
}

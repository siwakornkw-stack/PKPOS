import { round2 } from "./format";
import { timeWindowActive } from "./timewin";

// Promotion engine. Scopes:
//   ORDER     - PERCENT/AMOUNT off the whole bill (legacy behaviour)
//   ITEM      - PERCENT/AMOUNT off the lines of one menu item
//   CATEGORY  - PERCENT/AMOUNT off the lines of one category
//   BXGY      - buy `buyQty` of `menuItemId`, get `getQty` at `value`% off (default 100 = free)

export interface PromoLine {
  menuItemId: number;
  categoryId: number;
  qty: number;
  unitPrice: number; // per unit, after option deltas
  lineAmount: number; // qty*unitPrice - per-line discount (already computed)
}

export interface PromoRule {
  type: string; // PERCENT | AMOUNT (ignored for BXGY)
  value: number;
  minSpend: number;
  scope: string; // ORDER | ITEM | CATEGORY | BXGY
  menuItemId: number | null;
  categoryId: number | null;
  buyQty: number | null;
  getQty: number | null;
}

export interface PromoEligibility {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  memberOnly: boolean;
  days: string | null;
  startMin: number | null;
  endMin: number | null;
  usageLimit: number | null;
  usedCount: number;
}

// Back-compat: legacy date-window + active check (used by promo list GET).
export function promoActiveNow(
  p: { isActive: boolean; startsAt: Date | null; endsAt: Date | null },
  now: Date
): boolean {
  if (!p.isActive) return false;
  if (p.startsAt && now < p.startsAt) return false;
  if (p.endsAt && now > p.endsAt) return false;
  return true;
}

// Full eligibility: active + date window + time-of-day + member presence + usage cap.
export function promoEligible(p: PromoEligibility, now: Date, hasMember: boolean): boolean {
  if (!promoActiveNow(p, now)) return false;
  if (p.memberOnly && !hasMember) return false;
  if (!timeWindowActive(now, p.days, p.startMin, p.endMin)) return false;
  if (p.usageLimit != null && p.usedCount >= p.usageLimit) return false;
  return true;
}

// Simple order-level percent/amount discount (vouchers + ORDER-scope promos).
export function simpleDiscount(type: string, value: number, minSpend: number, subtotal: number): number {
  if (subtotal < minSpend) return 0;
  const raw = type === "PERCENT" ? (subtotal * value) / 100 : value;
  return round2(Math.min(raw, subtotal));
}

function sumLines(lines: PromoLine[], pred: (l: PromoLine) => boolean): number {
  return round2(lines.filter(pred).reduce((s, l) => s + l.lineAmount, 0));
}

function bxgyDiscount(promo: PromoRule, lines: PromoLine[]): number {
  if (!promo.menuItemId || !promo.buyQty || !promo.getQty) return 0;
  const matching = lines.filter((l) => l.menuItemId === promo.menuItemId);
  const totalQty = matching.reduce((s, l) => s + l.qty, 0);
  const groupSize = promo.buyQty + promo.getQty;
  if (groupSize <= 0) return 0;
  const freeUnits = Math.floor(totalQty / groupSize) * promo.getQty;
  if (freeUnits <= 0) return 0;
  const unit = Math.min(...matching.map((l) => l.unitPrice)); // discount the cheapest unit
  const pct = promo.value > 0 ? promo.value : 100; // value% off free units (default fully free)
  return round2(freeUnits * unit * (pct / 100));
}

// Discount a promotion yields, given the order lines and subtotal. Capped so it
// can never exceed its scoped base nor the whole bill.
export function promoDiscount(promo: PromoRule, lines: PromoLine[], subtotal: number): number {
  if (subtotal < promo.minSpend) return 0;
  if (promo.scope === "BXGY") return Math.min(bxgyDiscount(promo, lines), subtotal);

  if (promo.scope === "ORDER") return simpleDiscount(promo.type, promo.value, promo.minSpend, subtotal);

  // ITEM / CATEGORY: discount applies only to the matching lines' total
  const base =
    promo.scope === "ITEM"
      ? sumLines(lines, (l) => l.menuItemId === promo.menuItemId)
      : sumLines(lines, (l) => l.categoryId === promo.categoryId);
  if (base <= 0) return 0;

  const raw = promo.type === "PERCENT" ? (base * promo.value) / 100 : promo.value;
  return round2(Math.min(raw, base, subtotal));
}

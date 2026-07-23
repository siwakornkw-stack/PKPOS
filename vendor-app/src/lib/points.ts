import { round2 } from "./totals";

export const DEFAULT_BAHT_PER_POINT = 25;

// Points earned on a paid bill. Whole points only — partial baht never rounds up into a free point.
export function earnPoints(net: number, bahtPerPoint = DEFAULT_BAHT_PER_POINT): number {
  if (bahtPerPoint <= 0 || net <= 0) return 0;
  return Math.floor(net / bahtPerPoint);
}

// 1 point = 1 baht off. Capped by the points the member actually holds and by the bill itself,
// so redeeming can never create change owed to the customer.
export function redeemValue(points: number, available: number, subtotal: number): number {
  const usable = Math.floor(Math.min(Math.max(0, points), Math.max(0, available)));
  return round2(Math.min(usable, subtotal));
}

// Undo a bill's effect on a member: hand back the points they spent, take back the points the
// bill earned, and drop it out of lifetime spend (which may demote their tier).
// Reverses the values recorded on the order, so a tier multiplier applied at sale time cannot
// leak free points back on void.
export function reverseOrder(
  member: { points: number; spent: number },
  order: { total: number; pointsUsed?: number; pointsEarned?: number }
): { points: number; spent: number } {
  return {
    points: Math.max(0, round2(member.points + (order.pointsUsed ?? 0) - (order.pointsEarned ?? 0))),
    spent: Math.max(0, round2(member.spent - order.total)),
  };
}

// Members climb a tier by lifetime spend; the tier multiplies points earned (mirrors the web MemberTier).
export interface Tier {
  name: string;
  minSpent: number;
  multiplier: number;
}

export const TIERS: Tier[] = [
  { name: "ทั่วไป", minSpent: 0, multiplier: 1 },
  { name: "เงิน", minSpent: 3000, multiplier: 1.5 },
  { name: "ทอง", minSpent: 10000, multiplier: 2 },
];

export function tierFor(spent: number): Tier {
  return [...TIERS].reverse().find((t) => spent >= t.minSpent) ?? TIERS[0];
}

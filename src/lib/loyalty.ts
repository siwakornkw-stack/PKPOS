// Loyalty math. 1 base point per BASE_BAHT_PER_POINT spent, multiplied by the
// member's tier. Tier is the highest one whose minSpent the member has reached.

export const BASE_BAHT_PER_POINT = 25;

export interface TierLike {
  id: number;
  minSpent: number;
  pointMultiplier: number;
}

// Points earned for a paid bill at a given tier multiplier.
export function earnPoints(net: number, multiplier: number): number {
  return Math.floor(net / BASE_BAHT_PER_POINT * (multiplier > 0 ? multiplier : 1));
}

// The tier a member with `totalSpent` belongs to (highest reached), or null.
export function tierForSpent<T extends TierLike>(tiers: T[], totalSpent: number): T | null {
  return (
    tiers
      .filter((t) => totalSpent >= t.minSpent)
      .sort((a, b) => b.minSpent - a.minSpent)[0] ?? null
  );
}

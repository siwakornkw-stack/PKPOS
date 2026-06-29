import { describe, it, expect } from "vitest";
import { earnPoints, tierForSpent, BASE_BAHT_PER_POINT } from "@/lib/loyalty";

describe("earnPoints", () => {
  it("1 point per base baht at multiplier 1", () => {
    expect(earnPoints(250, 1)).toBe(Math.floor(250 / BASE_BAHT_PER_POINT));
  });
  it("applies the tier multiplier and floors", () => {
    expect(earnPoints(250, 2)).toBe(20); // (250/25)*2
    expect(earnPoints(260, 1.5)).toBe(15); // floor(10.4*1.5)=15
  });
  it("treats a non-positive multiplier as 1", () => {
    expect(earnPoints(250, 0)).toBe(10);
  });
});

describe("tierForSpent", () => {
  const tiers = [
    { id: 1, minSpent: 0, pointMultiplier: 1 },
    { id: 2, minSpent: 5000, pointMultiplier: 1.5 },
    { id: 3, minSpent: 20000, pointMultiplier: 2 },
  ];
  it("returns the highest reached tier", () => {
    expect(tierForSpent(tiers, 0)?.id).toBe(1);
    expect(tierForSpent(tiers, 4999)?.id).toBe(1);
    expect(tierForSpent(tiers, 5000)?.id).toBe(2);
    expect(tierForSpent(tiers, 999999)?.id).toBe(3);
  });
  it("returns null when no tier qualifies", () => {
    expect(tierForSpent([{ id: 9, minSpent: 100, pointMultiplier: 1 }], 50)).toBeNull();
  });
});

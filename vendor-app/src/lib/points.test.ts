import { describe, it, expect } from "vitest";
import { earnPoints, redeemValue, tierFor, reverseOrder } from "./points";

describe("earnPoints", () => {
  it("1 point per 25 baht by default", () => {
    expect(earnPoints(100)).toBe(4);
  });
  it("floors partial points", () => {
    expect(earnPoints(99)).toBe(3);
  });
  it("honours a custom rate", () => {
    expect(earnPoints(100, 10)).toBe(10);
  });
  it("0 for empty or invalid rates", () => {
    expect(earnPoints(0)).toBe(0);
    expect(earnPoints(100, 0)).toBe(0);
  });
});

describe("redeemValue", () => {
  it("1 point = 1 baht", () => {
    expect(redeemValue(30, 100, 500)).toBe(30);
  });
  it("capped by the points held", () => {
    expect(redeemValue(200, 40, 500)).toBe(40);
  });
  it("capped by the bill so it never owes change", () => {
    expect(redeemValue(200, 200, 75)).toBe(75);
  });
  it("never negative", () => {
    expect(redeemValue(-5, 100, 500)).toBe(0);
  });
});

describe("reverseOrder", () => {
  const member = { points: 3, spent: 184 };
  it("hands back spent points and takes back earned ones", () => {
    expect(reverseOrder(member, { total: 76, pointsUsed: 4, pointsEarned: 3 })).toEqual({ points: 4, spent: 108 });
  });
  it("reverses the recorded earn, so a tier multiplier cannot leak free points", () => {
    // Earned 6 at a 2x tier on a 76 baht bill: voiding must remove 6, not the 3 a plain rate gives.
    expect(reverseOrder({ points: 6, spent: 76 }, { total: 76, pointsEarned: 6 }).points).toBe(0);
  });
  it("a bill with no points only moves lifetime spend", () => {
    expect(reverseOrder(member, { total: 84 })).toEqual({ points: 3, spent: 100 });
  });
  it("never goes negative", () => {
    expect(reverseOrder({ points: 1, spent: 10 }, { total: 999, pointsEarned: 50 })).toEqual({ points: 0, spent: 0 });
  });
});

describe("tierFor", () => {
  it("climbs with lifetime spend", () => {
    expect(tierFor(0).name).toBe("ทั่วไป");
    expect(tierFor(3000).name).toBe("เงิน");
    expect(tierFor(50000).name).toBe("ทอง");
  });
});

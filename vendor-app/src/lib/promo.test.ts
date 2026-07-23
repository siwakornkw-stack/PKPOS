import { describe, it, expect } from "vitest";
import { promoDiscount, eligiblePromos, bestPromo } from "./promo";
import type { Promo } from "../types";

const pct10: Promo = { id: "p1", name: "ลด 10%", type: "percent", value: 10, minSpend: 0, active: true };
const off50: Promo = { id: "p2", name: "ลด 50", type: "amount", value: 50, minSpend: 300, active: true };

describe("promoDiscount", () => {
  it("percent of subtotal", () => {
    expect(promoDiscount(pct10, 250)).toBe(25);
  });
  it("flat amount", () => {
    expect(promoDiscount(off50, 300)).toBe(50);
  });
  it("0 below minimum spend", () => {
    expect(promoDiscount(off50, 299)).toBe(0);
  });
  it("0 when inactive", () => {
    expect(promoDiscount({ ...pct10, active: false }, 250)).toBe(0);
  });
  it("never exceeds the subtotal", () => {
    expect(promoDiscount({ ...off50, minSpend: 0 }, 20)).toBe(20);
    expect(promoDiscount({ ...pct10, value: 150 }, 100)).toBe(100);
  });
  it("never negative", () => {
    expect(promoDiscount({ ...pct10, value: -10 }, 100)).toBe(0);
  });
});

describe("eligiblePromos", () => {
  it("drops the ones that do not apply yet", () => {
    expect(eligiblePromos([pct10, off50], 100).map((p) => p.id)).toEqual(["p1"]);
    expect(eligiblePromos([pct10, off50], 400).map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});

describe("bestPromo", () => {
  it("picks the biggest saving", () => {
    expect(bestPromo([pct10, off50], 400)?.id).toBe("p2"); // 50 > 40
    expect(bestPromo([pct10, off50], 1000)?.id).toBe("p1"); // 100 > 50
  });
  it("null when nothing applies", () => {
    expect(bestPromo([off50], 100)).toBeNull();
  });
});

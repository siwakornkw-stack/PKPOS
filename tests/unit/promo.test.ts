import { describe, it, expect } from "vitest";
import { promoDiscount, promoActiveNow, promoEligible, simpleDiscount, type PromoRule, type PromoLine } from "@/lib/promo";
import { round2 } from "@/lib/format";

const rule = (p: Partial<PromoRule>): PromoRule => ({
  type: "PERCENT", value: 0, minSpend: 0, scope: "ORDER",
  menuItemId: null, categoryId: null, buyQty: null, getQty: null, ...p,
});

// item 1 (cat 10): 2 x 100 = 200 ; item 2 (cat 20): 1 x 300 = 300 ; subtotal 500
const lines: PromoLine[] = [
  { menuItemId: 1, categoryId: 10, qty: 2, unitPrice: 100, lineAmount: 200 },
  { menuItemId: 2, categoryId: 20, qty: 1, unitPrice: 300, lineAmount: 300 },
];

describe("simpleDiscount", () => {
  it("percent / amount / minSpend / cap", () => {
    expect(simpleDiscount("PERCENT", 10, 0, 500)).toBe(50);
    expect(simpleDiscount("AMOUNT", 50, 0, 500)).toBe(50);
    expect(simpleDiscount("PERCENT", 10, 600, 500)).toBe(0);
    expect(simpleDiscount("AMOUNT", 999, 0, 100)).toBe(100);
  });
});

describe("promoDiscount scopes", () => {
  it("ORDER percent/amount", () => {
    expect(promoDiscount(rule({ scope: "ORDER", type: "PERCENT", value: 10 }), lines, 500)).toBe(50);
    expect(promoDiscount(rule({ scope: "ORDER", type: "AMOUNT", value: 999 }), lines, 500)).toBe(500);
  });
  it("ITEM scope only discounts the matching item's lines", () => {
    expect(promoDiscount(rule({ scope: "ITEM", menuItemId: 1, type: "PERCENT", value: 50 }), lines, 500)).toBe(100); // 50% of 200
    expect(promoDiscount(rule({ scope: "ITEM", menuItemId: 99, type: "PERCENT", value: 50 }), lines, 500)).toBe(0); // no match
  });
  it("CATEGORY scope only discounts the matching category's lines", () => {
    expect(promoDiscount(rule({ scope: "CATEGORY", categoryId: 20, type: "AMOUNT", value: 100 }), lines, 500)).toBe(100);
    expect(promoDiscount(rule({ scope: "CATEGORY", categoryId: 20, type: "AMOUNT", value: 999 }), lines, 500)).toBe(300); // capped to category base
  });
  it("BXGY buy-1-get-1 frees the cheapest unit", () => {
    // item 1: 2 units @100, buy1get1 => 1 free @100
    expect(promoDiscount(rule({ scope: "BXGY", menuItemId: 1, buyQty: 1, getQty: 1, value: 0 }), lines, 500)).toBe(100);
    // not enough qty for a full group => 0
    expect(promoDiscount(rule({ scope: "BXGY", menuItemId: 2, buyQty: 1, getQty: 1 }), lines, 500)).toBe(0);
  });
  it("BXGY value% applies a partial discount to free units", () => {
    expect(promoDiscount(rule({ scope: "BXGY", menuItemId: 1, buyQty: 1, getQty: 1, value: 50 }), lines, 500)).toBe(50);
  });
  it("respects minSpend", () => {
    expect(promoDiscount(rule({ scope: "ORDER", type: "PERCENT", value: 10, minSpend: 600 }), lines, 500)).toBe(0);
  });
});

describe("promoEligible", () => {
  const now = new Date("2026-06-27T12:00:00"); // local noon, Saturday
  const base = { isActive: true, startsAt: null, endsAt: null, memberOnly: false, days: null, startMin: null, endMin: null, usageLimit: null, usedCount: 0 };
  it("member-only needs a member", () => {
    expect(promoEligible({ ...base, memberOnly: true }, now, false)).toBe(false);
    expect(promoEligible({ ...base, memberOnly: true }, now, true)).toBe(true);
  });
  it("time window gates by minutes of day", () => {
    expect(promoEligible({ ...base, startMin: 11 * 60, endMin: 14 * 60 }, now, false)).toBe(true);
    expect(promoEligible({ ...base, startMin: 18 * 60, endMin: 20 * 60 }, now, false)).toBe(false);
  });
  it("usage cap blocks once reached", () => {
    expect(promoEligible({ ...base, usageLimit: 5, usedCount: 5 }, now, false)).toBe(false);
    expect(promoEligible({ ...base, usageLimit: 5, usedCount: 4 }, now, false)).toBe(true);
  });
});

describe("promoActiveNow", () => {
  const now = new Date("2026-06-27T12:00:00Z");
  it("inactive promo is never active", () => {
    expect(promoActiveNow({ isActive: false, startsAt: null, endsAt: null }, now)).toBe(false);
  });
  it("respects start/end window", () => {
    expect(promoActiveNow({ isActive: true, startsAt: new Date("2026-06-28T00:00:00Z"), endsAt: null }, now)).toBe(false);
    expect(promoActiveNow({ isActive: true, startsAt: null, endsAt: new Date("2026-06-26T00:00:00Z") }, now)).toBe(false);
    expect(promoActiveNow({ isActive: true, startsAt: null, endsAt: null }, now)).toBe(true);
  });
});

describe("round2", () => {
  it("rounds to 2 decimals", () => {
    expect(round2(23.1)).toBe(23.1);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(353.10000001)).toBe(353.1);
  });
});

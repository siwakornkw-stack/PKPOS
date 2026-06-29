import { describe, it, expect } from "vitest";
import { computeTotals, lineAmount } from "@/lib/totals";

describe("lineAmount", () => {
  it("computes qty * price - discount", () => {
    expect(lineAmount({ qty: 2, unitPrice: 90 })).toBe(180);
    expect(lineAmount({ qty: 3, unitPrice: 50, discount: 20 })).toBe(130);
  });
  it("never goes negative (discount capped at line subtotal)", () => {
    expect(lineAmount({ qty: 1, unitPrice: 50, discount: 999 })).toBe(0);
  });
});

describe("computeTotals", () => {
  const items = [
    { qty: 2, unitPrice: 90 }, // 180
    { qty: 1, unitPrice: 120 }, // 120
  ]; // subtotal 300

  it("dine-in adds 10% service then 7% vat (rounded to 2dp)", () => {
    const t = computeTotals(items, "DINE_IN", 0);
    expect(t.subtotal).toBe(300);
    expect(t.serviceCharge).toBe(30); // 300 * 10%
    expect(t.taxAmount).toBe(23.1); // (300+30) * 7%
    expect(t.netAmount).toBe(353.1);
  });

  it("takeaway has no service charge", () => {
    const t = computeTotals(items, "TAKEAWAY", 0);
    expect(t.serviceCharge).toBe(0);
    expect(t.taxAmount).toBe(21); // 300 * 7%, rounded
    expect(t.netAmount).toBe(321);
  });

  it("applies order discount before service/vat and never negative", () => {
    const t = computeTotals(items, "TAKEAWAY", 50);
    expect(t.discount).toBe(50);
    expect(t.netAmount).toBe(267.5); // 250 * 1.07
    const over = computeTotals(items, "TAKEAWAY", 9999);
    expect(over.netAmount).toBe(0);
  });

  it("clamps a stale absolute discount to the live subtotal (after items shrink)", () => {
    // subtotal 300, but a 9999 discount was set earlier on a bigger bill
    const over = computeTotals(items, "TAKEAWAY", 9999);
    expect(over.discount).toBe(300); // reported value clamped, not the stale 9999
    const one = computeTotals([{ qty: 1, unitPrice: 40 }], "TAKEAWAY", 100);
    expect(one.discount).toBe(40); // never exceeds the remaining 40-baht bill
    expect(one.netAmount).toBe(0);
  });
});

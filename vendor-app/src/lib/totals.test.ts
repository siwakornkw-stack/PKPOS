import { describe, it, expect } from "vitest";
import { cartTotal, changeDue, round2 } from "./totals";

describe("cartTotal", () => {
  it("sums price*qty", () => {
    expect(
      cartTotal([
        { itemId: "a", name: "x", price: 50, qty: 2 },
        { itemId: "b", name: "y", price: 25, qty: 1 },
      ])
    ).toBe(125);
  });
  it("empty is 0", () => {
    expect(cartTotal([])).toBe(0);
  });
  it("rounds float drift to 2dp", () => {
    expect(cartTotal([{ itemId: "a", name: "x", price: 0.1, qty: 3 }])).toBe(0.3);
  });
});

describe("changeDue", () => {
  it("received - total", () => {
    expect(changeDue(100, 75)).toBe(25);
  });
  it("never negative", () => {
    expect(changeDue(50, 75)).toBe(0);
  });
});

describe("round2", () => {
  it("collapses float drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3); // 0.30000000000000004 -> 0.3
    expect(round2(2.5)).toBe(2.5);
  });
});

import { describe, it, expect } from "vitest";
import { effectiveBasePrice, type TimePriceLike } from "@/lib/pricing";

const tp = (p: Partial<TimePriceLike>): TimePriceLike => ({
  channel: null, days: "0123456", startMin: 0, endMin: 1439, price: 0, priority: 0, isActive: true, ...p,
});

describe("effectiveBasePrice", () => {
  const sat1430 = new Date("2026-06-27T14:30:00");

  it("falls back to channel price, then base", () => {
    expect(effectiveBasePrice(100, 90, [], "DINE_IN", sat1430)).toBe(90);
    expect(effectiveBasePrice(100, undefined, [], "DINE_IN", sat1430)).toBe(100);
  });
  it("active time-window price overrides channel price", () => {
    const happy = tp({ price: 70, startMin: 14 * 60, endMin: 17 * 60 });
    expect(effectiveBasePrice(100, 90, [happy], "DINE_IN", sat1430)).toBe(70);
  });
  it("ignores out-of-window or inactive windows", () => {
    const off = tp({ price: 70, startMin: 18 * 60, endMin: 20 * 60 });
    const inactive = tp({ price: 50, isActive: false });
    expect(effectiveBasePrice(100, 90, [off, inactive], "DINE_IN", sat1430)).toBe(90);
  });
  it("respects channel scoping on the window", () => {
    const dineOnly = tp({ price: 70, channel: "DINE_IN" });
    expect(effectiveBasePrice(100, 90, [dineOnly], "TAKEAWAY", sat1430)).toBe(90);
    expect(effectiveBasePrice(100, 90, [dineOnly], "DINE_IN", sat1430)).toBe(70);
  });
  it("highest priority window wins", () => {
    const a = tp({ price: 80, priority: 1 });
    const b = tp({ price: 60, priority: 5 });
    expect(effectiveBasePrice(100, 90, [a, b], "DINE_IN", sat1430)).toBe(60);
  });
});

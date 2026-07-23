import { describe, it, expect } from "vitest";
import { expectedCash, variance, ordersInShift } from "./shift";
import type { CashMove, Order } from "../types";

const order = (total: number, extra: Partial<Order> = {}): Order => ({
  id: crypto.randomUUID(),
  ts: 1000,
  lines: [],
  total,
  received: total,
  change: 0,
  ...extra,
});
const move = (amount: number): CashMove => ({ id: "m", shiftId: "s", ts: 1000, amount, note: "" });

describe("expectedCash", () => {
  it("float plus cash sales", () => {
    expect(expectedCash(500, [order(100), order(50)], [])).toBe(650);
  });
  it("QR sales never touch the drawer", () => {
    expect(expectedCash(500, [order(100, { method: "qr" })], [])).toBe(500);
  });
  it("orders with no method are cash (saved before QR existed)", () => {
    expect(expectedCash(0, [order(100)], [])).toBe(100);
  });
  it("voided bills are excluded", () => {
    expect(expectedCash(500, [order(100, { voided: true })], [])).toBe(500);
  });
  it("counts money paid in and out", () => {
    expect(expectedCash(500, [], [move(200), move(-80)])).toBe(620);
  });
});

describe("variance", () => {
  it("positive when the drawer is over", () => {
    expect(variance(1010, 1000)).toBe(10);
  });
  it("negative when short", () => {
    expect(variance(990, 1000)).toBe(-10);
  });
});

describe("ordersInShift", () => {
  const os = [order(1, { ts: 100 }), order(2, { ts: 500 }), order(3, { ts: 900 })];
  it("bounded by open and close", () => {
    expect(ordersInShift(os, 200, 800).map((o) => o.total)).toEqual([2]);
  });
  it("open shift runs to now", () => {
    expect(ordersInShift(os, 200).map((o) => o.total)).toEqual([2, 3]);
  });
});

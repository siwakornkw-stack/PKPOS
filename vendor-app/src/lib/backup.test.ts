import { describe, it, expect } from "vitest";
import { ordersToCsv, toBackup, parseBackup } from "./backup";
import type { Item, Order } from "../types";

const order: Order = {
  id: "1",
  ts: 0,
  lines: [{ itemId: "a", name: "ข้าว, พิเศษ", price: 50, qty: 2 }],
  total: 100,
  received: 100,
  change: 0,
};
const item: Item = { id: "a", name: "ข้าว", price: 50, category: "อาหาร", active: true };

describe("ordersToCsv", () => {
  it("has the header row", () => {
    expect(ordersToCsv([]).split("\n")[0]).toBe("date,time,items,qty,total,received,change");
  });
  it("quotes fields containing a comma", () => {
    const row = ordersToCsv([order]).split("\n")[1];
    expect(row).toContain('"ข้าว, พิเศษ x2"');
    expect(row).toContain("100");
  });
});

describe("backup roundtrip", () => {
  it("toBackup -> parseBackup preserves data", () => {
    const parsed = parseBackup(toBackup([item], [order]));
    expect(parsed.items).toHaveLength(1);
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0].total).toBe(100);
  });
  it("rejects wrong version", () => {
    expect(() => parseBackup('{"v":2,"items":[],"orders":[]}')).toThrow();
  });
  it("rejects non-json", () => {
    expect(() => parseBackup("nope")).toThrow();
  });
});

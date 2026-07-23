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
const empty = { items: [item], orders: [order], customers: [], promos: [], shifts: [], cashmoves: [] };

describe("ordersToCsv", () => {
  it("has the header row", () => {
    expect(ordersToCsv([]).split("\n")[0]).toBe(
      "date,time,items,qty,subtotal,discount,total,method,received,change,voided"
    );
  });
  it("quotes fields containing a comma", () => {
    const row = ordersToCsv([order]).split("\n")[1];
    expect(row).toContain('"ข้าว, พิเศษ x2"');
    expect(row).toContain("100");
  });
  it("spells out the chosen options", () => {
    const withOpts: Order = {
      ...order,
      lines: [{ itemId: "a", name: "ข้าวผัด", price: 60, qty: 1, opts: [{ name: "ไข่ดาว", price: 10 }] }],
    };
    expect(ordersToCsv([withOpts])).toContain("ข้าวผัด (ไข่ดาว) x1");
  });
  it("flags voided bills so a spreadsheet can exclude them", () => {
    expect(ordersToCsv([{ ...order, voided: true }]).split("\n")[1].endsWith(",1")).toBe(true);
    expect(ordersToCsv([order]).split("\n")[1].endsWith(",")).toBe(true);
  });
});

describe("backup roundtrip", () => {
  it("toBackup -> parseBackup preserves data", () => {
    const parsed = parseBackup(toBackup(empty));
    expect(parsed.items).toHaveLength(1);
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.orders[0].total).toBe(100);
  });
  it("still reads a v1 file, filling the new stores empty", () => {
    const parsed = parseBackup('{"v":1,"items":[],"orders":[]}');
    expect(parsed.customers).toEqual([]);
    expect(parsed.shifts).toEqual([]);
  });
  it("carries members and promos", () => {
    const parsed = parseBackup(
      toBackup({
        ...empty,
        customers: [{ id: "c", name: "สม", phone: "08", points: 5, spent: 100, ts: 0 }],
        promos: [{ id: "p", name: "ลด", type: "amount", value: 10, minSpend: 0, active: true }],
      })
    );
    expect(parsed.customers[0].points).toBe(5);
    expect(parsed.promos[0].name).toBe("ลด");
  });
  it("rejects an unknown version", () => {
    expect(() => parseBackup('{"v":99,"items":[],"orders":[]}')).toThrow();
  });
  it("rejects non-json", () => {
    expect(() => parseBackup("nope")).toThrow();
  });
});

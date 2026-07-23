import { describe, it, expect } from "vitest";
import { liveOrders, salesTotal, paymentMix, byCategory, hourly, bestSellers, lowStock } from "./report";
import type { Item, Order, OrderLine } from "../types";

const line = (name: string, price: number, qty: number, category?: string): OrderLine => ({
  itemId: name,
  name,
  price,
  qty,
  category,
});
const order = (total: number, lines: OrderLine[] = [], extra: Partial<Order> = {}): Order => ({
  id: crypto.randomUUID(),
  ts: new Date(2026, 0, 1, 12, 0).getTime(),
  lines,
  total,
  received: total,
  change: 0,
  ...extra,
});

describe("liveOrders", () => {
  it("drops voided bills", () => {
    expect(liveOrders([order(100), order(50, [], { voided: true })])).toHaveLength(1);
  });
});

describe("salesTotal", () => {
  it("sums and rounds", () => {
    expect(salesTotal([order(0.1), order(0.2)])).toBe(0.3);
  });
});

describe("paymentMix", () => {
  it("splits cash and QR, treating a missing method as cash", () => {
    const mix = paymentMix([order(100), order(50, [], { method: "qr" }), order(25, [], { method: "cash" })]);
    expect(mix).toEqual([
      { name: "เงินสด", amount: 125, count: 2 },
      { name: "QR พร้อมเพย์", amount: 50, count: 1 },
    ]);
  });
  it("hides a method nobody used", () => {
    expect(paymentMix([order(100)]).map((s) => s.name)).toEqual(["เงินสด"]);
  });
});

describe("byCategory", () => {
  it("groups lines and sorts by revenue", () => {
    const os = [order(0, [line("ข้าวผัด", 50, 2, "อาหาร"), line("โค้ก", 20, 1, "เครื่องดื่ม")])];
    expect(byCategory(os)).toEqual([
      { name: "อาหาร", amount: 100, count: 2 },
      { name: "เครื่องดื่ม", amount: 20, count: 1 },
    ]);
  });
  it("lines with no category fall into อื่นๆ", () => {
    expect(byCategory([order(0, [line("x", 10, 1)])])[0].name).toBe("อื่นๆ");
  });
});

describe("hourly", () => {
  it("always returns 24 buckets", () => {
    expect(hourly([])).toHaveLength(24);
  });
  it("buckets by local hour", () => {
    const h = hourly([order(100), order(50)]);
    expect(h[12]).toEqual({ hour: 12, amount: 150, count: 2 });
    expect(h[13].count).toBe(0);
  });
});

describe("bestSellers", () => {
  it("ranks by quantity", () => {
    const os = [order(0, [line("a", 10, 1), line("b", 5, 9)])];
    expect(bestSellers(os).map((r) => r.name)).toEqual(["b", "a"]);
  });
  it("honours the limit", () => {
    const os = [order(0, [line("a", 1, 1), line("b", 1, 2), line("c", 1, 3)])];
    expect(bestSellers(os, 2)).toHaveLength(2);
  });
});

describe("lowStock", () => {
  const item = (id: string, stock?: number, active = true): Item => ({
    id,
    name: id,
    price: 10,
    category: "x",
    active,
    stock,
  });
  it("only tracked items at or below the line, lowest first", () => {
    expect(lowStock([item("a", 2), item("b", 99), item("c"), item("d", 0)]).map((i) => i.id)).toEqual(["d", "a"]);
  });
  it("ignores items that are off sale", () => {
    expect(lowStock([item("a", 1, false)])).toEqual([]);
  });
});

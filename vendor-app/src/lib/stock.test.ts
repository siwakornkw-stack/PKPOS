import { describe, it, expect } from "vitest";
import { isTracked, remaining, cartQty, applyStock, restock } from "./stock";
import type { Item, OrderLine } from "../types";

const tracked: Item = { id: "i1", name: "ข้าวผัด", price: 50, category: "อาหาร", active: true, stock: 3 };
const untracked: Item = { id: "i2", name: "น้ำเปล่า", price: 10, category: "เครื่องดื่ม", active: true };
const line = (itemId: string, qty: number): OrderLine => ({ itemId, name: "x", price: 50, qty });

describe("isTracked", () => {
  it("only when stock is set", () => {
    expect(isTracked(tracked)).toBe(true);
    expect(isTracked(untracked)).toBe(false);
    expect(isTracked({ ...tracked, stock: 0 })).toBe(true); // 0 means sold out, not untracked
  });
});

describe("remaining", () => {
  it("subtracts what is already in the cart", () => {
    expect(remaining(tracked, 1)).toBe(2);
    expect(remaining(tracked, 3)).toBe(0);
  });
  it("untracked items never run out", () => {
    expect(remaining(untracked, 999)).toBe(Infinity);
  });
});

describe("cartQty", () => {
  it("sums every line of that item, options included", () => {
    expect(cartQty([line("i1", 2), line("i1", 1), line("i2", 5)], "i1")).toBe(3);
  });
  it("0 when absent", () => {
    expect(cartQty([line("i2", 5)], "i1")).toBe(0);
  });
});

describe("applyStock", () => {
  it("decrements only tracked items that sold", () => {
    const out = applyStock([tracked, untracked], [line("i1", 2), line("i2", 4)]);
    expect(out).toEqual([{ ...tracked, stock: 1 }]);
  });
  it("returns nothing when no tracked item sold", () => {
    expect(applyStock([tracked, untracked], [line("i2", 1)])).toEqual([]);
  });
  it("merges multiple lines of the same item", () => {
    expect(applyStock([tracked], [line("i1", 1), line("i1", 2)])[0].stock).toBe(0);
  });
});

describe("restock", () => {
  it("puts a voided bill's goods back", () => {
    expect(restock([tracked], [line("i1", 2)])[0].stock).toBe(5);
  });
  it("undoes applyStock exactly", () => {
    const lines = [line("i1", 2)];
    const sold = applyStock([tracked], lines)[0];
    expect(restock([sold], lines)[0].stock).toBe(tracked.stock);
  });
  it("leaves untracked items alone", () => {
    expect(restock([untracked], [line("i2", 3)])).toEqual([]);
  });
});

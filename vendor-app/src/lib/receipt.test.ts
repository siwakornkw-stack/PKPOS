import { describe, it, expect } from "vitest";
import { receiptText } from "./receipt";
import type { Order } from "../types";

const order: Order = {
  id: "1",
  ts: 0,
  lines: [{ itemId: "a", name: "ข้าวกะเพรา", price: 50, qty: 2 }],
  total: 100,
  received: 200,
  change: 100,
};

describe("receiptText", () => {
  it("includes shop, line, and totals", () => {
    const t = receiptText(order, "ร้านป้าแดง");
    expect(t).toContain("ร้านป้าแดง");
    expect(t).toContain("ข้าวกะเพรา x2");
    expect(t).toContain("รวม  ฿100");
    expect(t).toContain("รับเงิน  ฿200");
    expect(t).toContain("ทอน  ฿100");
  });
});

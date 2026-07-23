import { describe, it, expect } from "vitest";
import { unitPrice, optionsValid, lineSig, lineKey } from "./options";
import type { OptionGroup } from "../types";

const spicy: OptionGroup = {
  id: "g1",
  name: "ความเผ็ด",
  multi: false,
  required: true,
  choices: [
    { id: "c1", name: "ไม่เผ็ด", price: 0 },
    { id: "c2", name: "เผ็ดมาก", price: 0 },
  ],
};
const topping: OptionGroup = {
  id: "g2",
  name: "ท็อปปิ้ง",
  multi: true,
  required: false,
  choices: [
    { id: "c3", name: "ไข่ดาว", price: 10 },
    { id: "c4", name: "พิเศษ", price: 10 },
  ],
};

describe("unitPrice", () => {
  it("adds every chosen option to the base", () => {
    expect(unitPrice(50, [topping.choices[0], topping.choices[1]])).toBe(70);
  });
  it("base price when nothing is chosen", () => {
    expect(unitPrice(50, [])).toBe(50);
  });
  it("rounds float drift", () => {
    expect(unitPrice(0.1, [{ id: "x", name: "x", price: 0.2 }])).toBe(0.3);
  });
});

describe("optionsValid", () => {
  it("required group needs a pick", () => {
    expect(optionsValid([spicy], [])).toBe(false);
    expect(optionsValid([spicy], ["c1"])).toBe(true);
  });
  it("optional group is fine empty", () => {
    expect(optionsValid([topping], [])).toBe(true);
  });
  it("checks every required group", () => {
    expect(optionsValid([spicy, topping], ["c3"])).toBe(false);
    expect(optionsValid([spicy, topping], ["c1", "c3"])).toBe(true);
  });
});

describe("lineSig", () => {
  it("same options in any order collapse to one line", () => {
    expect(lineSig("i1", ["c3", "c4"])).toBe(lineSig("i1", ["c4", "c3"]));
  });
  it("different options are different lines", () => {
    expect(lineSig("i1", ["c3"])).not.toBe(lineSig("i1", ["c4"]));
  });
  it("different items never collide", () => {
    expect(lineSig("i1", [])).not.toBe(lineSig("i2", []));
  });
});

describe("lineKey", () => {
  it("prefers lineId", () => {
    expect(lineKey({ lineId: "L", itemId: "i1", name: "x", price: 1, qty: 1 })).toBe("L");
  });
  it("falls back to itemId for orders saved before options existed", () => {
    expect(lineKey({ itemId: "i1", name: "x", price: 1, qty: 1 })).toBe("i1");
  });
});

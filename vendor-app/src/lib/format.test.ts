import { describe, it, expect } from "vitest";
import { baht } from "./format";

describe("baht", () => {
  it("prefixes the symbol", () => {
    expect(baht(50)).toBe("฿50");
  });
  it("groups thousands", () => {
    expect(baht(12345)).toBe("฿12,345");
  });
  it("keeps up to 2 decimals", () => {
    expect(baht(10.5)).toBe("฿10.5");
    expect(baht(10)).toBe("฿10");
  });
  it("puts the minus outside the symbol", () => {
    expect(baht(-200)).toBe("-฿200");
  });
  it("zero has no sign", () => {
    expect(baht(0)).toBe("฿0");
  });
});

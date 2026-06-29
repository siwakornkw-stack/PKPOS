import { describe, it, expect } from "vitest";
import { ymd, ymCompact, ymdCompact, bizHour, bizDayStart } from "@/lib/format";

// Business tz = Asia/Bangkok = UTC+7 (no DST). These assertions are independent of
// the machine's own timezone because the helpers use a fixed +7 offset.
describe("business-tz date helpers", () => {
  it("ymd rolls the day at Bangkok midnight, not UTC midnight", () => {
    expect(ymd(new Date("2026-06-27T16:59:00Z"))).toBe("2026-06-27"); // 23:59 Bangkok
    expect(ymd(new Date("2026-06-27T17:00:00Z"))).toBe("2026-06-28"); // 00:00 Bangkok next day
    expect(ymd(new Date("2026-06-27T18:30:00Z"))).toBe("2026-06-28"); // 01:30 Bangkok
  });

  it("bizHour is the Bangkok hour", () => {
    expect(bizHour(new Date("2026-06-27T17:00:00Z"))).toBe(0);
    expect(bizHour(new Date("2026-06-27T05:30:00Z"))).toBe(12);
    expect(bizHour(new Date("2026-06-27T16:00:00Z"))).toBe(23);
  });

  it("ymCompact / ymdCompact roll across month boundary at Bangkok midnight", () => {
    const justAfterMidnightJul1 = new Date("2026-06-30T17:30:00Z"); // 00:30 Bangkok Jul 1
    expect(ymd(justAfterMidnightJul1)).toBe("2026-07-01");
    expect(ymCompact(justAfterMidnightJul1)).toBe("202607");
    expect(ymdCompact(justAfterMidnightJul1)).toBe("20260701");
    expect(ymCompact(new Date("2026-06-30T16:00:00Z"))).toBe("202606"); // still Jun (23:00 Bangkok)
  });

  it("bizDayStart returns the UTC instant of Bangkok midnight", () => {
    // Bangkok midnight of 2026-06-28 == 2026-06-27T17:00:00Z
    expect(bizDayStart(new Date("2026-06-27T18:30:00Z")).toISOString()).toBe("2026-06-27T17:00:00.000Z");
    expect(bizDayStart(new Date("2026-06-28T10:00:00Z")).toISOString()).toBe("2026-06-27T17:00:00.000Z");
  });
});

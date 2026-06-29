import { describe, it, expect } from "vitest";
import { timeWindowActive, minutesOfDay, hhmmToMin, minToHhmm } from "@/lib/timewin";

describe("timeWindowActive", () => {
  // 2026-06-27 is a Saturday (getDay() === 6); 14:30 local
  const sat1430 = new Date("2026-06-27T14:30:00");

  it("all-day when no minute window", () => {
    expect(timeWindowActive(sat1430, null, null, null)).toBe(true);
    expect(timeWindowActive(sat1430, "6", null, null)).toBe(true);
  });
  it("filters by weekday", () => {
    expect(timeWindowActive(sat1430, "6", 0, 1439)).toBe(true);
    expect(timeWindowActive(sat1430, "012345", 0, 1439)).toBe(false); // no Sat
  });
  it("matches a same-day window [start,end)", () => {
    expect(timeWindowActive(sat1430, null, 14 * 60, 17 * 60)).toBe(true);
    expect(timeWindowActive(sat1430, null, 9 * 60, 14 * 60)).toBe(false); // end exclusive at 14:00
  });
  it("wraps past midnight when end <= start", () => {
    const sat0030 = new Date("2026-06-27T00:30:00");
    expect(timeWindowActive(sat0030, null, 22 * 60, 2 * 60)).toBe(true); // 22:00 -> 02:00
    expect(timeWindowActive(sat1430, null, 22 * 60, 2 * 60)).toBe(false);
  });
});

describe("minutes helpers", () => {
  it("minutesOfDay", () => {
    expect(minutesOfDay(new Date("2026-06-27T08:15:00"))).toBe(8 * 60 + 15);
  });
  it("hhmm round-trips", () => {
    expect(hhmmToMin("09:30")).toBe(570);
    expect(minToHhmm(570)).toBe("09:30");
    expect(minToHhmm(0)).toBe("00:00");
  });
});

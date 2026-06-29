// Minutes-of-day window matcher, shared by time-based pricing (#4) and promo
// time-of-day windows (#5). Kept pure (no server-only) so client + tests share it.
//
// days: weekday digits "0123456" (0=Sun .. 6=Sat). null/empty = any day.
// window [startMin, endMin): if endMin <= startMin the window wraps past midnight.

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function timeWindowActive(
  now: Date,
  days: string | null | undefined,
  startMin: number | null | undefined,
  endMin: number | null | undefined
): boolean {
  if (days && days.length > 0 && !days.includes(String(now.getDay()))) return false;
  if (startMin == null || endMin == null) return true; // all-day
  const m = minutesOfDay(now);
  if (endMin <= startMin) return m >= startMin || m < endMin; // wraps midnight
  return m >= startMin && m < endMin;
}

// "HH:MM" <-> minutes from midnight (form/seed helpers)
export function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minToHhmm(min: number): string {
  const h = Math.floor(((min % 1440) + 1440) % 1440 / 60);
  const m = (((min % 60) + 60) % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const WEEKDAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"]; // 0=Sun

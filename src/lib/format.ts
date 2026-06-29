// ----- Business timezone (Asia/Bangkok = UTC+7, no DST) -----
// Vercel runs functions in UTC and rejects the reserved `TZ` env name, so we derive
// every calendar field (day/hour/month) in the business tz explicitly instead of
// relying on the system zone. A fixed +7 offset is exact: Thailand has no DST.
export const BIZ_TZ = "Asia/Bangkok";
const BIZ_OFFSET_MS = 7 * 60 * 60000;

// View a UTC instant as business-tz wall clock (shift, then read UTC getters).
function bizClock(d: Date): Date {
  return new Date(d.getTime() + BIZ_OFFSET_MS);
}

// YYYY-MM-DD of an instant in the business tz. Use for report day buckets/labels.
export function ymd(d: Date): string {
  const b = bizClock(d);
  return `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, "0")}-${String(b.getUTCDate()).padStart(2, "0")}`;
}

// Compact YYYYMM / YYYYMMDD in the business tz (document numbering, daily keys).
export function ymCompact(d: Date): string {
  return ymd(d).slice(0, 7).replace("-", "");
}
export function ymdCompact(d: Date): string {
  return ymd(d).replace(/-/g, "");
}

// Hour-of-day (0-23) in the business tz (hourly sales buckets).
export function bizHour(d: Date): number {
  return bizClock(d).getUTCHours();
}

// Start of the business-tz calendar day containing `d`, as a UTC instant (DB ranges).
export function bizDayStart(d: Date): Date {
  return new Date(`${ymd(d)}T00:00:00.000+07:00`);
}

// Short Thai weekday name of an instant in the business tz.
export function bizWeekdayShort(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", { weekday: "short", timeZone: BIZ_TZ }).format(d);
}

export function baht(n: number): string {
  return `฿${(n ?? 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function num(n: number, digits = 0): string {
  return (n ?? 0).toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// PDPA: mask a phone for customer-facing screens (08x-xxx-1234).
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length < 7) return phone;
  return `${d.slice(0, 3)}-xxx-${d.slice(-4)}`;
}

export function fmtDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BIZ_TZ,
  });
}

export function fmtTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BIZ_TZ,
  });
}

import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { Item, Order, Customer, Promo, Shift, CashMove } from "../types";
import {
  putItem,
  saveOrder,
  listItems,
  listOrders,
  listCustomers,
  putCustomer,
  listPromos,
  putPromo,
  listShifts,
  putShift,
  movesForShift,
  putCashMove,
} from "../db";

// ---- pure builders (unit-tested) ----

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ordersToCsv(orders: Order[]): string {
  const head = ["date", "time", "items", "qty", "subtotal", "discount", "total", "method", "received", "change", "voided"];
  const rows = orders.map((o) => {
    const d = new Date(o.ts);
    const items = o.lines
      .map((l) => {
        const opts = (l.opts ?? []).map((x) => x.name).join("/");
        return `${l.name}${opts ? ` (${opts})` : ""} x${l.qty}`;
      })
      .join("; ");
    const qty = o.lines.reduce((s, l) => s + l.qty, 0);
    return [
      d.toLocaleDateString("en-CA"),
      d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
      items,
      qty,
      o.subtotal ?? o.total,
      o.discount ?? 0,
      o.total,
      o.method ?? "cash",
      o.received,
      o.change,
      o.voided ? "1" : "",
    ]
      .map(csvCell)
      .join(",");
  });
  return [head.join(","), ...rows].join("\n");
}

export interface Backup {
  v: 2;
  items: Item[];
  orders: Order[];
  customers: Customer[];
  promos: Promo[];
  shifts: Shift[];
  cashmoves: CashMove[];
}

export function toBackup(data: Omit<Backup, "v">): string {
  return JSON.stringify({ v: 2, ...data } satisfies Backup);
}

// v1 files (items + orders only) still restore — members/promos/shifts simply come back empty.
export function parseBackup(text: string): Backup {
  const b = JSON.parse(text);
  if (!Array.isArray(b?.items) || !Array.isArray(b?.orders)) throw new Error("ไฟล์สำรองไม่ถูกต้อง");
  if (b.v !== 1 && b.v !== 2) throw new Error("ไฟล์สำรองคนละรุ่น");
  return {
    v: 2,
    items: b.items,
    orders: b.orders,
    customers: b.customers ?? [],
    promos: b.promos ?? [],
    shifts: b.shifts ?? [],
    cashmoves: b.cashmoves ?? [],
  };
}

// ---- platform-aware side effects ----

export async function makeBackup(): Promise<string> {
  const [items, orders, customers, promos, shifts] = await Promise.all([
    listItems(),
    listOrders(),
    listCustomers(),
    listPromos(),
    listShifts(),
  ]);
  const moveLists = await Promise.all(shifts.map((s) => movesForShift(s.id)));
  return toBackup({ items, orders, customers, promos, shifts, cashmoves: moveLists.flat() });
}

// Native: write to cache then open the share sheet (send to LINE/Drive/email).
// Web: trigger a normal file download.
export async function saveText(filename: string, text: string, mime: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const res = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: filename, url: res.uri });
    return;
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Uses a hidden <input type=file>, which works in both browsers and the Android WebView.
export function pickTextFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

// Restore merges by key (upsert): re-importing the same backup is idempotent.
export async function restoreBackup(b: Backup): Promise<void> {
  for (const it of b.items) await putItem(it);
  for (const o of b.orders) await saveOrder(o);
  for (const c of b.customers) await putCustomer(c);
  for (const p of b.promos) await putPromo(p);
  for (const s of b.shifts) await putShift(s);
  for (const m of b.cashmoves) await putCashMove(m);
}

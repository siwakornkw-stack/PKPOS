import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { Item, Order } from "../types";
import { putItem, saveOrder } from "../db";

// ---- pure builders (unit-tested) ----

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ordersToCsv(orders: Order[]): string {
  const head = ["date", "time", "items", "qty", "total", "received", "change"];
  const rows = orders.map((o) => {
    const d = new Date(o.ts);
    const items = o.lines.map((l) => `${l.name} x${l.qty}`).join("; ");
    const qty = o.lines.reduce((s, l) => s + l.qty, 0);
    return [
      d.toLocaleDateString("en-CA"),
      d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
      items,
      qty,
      o.total,
      o.received,
      o.change,
    ]
      .map(csvCell)
      .join(",");
  });
  return [head.join(","), ...rows].join("\n");
}

export interface Backup {
  v: 1;
  items: Item[];
  orders: Order[];
}

export function toBackup(items: Item[], orders: Order[]): string {
  return JSON.stringify({ v: 1, items, orders } satisfies Backup);
}

export function parseBackup(text: string): Backup {
  const b = JSON.parse(text);
  if (b?.v !== 1 || !Array.isArray(b.items) || !Array.isArray(b.orders)) {
    throw new Error("ไฟล์สำรองไม่ถูกต้อง");
  }
  return b as Backup;
}

// ---- platform-aware side effects ----

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
}

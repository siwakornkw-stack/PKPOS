import { listItems, putItem } from "./db";
import type { Item } from "./types";

// Stable ids make seeding idempotent: putItem is an upsert by key, so running this
// concurrently (React StrictMode double-mounts the effect in dev) still yields 8 rows, not 16.
const DEMO: Item[] = [
  { id: "demo-1", name: "ข้าวกะเพราหมู", price: 50, category: "อาหาร", active: true },
  { id: "demo-2", name: "ข้าวผัดหมู", price: 50, category: "อาหาร", active: true },
  { id: "demo-3", name: "ผัดซีอิ๊ว", price: 55, category: "อาหาร", active: true },
  { id: "demo-4", name: "ต้มยำกุ้ง", price: 80, category: "อาหาร", active: true },
  { id: "demo-5", name: "น้ำเปล่า", price: 10, category: "เครื่องดื่ม", active: true },
  { id: "demo-6", name: "โค้ก", price: 20, category: "เครื่องดื่ม", active: true },
  { id: "demo-7", name: "ชาเย็น", price: 25, category: "เครื่องดื่ม", active: true },
  { id: "demo-8", name: "กาแฟเย็น", price: 30, category: "เครื่องดื่ม", active: true },
];

// Seed demo menu only when the store is empty, so a real vendor's edits are never overwritten.
export async function ensureSeed(): Promise<void> {
  const existing = await listItems();
  if (existing.length > 0) return;
  for (const it of DEMO) {
    await putItem(it);
  }
}

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Item, Order, Hold } from "./types";

interface PosDB extends DBSchema {
  items: { key: string; value: Item };
  orders: { key: string; value: Order; indexes: { ts: number } };
  holds: { key: string; value: Hold; indexes: { ts: number } };
  settings: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<PosDB>> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB<PosDB>("pkpos", 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore("items", { keyPath: "id" });
          const orders = d.createObjectStore("orders", { keyPath: "id" });
          orders.createIndex("ts", "ts");
          d.createObjectStore("settings");
        }
        if (oldVersion < 2) {
          const holds = d.createObjectStore("holds", { keyPath: "id" });
          holds.createIndex("ts", "ts");
        }
      },
    });
  }
  return dbp;
}

export async function listItems(): Promise<Item[]> {
  return (await db()).getAll("items");
}
export async function putItem(item: Item): Promise<void> {
  await (await db()).put("items", item);
}
export async function deleteItem(id: string): Promise<void> {
  await (await db()).delete("items", id);
}
export async function saveOrder(order: Order): Promise<void> {
  await (await db()).put("orders", order);
}
export async function deleteOrder(id: string): Promise<void> {
  await (await db()).delete("orders", id);
}
export async function ordersBetween(from: number, to: number): Promise<Order[]> {
  return (await db()).getAllFromIndex("orders", "ts", IDBKeyRange.bound(from, to));
}
export async function listOrders(): Promise<Order[]> {
  return (await db()).getAll("orders");
}
export async function saveHold(hold: Hold): Promise<void> {
  await (await db()).put("holds", hold);
}
export async function listHolds(): Promise<Hold[]> {
  return (await db()).getAll("holds");
}
export async function deleteHold(id: string): Promise<void> {
  await (await db()).delete("holds", id);
}
export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db()).get("settings", key) as Promise<T | undefined>;
}
export async function setSetting(key: string, value: unknown): Promise<void> {
  await (await db()).put("settings", value, key);
}

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Item, Order, Hold, Customer, Promo, Shift, CashMove } from "./types";

interface PosDB extends DBSchema {
  items: { key: string; value: Item };
  orders: { key: string; value: Order; indexes: { ts: number } };
  holds: { key: string; value: Hold; indexes: { ts: number } };
  settings: { key: string; value: unknown };
  customers: { key: string; value: Customer };
  promos: { key: string; value: Promo };
  shifts: { key: string; value: Shift; indexes: { openTs: number } };
  cashmoves: { key: string; value: CashMove; indexes: { shiftId: string } };
}

let dbp: Promise<IDBPDatabase<PosDB>> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB<PosDB>("pkpos", 3, {
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
        if (oldVersion < 3) {
          d.createObjectStore("customers", { keyPath: "id" });
          d.createObjectStore("promos", { keyPath: "id" });
          const shifts = d.createObjectStore("shifts", { keyPath: "id" });
          shifts.createIndex("openTs", "openTs");
          const moves = d.createObjectStore("cashmoves", { keyPath: "id" });
          moves.createIndex("shiftId", "shiftId");
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

export async function listCustomers(): Promise<Customer[]> {
  return (await db()).getAll("customers");
}
export async function getCustomer(id: string): Promise<Customer | undefined> {
  return (await db()).get("customers", id);
}
export async function putCustomer(c: Customer): Promise<void> {
  await (await db()).put("customers", c);
}
export async function deleteCustomer(id: string): Promise<void> {
  await (await db()).delete("customers", id);
}

export async function listPromos(): Promise<Promo[]> {
  return (await db()).getAll("promos");
}
export async function putPromo(p: Promo): Promise<void> {
  await (await db()).put("promos", p);
}
export async function deletePromo(id: string): Promise<void> {
  await (await db()).delete("promos", id);
}

export async function listShifts(): Promise<Shift[]> {
  return (await db()).getAll("shifts");
}
export async function putShift(s: Shift): Promise<void> {
  await (await db()).put("shifts", s);
}
// The single shift with no closeTs, if any. Only one may be open at a time.
export async function openShift(): Promise<Shift | undefined> {
  const all = await listShifts();
  return all.filter((s) => !s.closeTs).sort((a, b) => b.openTs - a.openTs)[0];
}
export async function putCashMove(m: CashMove): Promise<void> {
  await (await db()).put("cashmoves", m);
}
export async function movesForShift(shiftId: string): Promise<CashMove[]> {
  return (await db()).getAllFromIndex("cashmoves", "shiftId", shiftId);
}

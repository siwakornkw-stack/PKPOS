// Offline order queue (PWA). When the network is down, new orders are stored in
// IndexedDB and replayed when connectivity returns. The server dedupes by
// idempotencyKey so a replay never creates a duplicate order.

const DB_NAME = "resto-pos-offline";
const STORE = "order-queue";

export interface QueuedOrder {
  key: string; // idempotencyKey
  payload: unknown;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE))
        req.result.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const r = fn(db.transaction(STORE, mode).objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      })
  );
}

export function queueOrder(key: string, payload: unknown): Promise<unknown> {
  return tx("readwrite", (s) => s.put({ key, payload, createdAt: Date.now() }));
}

export async function getQueued(): Promise<QueuedOrder[]> {
  return (await tx<QueuedOrder[]>("readonly", (s) => s.getAll())) ?? [];
}

export function dequeue(key: string): Promise<unknown> {
  return tx("readwrite", (s) => s.delete(key));
}

export async function queueCount(): Promise<number> {
  return (await getQueued()).length;
}

// Replay queued orders. Only a genuine bad-payload rejection (400/422) is dropped;
// auth/transient failures (401/402/403/408/429/5xx) are KEPT and retried after re-auth,
// so an expired cookie or brief suspension never silently discards captured sales.
export async function syncQueue(): Promise<{ synced: number; dropped: number; pending: number }> {
  const items = await getQueued();
  let synced = 0, dropped = 0;
  for (const it of items) {
    let res: Response;
    try {
      res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(it.payload),
      });
    } catch {
      break; // still offline - stop, keep everything for next attempt
    }
    if (res.ok) {
      await dequeue(it.key);
      synced++;
    } else if (res.status === 400 || res.status === 422) {
      await dequeue(it.key); // bad payload - drop so it doesn't wedge the queue
      dropped++;
    } else {
      break; // auth/rate-limit/server error - keep and retry later
    }
  }
  return { synced, dropped, pending: await queueCount() };
}

import "server-only";

// Delivery aggregator order import (GrabFood / LINE MAN / ShopeeFood / Robinhood).
// Each provider posts a different webhook JSON; we normalise to one internal shape.
// Replace the per-provider field maps below when wiring a real merchant account.

export type DeliveryProvider = "GRAB" | "LINEMAN" | "SHOPEE" | "ROBINHOOD";
export const DELIVERY_PROVIDERS: DeliveryProvider[] = ["GRAB", "LINEMAN", "SHOPEE", "ROBINHOOD"];

export function isDeliveryProvider(s: string): s is DeliveryProvider {
  return (DELIVERY_PROVIDERS as string[]).includes(s);
}

export interface NormalizedDeliveryItem {
  code: string; // our menu item code (or barcode/sku mapped upstream)
  qty: number;
  note?: string;
}

export interface NormalizedDeliveryOrder {
  externalRef: string; // aggregator's order id (idempotency)
  branchCode: string; // which of our branches
  customerName?: string;
  note?: string;
  items: NormalizedDeliveryItem[];
}

type Raw = Record<string, unknown>;
const str = (v: unknown): string => (v == null ? "" : String(v));
// qty maps to a Prisma Int column, so truncate to a positive integer here -
// a fractional payload qty would otherwise throw an unhandled 500 at write time.
const intOr = (v: unknown, d: number): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : d;
};

// Permissive parser. The mock/demo shape is { orderId, branchCode, items:[{code, qty, note}] }
// and is also a sensible default for every provider until real field maps are added.
export function normalizeDeliveryPayload(
  _provider: DeliveryProvider,
  raw: unknown
): NormalizedDeliveryOrder | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  const externalRef = str(r.orderId ?? r.id ?? r.reference);
  const branchCode = str(r.branchCode ?? r.storeCode ?? r.storeId);
  const itemsRaw = (r.items ?? r.lineItems) as unknown;
  if (!externalRef || !branchCode || !Array.isArray(itemsRaw) || itemsRaw.length === 0) return null;

  const items: NormalizedDeliveryItem[] = (itemsRaw as Raw[])
    .map((it) => ({
      code: str(it.code ?? it.sku ?? it.menuCode),
      qty: intOr(it.qty ?? it.quantity, 1),
      note: it.note != null ? str(it.note) : it.remark != null ? str(it.remark) : undefined,
    }))
    .filter((it) => it.code.length > 0);
  if (items.length === 0) return null;

  const customer = (r.customer ?? {}) as Raw;
  return {
    externalRef,
    branchCode,
    customerName: r.customerName != null ? str(r.customerName) : customer.name != null ? str(customer.name) : undefined,
    note: r.note != null ? str(r.note) : undefined,
    items,
  };
}

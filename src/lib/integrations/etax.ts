import "server-only";

// e-Tax invoice submission adapter (ใบกำกับภาษีอิเล็กทรอนิกส์ / e-Tax Invoice & e-Receipt).
// MOCK until the branch enables e-Tax (etaxEnabled) and an ETAX_API_KEY is set.
// A real integration posts the signed XML to an ETDA-certified service provider.

export interface EtaxResult {
  status: "SUBMITTED" | "FAILED";
  mode: "LIVE" | "MOCK";
  ref?: string;
  detail?: string;
}

export interface EtaxInvoice {
  docNo: string;
  branchTaxId: string | null;
  buyerName: string | null;
  buyerTaxId: string | null;
  buyerAddress: string | null;
  netAmount: number;
  taxAmount: number;
}

// Stable per-invoice idempotency key (docNo is globally unique). Sent to the provider
// so a retried/concurrent submit returns the SAME invoice instead of issuing a duplicate.
const idemKey = (inv: EtaxInvoice) => `etax-${inv.docNo}`;

export async function submitEtax(enabled: boolean, inv: EtaxInvoice): Promise<EtaxResult> {
  if (!inv.buyerName || !inv.buyerTaxId) {
    return { status: "FAILED", mode: enabled ? "LIVE" : "MOCK", detail: "missing buyer tax details" };
  }
  const apiKey = process.env.ETAX_API_KEY;
  if (!enabled || !apiKey) {
    // MOCK: accept and return a deterministic-looking reference (docNo-based, no PII)
    return { status: "SUBMITTED", mode: "MOCK", ref: `ETAX-MOCK-${inv.docNo}` };
  }
  try {
    const res = await fetch(`${process.env.ETAX_API_URL ?? "https://etax.example.com/api/v1/invoices"}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": idemKey(inv), // provider must dedup so a retry can't double-issue
      },
      body: JSON.stringify(inv),
    });
    if (!res.ok) return { status: "FAILED", mode: "LIVE", detail: `e-Tax ${res.status}` };
    const data = (await res.json().catch(() => ({}))) as { ref?: string; id?: string };
    return { status: "SUBMITTED", mode: "LIVE", ref: data.ref ?? data.id ?? `ETAX-${inv.docNo}` };
  } catch (e) {
    return { status: "FAILED", mode: "LIVE", detail: e instanceof Error ? e.message : "submit failed" };
  }
}

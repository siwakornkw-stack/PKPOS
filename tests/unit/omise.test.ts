import { describe, it, expect, vi, beforeEach } from "vitest";
import { chargeCustomer, chargeWithToken } from "@/lib/payments/omise";

// Capture the fetch call the Omise client builds, return a canned successful charge.
function mockFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { json: async () => ({ object: "charge", id: "chrg_test_1", status: "successful", paid: true }) } as Response;
  });
  // @ts-expect-error test stub
  global.fetch = fn;
  return calls;
}

function body(init: RequestInit) {
  return new URLSearchParams(String(init.body));
}

describe("omise REST client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("charges a customer with amount in satang (THB*100), lowercased currency, metadata encoded", async () => {
    const calls = mockFetch();
    const res = await chargeCustomer("skey_test_x", {
      amount: 590, customerId: "cust_1", description: "subscription:BASIC", metadata: { tenantId: 5, plan: "BASIC" },
    });
    expect(res.status).toBe("successful");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.omise.co/charges");
    expect(calls[0].init.method).toBe("POST");
    const b = body(calls[0].init);
    expect(b.get("amount")).toBe("59000");
    expect(b.get("currency")).toBe("thb");
    expect(b.get("customer")).toBe("cust_1");
    expect(b.get("metadata[tenantId]")).toBe("5");
    expect(b.get("metadata[plan]")).toBe("BASIC");
  });

  it("uses HTTP Basic auth with the secret key as username and blank password", async () => {
    const calls = mockFetch();
    await chargeWithToken("skey_test_abc", { amount: 100, token: "tokn_1" });
    const auth = (calls[0].init.headers as Record<string, string>).Authorization;
    expect(auth).toBe("Basic " + Buffer.from("skey_test_abc:").toString("base64"));
  });

  it("rounds fractional baht to the nearest satang", async () => {
    const calls = mockFetch();
    await chargeWithToken("skey_test_x", { amount: 100.5, token: "tokn_1" });
    expect(body(calls[0].init).get("amount")).toBe("10050");
  });

  it("sends an Idempotency-Key header when provided, omits it otherwise", async () => {
    const calls = mockFetch();
    await chargeCustomer("skey_test_x", { amount: 590, customerId: "cust_1", idempotencyKey: "renew:5:2026-07" });
    expect((calls[0].init.headers as Record<string, string>)["Idempotency-Key"]).toBe("renew:5:2026-07");
    const calls2 = mockFetch();
    await chargeWithToken("skey_test_x", { amount: 100, token: "tokn_1" });
    expect((calls2[0].init.headers as Record<string, string>)["Idempotency-Key"]).toBeUndefined();
  });

  it("throws when the API returns an error object", async () => {
    // @ts-expect-error test stub
    global.fetch = vi.fn(async () => ({ json: async () => ({ object: "error", code: "invalid_card", message: "bad card" }) }));
    await expect(chargeWithToken("skey_test_x", { amount: 100, token: "tokn_bad" })).rejects.toThrow("bad card");
  });
});

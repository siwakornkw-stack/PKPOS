import "server-only";
import { timingSafeEqual } from "node:crypto";

// Integration layer for external accounts (delivery aggregators, LINE OA, e-Tax).
// Each adapter runs in MOCK/no-op mode until its credentials are configured, so
// dev/demo/smoke work end-to-end and going live is just setting env/branch keys.
// This mirrors the existing Omise gateway pattern.

// Verify a delivery webhook's shared secret. When DELIVERY_WEBHOOK_SECRET is unset
// we accept ONLY outside production (local/dev); in production a missing secret
// fails closed so a misconfigured deploy can't expose an unauthenticated, cross-tenant
// order-injection endpoint. Compared in constant time to avoid a timing side-channel.
export function webhookSecretOk(headers: Headers): boolean {
  const expected = process.env.DELIVERY_WEBHOOK_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production"; // fail-closed in prod
  const got = Buffer.from(headers.get("x-webhook-secret") ?? "");
  const exp = Buffer.from(expected);
  return got.length === exp.length && timingSafeEqual(got, exp);
}

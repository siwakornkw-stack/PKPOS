import "server-only";
import { timingSafeEqual } from "crypto";

// SCAFFOLD for KBank (K SHOP / แม่มณี) QR payment confirmation.
// The shop already receives money via the generated PromptPay/Thai QR. This module is the hook
// for AUTO-confirming those payments in real time once you onboard with KBank's merchant API.
//
// KBank's real inbound notification is signed per their partner docs (HMAC over the raw body with
// your partner key, sent in a signature header). Implement verifyKbankWebhook() against that scheme
// when you have the credentials. Until then it accepts a shared secret header so the flow can be
// wired and tested end-to-end internally. The webhook stays OFF unless KBANK_WEBHOOK_SECRET is set.

export function kbankConfigured(): boolean {
  return !!process.env.KBANK_WEBHOOK_SECRET;
}

export function verifyKbankWebhook(headers: Headers, _rawBody: string): boolean {
  const secret = process.env.KBANK_WEBHOOK_SECRET;
  if (!secret) return false;
  // TODO(kbank): replace with KBank's documented signature (HMAC-SHA256 of _rawBody with the
  // partner key, compared constant-time against their signature header) once onboarded.
  const provided = headers.get("x-kbank-secret") ?? "";
  const a = Buffer.from(provided), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

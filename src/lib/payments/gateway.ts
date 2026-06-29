import "server-only";
import { chargeWithToken } from "./omise";

// Card charge (per-branch: the restaurant collects from a diner). Dev uses a
// deterministic mock that always approves (sequential id, no timestamps/randomness
// so demos are reproducible). When the branch is configured for OMISE and a card
// token is supplied, a real charge runs against the branch's own Omise account.
export interface ChargeInput {
  amount: number;
  currency: string;
  token?: string;
  ref?: string;
}
export interface ChargeResult {
  success: boolean;
  transactionId: string;
  provider: string;
  message?: string;
}

let counter = 0;

// cfg comes from the branch's payment settings (Settings -> ตั้งค่าธุรกิจ);
// falls back to OMISE_SECRET_KEY env when not configured per-branch.
export async function chargeCard(
  input: ChargeInput,
  cfg?: { provider?: string; secretKey?: string }
): Promise<ChargeResult> {
  const secretKey = cfg?.secretKey || process.env.OMISE_SECRET_KEY;
  const useOmise = (cfg?.provider === "OMISE" || !cfg?.provider) && !!secretKey;

  if (useOmise && secretKey) {
    if (!input.token)
      return { success: false, transactionId: "", provider: "omise", message: "ต้องมี card token (tokenize ฝั่ง client ก่อน)" };
    try {
      const charge = await chargeWithToken(secretKey, {
        amount: input.amount,
        currency: input.currency,
        token: input.token,
        description: input.ref,
      });
      const ok = charge.status === "successful" && charge.paid;
      return { success: ok, transactionId: charge.id, provider: "omise", message: ok ? undefined : charge.failure_message || "ถูกปฏิเสธ" };
    } catch (e) {
      return { success: false, transactionId: "", provider: "omise", message: e instanceof Error ? e.message : "charge failed" };
    }
  }
  counter += 1;
  return { success: true, transactionId: "MOCK-" + String(counter).padStart(6, "0"), provider: "mock" };
}

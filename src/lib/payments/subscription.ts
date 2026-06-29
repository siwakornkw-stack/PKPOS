import "server-only";
import { randomUUID } from "crypto";
import type { Tenant } from "@prisma/client";
import { round2 } from "@/lib/format";
import { chargeCustomer, createCustomer, updateCustomerCard, defaultCardOf, type OmiseCharge } from "./omise";

// Platform-level subscription billing: tenants (restaurants) pay the PLATFORM owner.
// Uses the platform's own Omise account (PLATFORM_OMISE_* env), distinct from each
// branch's gateway (which collects from diners). When unset, runs a mock that
// approves - keeps dev/demo/smoke working without real keys.

const SECRET = () => process.env.PLATFORM_OMISE_SECRET_KEY || "";
const PUBLIC = () => process.env.PLATFORM_OMISE_PUBLIC_KEY || "";

export function platformConfigured(): boolean {
  return !!SECRET() && !!PUBLIC();
}
export function platformPublicKey(): string {
  return PUBLIC();
}

export interface CardDetails {
  omiseCustomerId: string;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
}

export interface ChargeOutcome {
  success: boolean;
  chargeId: string | null;
  message?: string;
  card?: CardDetails; // present when a new token was saved
}

type TenantRef = Pick<Tenant, "id" | "name" | "omiseCustomerId">;

// Save a card to the tenant's Omise customer (create or replace) WITHOUT charging.
// Used by the change-card flow so updating a card never bills a month.
export async function saveCard(tenant: TenantRef, token: string): Promise<{ ok: boolean; card?: CardDetails; message?: string }> {
  if (!platformConfigured()) return { ok: true }; // mock: nothing to store
  try {
    const secret = SECRET();
    const customer = tenant.omiseCustomerId
      ? await updateCustomerCard(secret, tenant.omiseCustomerId, token)
      : await createCustomer(secret, { token, description: `tenant:${tenant.id} ${tenant.name}` });
    const c = defaultCardOf(customer);
    return {
      ok: true,
      card: {
        omiseCustomerId: customer.id,
        cardBrand: c?.brand ?? null,
        cardLast4: c?.last_digits ?? null,
        cardExpMonth: c?.expiration_month ?? null,
        cardExpYear: c?.expiration_year ?? null,
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "บันทึกบัตรไม่สำเร็จ" };
  }
}

// Charge a tenant for a plan. If a fresh card token is supplied, save it as the
// tenant's Omise customer (create or replace) first, then charge that customer.
// With no token, charge the already-saved customer (used by auto-renew).
// idempotencyKey makes a retried charge return the original instead of double-billing.
export async function chargeSubscription(
  tenant: TenantRef,
  plan: string,
  amount: number,
  opts: { token?: string; idempotencyKey?: string } = {}
): Promise<ChargeOutcome> {
  if (!platformConfigured()) {
    // mock: always approves. id must be globally unique (Invoice.omiseChargeId is unique)
    // even across concurrent serverless instances - use a UUID.
    return { success: true, chargeId: `MOCK-SUB-${randomUUID()}` };
  }

  const secret = SECRET();
  let card: CardDetails | undefined;
  let customerId = tenant.omiseCustomerId ?? null;

  try {
    if (opts.token) {
      const saved = await saveCard(tenant, opts.token);
      if (!saved.ok || !saved.card) return { success: false, chargeId: null, message: saved.message || "บัตรไม่ถูกต้อง" };
      card = saved.card;
      customerId = saved.card.omiseCustomerId;
    }
    if (!customerId) return { success: false, chargeId: null, message: "ยังไม่มีบัตรที่บันทึกไว้" };

    const charge: OmiseCharge = await chargeCustomer(secret, {
      amount: round2(amount),
      customerId,
      description: `subscription:${plan}`,
      metadata: { tenantId: tenant.id, plan },
      idempotencyKey: opts.idempotencyKey,
    });
    if (charge.status === "successful" && charge.paid)
      return { success: true, chargeId: charge.id, card };
    return { success: false, chargeId: charge.id, message: charge.failure_message || "การชำระเงินถูกปฏิเสธ", card };
  } catch (e) {
    return { success: false, chargeId: null, message: e instanceof Error ? e.message : "ชำระเงินไม่สำเร็จ", card };
  }
}

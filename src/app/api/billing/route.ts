import { NextRequest } from "next/server";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { requireAuth, apiError, writeAudit } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { chargeSubscription, saveCard, platformConfigured, platformPublicKey } from "@/lib/payments/subscription";
import { promptPayPayload } from "@/lib/promptpay";
import { PLANS, PAID_PLANS } from "@/lib/plans";

function isOwner(perms: string[]) { return perms.includes("*"); }

// Platform PromptPay / bank-transfer config for manual subscription payment.
// Priority: super-admin uploaded QR image (DB) > promptPayId-generated QR (DB > env).
async function transferConfig() {
  const s = await prisma.platformSetting.findUnique({ where: { id: 1 } });
  const image = s?.promptPayImage || null; // uploaded static QR (wins)
  const promptPayId = s?.promptPayId || process.env.PLATFORM_PROMPTPAY_ID || null;
  const bankInfo = s?.bankInfo || process.env.PLATFORM_BANK_INFO || null;

  const qr: Record<string, string> = {};
  if (!image && promptPayId)
    for (const p of PAID_PLANS)
      qr[p] = await QRCode.toDataURL(promptPayPayload(promptPayId, PLANS[p].price), { margin: 1, width: 240 });

  return { enabled: !!(image || promptPayId || bankInfo), promptPayId, bankInfo, qr, image };
}

// GET: current subscription + plans + invoice history + payment config (owner only).
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;
  if (!auth.user.tenantId || !isOwner(auth.user.permissions)) return apiError(403, "เฉพาะเจ้าของร้าน");

  const tenant = await prisma.tenant.findUnique({ where: { id: auth.user.tenantId } });
  const invoices = await prisma.invoice.findMany({ where: { tenantId: auth.user.tenantId }, orderBy: { id: "desc" }, take: 20 });
  const savedCard = tenant?.cardLast4
    ? { brand: tenant.cardBrand, last4: tenant.cardLast4, expMonth: tenant.cardExpMonth, expYear: tenant.cardExpYear }
    : null;
  const pendingPayment = await prisma.subscriptionPayment.findFirst({
    where: { tenantId: auth.user.tenantId, status: "PENDING" },
    orderBy: { id: "desc" },
    select: { id: true, plan: true, amount: true, createdAt: true },
  });
  return Response.json({
    tenant,
    plans: PLANS,
    invoices,
    payment: { live: platformConfigured(), publicKey: platformConfigured() ? platformPublicKey() : null, savedCard },
    transfer: await transferConfig(),
    pendingPayment,
  });
}

const schema = z.object({
  action: z.enum(["subscribe", "update_card"]).default("subscribe"),
  plan: z.enum(["BASIC", "PRO"]).optional(),
  omiseToken: z.string().min(1).optional(),
});

// POST: subscribe/renew (charge + 30 days) OR update_card (save card, no charge).
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;
  if (!auth.user.tenantId || !isOwner(auth.user.permissions)) return apiError(403, "เฉพาะเจ้าของร้าน");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");
  const tenant = await prisma.tenant.findUnique({ where: { id: auth.user.tenantId } });
  if (!tenant) return apiError(404, "ไม่พบร้าน");

  // change-card: save the new card without billing or resetting the period
  if (parsed.data.action === "update_card") {
    if (!parsed.data.omiseToken) return apiError(400, "กรุณากรอกข้อมูลบัตร");
    const saved = await saveCard(tenant, parsed.data.omiseToken);
    if (!saved.ok) return apiError(402, saved.message || "บันทึกบัตรไม่สำเร็จ");
    if (saved.card) await prisma.tenant.update({ where: { id: tenant.id }, data: saved.card });
    await writeAudit({ userId: auth.user.id, action: "update_card", entity: "tenant", entityId: tenant.id });
    return Response.json({ ok: true, card: saved.card ?? null });
  }

  const plan = parsed.data.plan;
  if (!plan || !PAID_PLANS.includes(plan as (typeof PAID_PLANS)[number])) return apiError(400, "แผนไม่ถูกต้อง");
  const price = PLANS[plan].price;
  if (platformConfigured() && !parsed.data.omiseToken && !tenant.omiseCustomerId)
    return apiError(400, "กรุณากรอกข้อมูลบัตร");

  // deterministic idempotency key anchored to the tenant's current billing state: a retry
  // (double-click, timeout) reuses the same Omise charge instead of double-billing, while a
  // legitimate later renewal (state advanced) gets a fresh key. Omise dedupes for 24h.
  const anchor = tenant.currentPeriodEnd?.toISOString() ?? tenant.trialEndsAt?.toISOString() ?? "new";
  const idempotencyKey = `sub:${tenant.id}:${anchor}:${plan}`;
  const result = await chargeSubscription(tenant, plan, price, { token: parsed.data.omiseToken, idempotencyKey });
  if (!result.success) return apiError(402, result.message || "ชำระค่าบริการไม่สำเร็จ");

  const periodStart = new Date();
  const periodEnd = new Date(Date.now() + 30 * 86400000);
  try {
    await prisma.$transaction([
      prisma.tenant.update({
        where: { id: auth.user.tenantId },
        data: {
          plan, status: "ACTIVE", currentPeriodEnd: periodEnd, trialEndsAt: null, renewalFailedAt: null,
          ...(result.card ?? {}),
        },
      }),
      prisma.invoice.create({
        data: { tenantId: auth.user.tenantId, plan, amount: price, status: "PAID", periodStart, periodEnd, omiseChargeId: result.chargeId },
      }),
    ]);
  } catch (e) {
    // P2002 unique(omiseChargeId) = this charge was already recorded (idempotent retry); treat as success
    if ((e as { code?: string })?.code !== "P2002") throw e;
  }

  // refresh the session so the suspension gate clears immediately
  await createSession({ ...auth.user, tenantStatus: "ACTIVE", tenantPlan: plan });
  await writeAudit({ userId: auth.user.id, action: "subscribe", entity: "tenant", entityId: auth.user.tenantId, after: { plan, txn: result.chargeId } });

  return Response.json({ ok: true, plan, periodEnd });
}

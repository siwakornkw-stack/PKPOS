import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, apiError, writeAudit } from "@/lib/api";
import { PLANS, PAID_PLANS } from "@/lib/plans";

function isOwner(perms: string[]) { return perms.includes("*"); }

// ~2MB cap on the slip data URL (base64 is ~1.37x the bytes). Slips are phone shots.
const MAX_SLIP_CHARS = 2_800_000;

const schema = z.object({
  plan: z.enum(["BASIC", "PRO"]),
  slip: z.string().startsWith("data:image/").max(MAX_SLIP_CHARS, "ไฟล์สลิปใหญ่เกินไป (สูงสุด ~2MB)"),
  ref: z.string().max(200).optional(),
});

// POST: tenant owner submits a PromptPay/transfer slip for manual approval.
// Creates a PENDING SubscriptionPayment - does NOT activate the plan (admin approves).
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;
  if (!auth.user.tenantId || !isOwner(auth.user.permissions)) return apiError(403, "เฉพาะเจ้าของร้าน");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
  const d = parsed.data;
  if (!PAID_PLANS.includes(d.plan)) return apiError(400, "แผนไม่ถูกต้อง");

  // one open request at a time (avoid duplicate slips for the same tenant)
  const existing = await prisma.subscriptionPayment.findFirst({ where: { tenantId: auth.user.tenantId, status: "PENDING" } });
  if (existing) return apiError(409, "มีรายการรออนุมัติอยู่แล้ว");

  const payment = await prisma.subscriptionPayment.create({
    data: {
      tenantId: auth.user.tenantId,
      plan: d.plan,
      amount: PLANS[d.plan].price,
      method: "TRANSFER",
      slipUrl: d.slip,
      ref: d.ref,
      status: "PENDING",
    },
    select: { id: true, plan: true, amount: true, status: true, createdAt: true },
  });
  await writeAudit({ userId: auth.user.id, action: "submit_transfer", entity: "subscription_payment", entityId: payment.id, after: { plan: d.plan, amount: payment.amount } });
  return Response.json({ ok: true, payment });
}

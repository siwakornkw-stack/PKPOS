import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, apiError, writeAudit } from "@/lib/api";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().max(300).optional(),
});

const DAY = 86400000;

// PATCH: super-admin approves (activates the plan +30 days + Invoice) or rejects a transfer slip.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  const payment = await prisma.subscriptionPayment.findUnique({ where: { id }, include: { tenant: true } });
  if (!payment) return apiError(404, "ไม่พบรายการ");
  if (payment.status !== "PENDING") return apiError(409, "รายการนี้ถูกตรวจแล้ว");

  if (parsed.data.action === "reject") {
    await prisma.subscriptionPayment.update({
      where: { id },
      data: { status: "REJECTED", reviewedBy: auth.user.id, reviewedAt: new Date(), note: parsed.data.note },
    });
    await writeAudit({ userId: auth.user.id, action: "reject_transfer", entity: "subscription_payment", entityId: id });
    return Response.json({ ok: true, status: "REJECTED" });
  }

  // approve: claim the row, activate the tenant (+30d from the later of now/current end), record an Invoice
  const now = new Date();
  const t = payment.tenant;
  const base = t.currentPeriodEnd && t.currentPeriodEnd > now ? t.currentPeriodEnd : now;
  const periodEnd = new Date(base.getTime() + 30 * DAY);

  const ok = await prisma.$transaction(async (tx) => {
    const claim = await tx.subscriptionPayment.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "APPROVED", reviewedBy: auth.user.id, reviewedAt: now, note: parsed.data.note },
    });
    if (claim.count === 0) return false; // someone else reviewed it first
    await tx.tenant.update({
      where: { id: payment.tenantId },
      data: { plan: payment.plan, status: "ACTIVE", currentPeriodEnd: periodEnd, trialEndsAt: null, renewalFailedAt: null },
    });
    await tx.invoice.create({
      data: { tenantId: payment.tenantId, plan: payment.plan, amount: payment.amount, status: "PAID", periodStart: now, periodEnd, omiseChargeId: `TRANSFER-${payment.id}` },
    });
    return true;
  });
  if (!ok) return apiError(409, "รายการนี้ถูกตรวจแล้ว");

  await writeAudit({ userId: auth.user.id, action: "approve_transfer", entity: "subscription_payment", entityId: id, after: { tenantId: payment.tenantId, plan: payment.plan, amount: payment.amount } });
  return Response.json({ ok: true, status: "APPROVED", periodEnd });
}

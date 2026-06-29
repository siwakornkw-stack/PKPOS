import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { round2 } from "@/lib/format";
import { nextDocNo } from "@/lib/docno";
import { applyRecipeStock } from "@/lib/orders";
import { earnPoints, tierForSpent } from "@/lib/loyalty";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { kbankConfigured, verifyKbankWebhook } from "@/lib/integrations/kbank";

// SCAFFOLD: KBank / Mae Manee QR-payment webhook. When a customer pays the shop's QR, KBank's
// merchant API would call this to confirm settlement, and we auto-mark the order PAID. The QR
// settlement below mirrors the QR branch of /api/orders/[id]/pay (atomic claim + QR Payment +
// recipe stock + loyalty + promo cap). DISABLED unless KBANK_WEBHOOK_SECRET is set, and the real
// KBank signature must be wired in src/lib/integrations/kbank.ts before going live.
//
// Expected payload: { docNo: string, amount: number, txnRef?: string }
const CLOSED = ["PAID", "VOID", "CLOSED", "REFUNDED"];

export async function POST(req: NextRequest) {
  if (!rateLimit(`kbank:${clientIp(req.headers)}`, 60, 60_000)) return new Response("rate limited", { status: 429 });
  if (!kbankConfigured()) return Response.json({ ignored: true, reason: "KBANK_WEBHOOK_SECRET not set" });

  const rawBody = await req.text();
  if (!verifyKbankWebhook(req.headers, rawBody)) return new Response("unauthorized", { status: 401 });

  let evt: { docNo?: string; amount?: number; txnRef?: string } | null = null;
  try { evt = JSON.parse(rawBody); } catch { return new Response("bad payload", { status: 400 }); }
  const docNo = evt?.docNo;
  const amount = Number(evt?.amount);
  if (!docNo || !Number.isFinite(amount)) return new Response("bad payload", { status: 400 });

  const order = await prisma.salesOrder.findFirst({ where: { docNo }, include: { branch: true } });
  if (!order) return Response.json({ ignored: true, reason: "order not found" });
  if (CLOSED.includes(order.status)) return Response.json({ ok: true, alreadyClosed: true });
  if (round2(amount) < round2(order.netAmount)) return Response.json({ ignored: true, reason: "amount mismatch" });

  const out = await prisma.$transaction(async (tx) => {
    // atomically claim the open order so a concurrent /pay or repeated webhook can't double-settle
    const claim = await tx.salesOrder.updateMany({
      where: { id: order.id, status: { notIn: CLOSED } },
      data: { status: "PAID", paidAt: new Date(), closedAt: new Date() },
    });
    if (claim.count === 0) throw new Error("CLOSED");

    await tx.payment.create({
      data: {
        docNo: await nextDocNo("RC", order.branch.code, tx),
        orderId: order.id, method: "QR", amount: round2(order.netAmount),
        received: round2(order.netAmount), change: 0, ref: evt?.txnRef ?? "KBANK",
        shiftId: order.shiftId, createdBy: order.userId,
      },
    });
    await applyRecipeStock(tx, order.id, order.branchId, order.branch.code, order.userId, "SALE_DEDUCT");
    if (order.tableId) await tx.diningTable.update({ where: { id: order.tableId }, data: { status: "AVAILABLE" } });

    if (order.memberId) {
      const m = await tx.member.findUnique({ where: { id: order.memberId } });
      if (m) {
        const tiers = await tx.memberTier.findMany({ where: { tenantId: m.tenantId ?? -1 } });
        const afterDiscount = round2(order.subtotal - order.discount - order.pointsDiscount);
        const earned = earnPoints(afterDiscount, tierForSpent(tiers, m.totalSpent)?.pointMultiplier ?? 1);
        const newSpent = round2(m.totalSpent + order.netAmount);
        await tx.member.update({ where: { id: m.id }, data: { points: { increment: earned }, totalSpent: newSpent, tierId: tierForSpent(tiers, newSpent)?.id ?? null } });
        await tx.salesOrder.update({ where: { id: order.id }, data: { pointsEarned: earned } });
      }
    }
    if (order.promotionId) {
      const promo = await tx.promotion.findUnique({ where: { id: order.promotionId } });
      if (promo) {
        if (promo.usageLimit != null) {
          const r = await tx.promotion.updateMany({ where: { id: promo.id, usedCount: { lt: promo.usageLimit } }, data: { usedCount: { increment: 1 } } });
          if (r.count === 0) throw new Error("PROMO_LIMIT");
        } else {
          await tx.promotion.update({ where: { id: promo.id }, data: { usedCount: { increment: 1 } } });
        }
      }
    }
    return true;
  }).catch((e) => (e instanceof Error ? e.message : "ERR"));

  if (out === "CLOSED") return Response.json({ ok: true, alreadyClosed: true });
  if (out !== true) return new Response("settle failed: " + out, { status: 500 });
  return Response.json({ ok: true, docNo, settled: true });
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { recalcOrder, applyRecipeStock } from "@/lib/orders";
import { nextDocNo } from "@/lib/docno";
import { round2 } from "@/lib/format";
import { earnPoints, tierForSpent } from "@/lib/loyalty";

const schema = z.object({
  method: z.enum(["CASH", "QR", "CARD"]),
  received: z.number().nonnegative().default(0),
  ref: z.string().optional(),
  discount: z.number().nonnegative().optional(),
  noServiceCharge: z.boolean().optional(), // waive the dine-in service charge (needs DISCOUNT_OVERRIDE)
  // split payment: multiple methods summing to (>=) the net amount
  payments: z.array(z.object({ method: z.enum(["CASH", "QR", "CARD"]), amount: z.number().positive() })).optional(),
});

const ERRORS: Record<string, [number, string]> = {
  NOT_FOUND: [404, "ไม่พบออเดอร์"],
  ALREADY_CLOSED: [409, "ออเดอร์นี้ชำระเงินแล้ว"],
  EMPTY: [422, "ออเดอร์ว่าง ไม่สามารถชำระเงินได้"],
  UNDERPAID: [422, "จำนวนเงินที่รับน้อยกว่ายอดชำระ"],
  OVERPAID: [422, "บัตร/QR ต้องชำระพอดี ทอนเงินได้เฉพาะเงินสด"],
  PROMO_LIMIT: [409, "โปรโมชันถูกใช้ครบจำนวนแล้ว กรุณานำโปรออกจากบิล"],
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  const { user, branchId } = auth;
  if (!rateLimit(`pay:${user.id}`, 100, 60_000)) return apiError(429, "ดำเนินการถี่เกินไป ลองใหม่อีกครั้ง");
  const orderId = Number((await params).id);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลการชำระไม่ถูกต้อง");
  const d = parsed.data;

  const head = await prisma.salesOrder.findUnique({ where: { id: orderId } });
  if (!head || head.branchId !== branchId) return apiError(404, "ไม่พบออเดอร์");

  // discount / service-charge override needs permission (applied atomically below)
  const wantsDiscount = d.discount != null && d.discount !== head.discount;
  const wantsWaiveSvc = d.noServiceCharge != null && d.noServiceCharge !== head.noServiceCharge;
  if ((wantsDiscount || wantsWaiveSvc) && !hasPermission(user.permissions, PERMISSIONS.DISCOUNT_OVERRIDE))
    return apiError(403, "ไม่มีสิทธิ์ปรับส่วนลด/ค่าบริการ");

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) return apiError(500, "ไม่พบข้อมูลสาขา");

  const result = await prisma
    .$transaction(async (tx) => {
      // atomically CLAIM the order: only one tx can flip an open order to PAID.
      // Works under any isolation level (SQLite + Postgres) - no lost-update race.
      const claim = await tx.salesOrder.updateMany({
        where: { id: orderId, status: { notIn: ["PAID", "VOID", "CLOSED", "REFUNDED"] } },
        data: { status: "PAID" },
      });
      if (claim.count === 0) throw new Error("ALREADY_CLOSED");

      const cur = await tx.salesOrder.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!cur) throw new Error("NOT_FOUND");
      if (cur.items.filter((i) => i.status !== "VOID").length === 0) throw new Error("EMPTY");

      if (wantsDiscount) {
        // never exceed the subtotal still available after an already-redeemed points discount
        // (so redeemed points the bill can't credit aren't silently burned)
        const clamped = Math.min(d.discount!, round2(cur.subtotal - cur.pointsDiscount));
        await tx.salesOrder.update({ where: { id: orderId }, data: { discount: Math.max(0, clamped) } });
      }
      // waive service charge (same override permission as a discount)
      if (d.noServiceCharge != null && d.noServiceCharge !== cur.noServiceCharge)
        await tx.salesOrder.update({ where: { id: orderId }, data: { noServiceCharge: d.noServiceCharge } });

      const fresh = await recalcOrder(tx, orderId);
      const net = fresh!.netAmount;

      // a linked reservation's deposit is a prepayment: credit it once so the customer only owes
      // the remainder. Recorded as a DEPOSIT Payment with no shift (it didn't hit this drawer),
      // so Payment rows still sum to net but cash reconciliation is unaffected.
      let depositCredit = 0;
      if (cur.bookingId) {
        const already = await tx.payment.findFirst({ where: { method: "DEPOSIT", order: { bookingId: cur.bookingId } } });
        if (!already) {
          const bk = await tx.booking.findUnique({ where: { id: cur.bookingId }, select: { deposit: true } });
          depositCredit = round2(Math.min(bk?.deposit ?? 0, net));
        }
      }
      const due = round2(net - depositCredit);

      // tenders = cash/card/QR handed over (split = many). Cash uses `received`; non-cash pays exact.
      const tenders =
        d.payments && d.payments.length
          ? d.payments.map((p) => ({ method: p.method, tendered: round2(p.amount) }))
          : due > 0
            ? [{ method: d.method, tendered: d.method === "CASH" ? round2(d.received) : due }]
            : [];
      const received = round2(tenders.reduce((s, t) => s + t.tendered, 0));
      if (received < due) throw new Error("UNDERPAID");
      const change = round2(received - due);
      // change can only be returned as cash; card/QR must be exact (never overpay)
      const nonCash = round2(tenders.filter((t) => t.method !== "CASH").reduce((s, t) => s + t.tendered, 0));
      if (nonCash > due || (change > 0 && !tenders.some((t) => t.method === "CASH"))) throw new Error("OVERPAID");

      // allocate Payment.amount so the rows sum to net (the sale); cash absorbs the change.
      let cashToAllocate = round2(due - nonCash);
      let payment;
      // record the deposit prepayment first so `payment` is set even when the deposit covers the bill
      if (depositCredit > 0) {
        payment = await tx.payment.create({
          data: {
            docNo: await nextDocNo("RC", branch.code, tx),
            orderId, method: "DEPOSIT", amount: depositCredit, received: 0, change: 0,
            ref: "มัดจำการจอง", shiftId: null, createdBy: user.id,
          },
        });
      }
      for (const t of tenders) {
        let amount: number, chg: number;
        if (t.method === "CASH") {
          amount = round2(Math.min(t.tendered, cashToAllocate));
          cashToAllocate = round2(cashToAllocate - amount);
          chg = round2(t.tendered - amount);
        } else {
          amount = t.tendered;
          chg = 0;
        }
        const p = await tx.payment.create({
          data: {
            docNo: await nextDocNo("RC", branch.code, tx),
            orderId,
            method: t.method,
            amount,
            received: t.tendered,
            change: chg,
            ref: d.ref,
            shiftId: cur.shiftId,
            createdBy: user.id,
          },
        });
        if (!payment) payment = p;
      }

      // deduct ingredient stock per recipe (Post Stock Movement)
      await applyRecipeStock(tx, orderId, branchId, branch.code, user.id, "SALE_DEDUCT");

      await tx.salesOrder.update({
        where: { id: orderId },
        data: { status: "PAID", paidAt: new Date(), closedAt: new Date() },
      });

      if (cur.tableId)
        await tx.diningTable.update({ where: { id: cur.tableId }, data: { status: "AVAILABLE" } });

      // loyalty: base points x the member's tier multiplier, then re-evaluate the
      // tier against the new lifetime spend.
      if (cur.memberId) {
        const member = await tx.member.findUnique({ where: { id: cur.memberId } });
        if (member) {
          const tiers = await tx.memberTier.findMany({ where: { tenantId: member.tenantId ?? -1 } });
          // earn at the member's CURRENT tier (incl. a 0-baht base tier), then advance by the new spend
          const currentTier = tierForSpent(tiers, member.totalSpent);
          // earn on the pre-tax billable amount (subtotal minus discounts), not the tax/service-
          // inclusive net - otherwise points are inflated by ~VAT+service on every bill
          const afterDiscount = round2(fresh!.subtotal - fresh!.discount - fresh!.pointsDiscount);
          const earned = earnPoints(afterDiscount, currentTier?.pointMultiplier ?? 1);
          const newSpent = round2(member.totalSpent + net);
          const newTier = tierForSpent(tiers, newSpent);
          await tx.member.update({
            where: { id: cur.memberId },
            data: { points: { increment: earned }, totalSpent: newSpent, tierId: newTier?.id ?? null },
          });
          // record the actual points earned (tier multiplier applied) so a refund reverses the
          // exact amount instead of a flat netAmount/25 estimate
          await tx.salesOrder.update({ where: { id: orderId }, data: { pointsEarned: earned } });
        }
      }

      // promotion usage cap: this paid bill counts as one redemption. Enforce the cap atomically
      // inside the tx - a conditional updateMany guarded on usedCount < usageLimit so two
      // concurrent payments can't both consume the last allowed use.
      if (cur.promotionId) {
        const promo = await tx.promotion.findUnique({ where: { id: cur.promotionId } });
        if (promo) {
          if (promo.usageLimit != null) {
            const inc = await tx.promotion.updateMany({
              where: { id: promo.id, usedCount: { lt: promo.usageLimit } },
              data: { usedCount: { increment: 1 } },
            });
            if (inc.count === 0) throw new Error("PROMO_LIMIT");
          } else {
            await tx.promotion.update({ where: { id: promo.id }, data: { usedCount: { increment: 1 } } });
          }
        }
      }

      return { payment: payment!, net, change, received };
    })
    .catch((e) => {
      const m = e instanceof Error ? e.message : "";
      if (m in ERRORS) return m;
      throw e;
    });

  if (typeof result === "string") {
    const [code, msg] = ERRORS[result];
    return apiError(code, msg);
  }

  await writeAudit({
    userId: user.id, action: "payment", entity: "sales_order", entityId: orderId,
    after: { receipt: result.payment.docNo, method: d.method, net: result.net },
  });

  return Response.json({ ok: true, ...result });
}

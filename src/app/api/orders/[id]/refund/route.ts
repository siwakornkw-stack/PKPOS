import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { PERMISSIONS } from "@/lib/permissions";
import { applyRecipeStock } from "@/lib/orders";
import { nextDocNo } from "@/lib/docno";
import { round2 } from "@/lib/format";

const schema = z.object({ reason: z.string().optional() });

// Refund a PAID order: negative payment, restore stock, reverse loyalty,
// set status REFUNDED. Requires void/refund permission.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.ORDER_VOID);
  if (auth instanceof Response) return auth;
  if (!rateLimit(`refund:${auth.user.id}`, 100, 60_000)) return apiError(429, "ดำเนินการถี่เกินไป ลองใหม่อีกครั้ง");
  const orderId = Number((await params).id);

  const head = await prisma.salesOrder.findUnique({ where: { id: orderId } });
  if (!head || head.branchId !== auth.branchId) return apiError(404, "ไม่พบออเดอร์");

  const { reason } = schema.parse(await req.json().catch(() => ({})));
  const branch = await prisma.branch.findUnique({ where: { id: auth.branchId } });
  if (!branch) return apiError(500, "ไม่พบข้อมูลสาขา");

  const out = await prisma
    .$transaction(async (tx) => {
      // atomically claim: only a PAID order can be refunded, exactly once
      const claim = await tx.salesOrder.updateMany({
        where: { id: orderId, status: "PAID" },
        data: { status: "REFUNDED", note: reason ?? undefined },
      });
      if (claim.count === 0) throw new Error("NOT_PAID");

      const cur = await tx.salesOrder.findUnique({ where: { id: orderId } });
      if (!cur) throw new Error("NOT_FOUND");

      // The drawer that pays the refund is the CURRENT open shift, not the sale's shift
      // (which may be closed). Stamp refund payments to it so cash reconciles in the issuing shift.
      const curShift = await tx.shift.findFirst({
        where: { branchId: auth.branchId, userId: auth.user.id, status: "OPEN" },
        orderBy: { openedAt: "desc" },
      });
      const origPays = await tx.payment.findMany({ where: { orderId, amount: { gt: 0 } } });
      const cashPortion = round2(origPays.filter((p) => p.method === "CASH").reduce((s, p) => s + p.amount, 0));
      // a cash refund leaves the drawer of an OPEN shift - require one so the cash is reconciled
      if (cashPortion > 0 && !curShift) throw new Error("NO_SHIFT");

      // audit/reporting refund row (full net)
      await tx.payment.create({
        data: {
          docNo: await nextDocNo("RC", branch.code, tx),
          orderId,
          method: "REFUND",
          amount: -cur.netAmount,
          received: 0,
          change: 0,
          ref: reason,
          shiftId: curShift?.id,
          createdBy: auth.user.id,
        },
      });
      // cash actually paid out of the issuing shift's drawer (negative CASH tender)
      if (cashPortion > 0)
        await tx.payment.create({
          data: {
            docNo: await nextDocNo("RC", branch.code, tx),
            orderId,
            method: "CASH",
            amount: -cashPortion,
            received: 0,
            change: 0,
            ref: "refund",
            shiftId: curShift?.id,
            createdBy: auth.user.id,
          },
        });

      await applyRecipeStock(tx, orderId, auth.branchId, branch.code, auth.user.id, "REFUND_RETURN");

      if (cur.memberId) {
        const m = await tx.member.findUnique({ where: { id: cur.memberId }, select: { points: true, totalSpent: true } });
        if (m) {
          // reverse the points earned on this sale AND give back any points redeemed on it; clamp >= 0.
          // use the recorded pointsEarned (tier multiplier applied at sale) - the old netAmount/25
          // estimate ignored tier and left bonus points as an unintended gift.
          const earned = cur.pointsEarned;
          const finalPoints = Math.max(0, m.points + cur.pointsRedeemed - earned);
          await tx.member.update({
            where: { id: cur.memberId },
            data: { points: finalPoints, totalSpent: { decrement: round2(Math.min(m.totalSpent, cur.netAmount)) } },
          });
        }
      }

      await tx.salesOrder.update({
        where: { id: orderId },
        data: { status: "REFUNDED", note: reason ?? cur.note },
      });
      return { refunded: cur.netAmount };
    })
    .catch((e) => (e instanceof Error ? e.message : "ERR"));

  if (out === "NOT_FOUND") return apiError(404, "ไม่พบออเดอร์");
  if (out === "NOT_PAID") return apiError(409, "คืนเงินได้เฉพาะบิลที่ชำระแล้ว");
  if (out === "NO_SHIFT") return apiError(409, "กรุณาเปิดกะก่อนคืนเงินสด");
  if (typeof out === "string") throw new Error(out);

  await writeAudit({
    userId: auth.user.id, action: "refund", entity: "sales_order", entityId: orderId,
    after: { refunded: out.refunded, reason },
  });

  return Response.json({ ok: true, ...out });
}

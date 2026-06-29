import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({ reason: z.string().optional() });

// Void an entire order (Void/Refund - requires permission + confirm on client)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.ORDER_VOID);
  if (auth instanceof Response) return auth;
  const { user, branchId } = auth;
  if (!rateLimit(`void:${user.id}`, 100, 60_000)) return apiError(429, "ดำเนินการถี่เกินไป ลองใหม่อีกครั้ง");
  const orderId = Number((await params).id);

  const head = await prisma.salesOrder.findUnique({ where: { id: orderId } });
  if (!head || head.branchId !== branchId) return apiError(404, "ไม่พบออเดอร์");

  const { reason } = schema.parse(await req.json().catch(() => ({})));

  const out = await prisma
    .$transaction(async (tx) => {
      // atomically claim: only void an order that is still open (no race vs payment)
      const claim = await tx.salesOrder.updateMany({
        where: { id: orderId, status: { in: ["DRAFT", "SENT", "SERVED", "HELD"] } },
        data: { status: "VOID", note: reason ?? head.note, closedAt: new Date() },
      });
      if (claim.count === 0) throw new Error("CLOSED");

      const cur = await tx.salesOrder.findUnique({ where: { id: orderId } });
      if (!cur) throw new Error("NOT_FOUND");
      await tx.salesOrderItem.updateMany({ where: { orderId }, data: { status: "VOID" } });
      // points redeemed on this (unpaid) bill were burned up-front; give them back on void
      // (refund does the same for PAID orders) so a cancelled bill never eats a member's points.
      if (cur.memberId && cur.pointsRedeemed > 0)
        await tx.member.update({ where: { id: cur.memberId }, data: { points: { increment: cur.pointsRedeemed } } });
      if (cur.tableId)
        await tx.diningTable.update({ where: { id: cur.tableId }, data: { status: "AVAILABLE" } });
      return "ok" as const;
    })
    .catch((e) => (e instanceof Error ? e.message : "ERR"));

  if (out === "NOT_FOUND") return apiError(404, "ไม่พบออเดอร์");
  if (out === "CLOSED") return apiError(409, "ออเดอร์นี้ปิดแล้ว ไม่สามารถยกเลิกได้");

  await writeAudit({
    userId: user.id, action: "void_order", entity: "sales_order",
    entityId: orderId, before: { status: head.status }, after: { reason },
  });

  return Response.json({ ok: true });
}

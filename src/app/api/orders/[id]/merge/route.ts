import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { PERMISSIONS } from "@/lib/permissions";
import { recalcOrder } from "@/lib/orders";

const schema = z.object({ fromOrderId: z.number().int() });

// Merge: move all items from `fromOrderId` into this order, then void the source.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  if (!rateLimit(`merge:${auth.user.id}`, 100, 60_000)) return apiError(429, "ดำเนินการถี่เกินไป ลองใหม่อีกครั้ง");
  const targetId = Number((await params).id);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");
  const fromId = parsed.data.fromOrderId;
  if (fromId === targetId) return apiError(400, "เลือกบิลเดียวกันไม่ได้");

  const [target, from] = await Promise.all([
    prisma.salesOrder.findUnique({ where: { id: targetId } }),
    prisma.salesOrder.findUnique({ where: { id: fromId } }),
  ]);
  const open = ["DRAFT", "SENT", "SERVED"];
  if (!target || target.branchId !== auth.branchId || !open.includes(target.status))
    return apiError(404, "ไม่พบบิลปลายทางที่เปิดอยู่");
  if (!from || from.branchId !== auth.branchId || !open.includes(from.status))
    return apiError(404, "ไม่พบบิลต้นทางที่เปิดอยู่");
  // the source is VOIDed by merge and void never restores points, so redeemed points/reward
  // on it would be lost - require removing the redemption first.
  if (from.pointsRedeemed > 0 || from.rewardId)
    return apiError(409, "บิลต้นทางมีการแลกแต้ม/ของรางวัล - ยกเลิกการแลกก่อนรวมบิล");
  // don't silently re-attribute one member's items to a different member
  if (from.memberId && target.memberId && from.memberId !== target.memberId)
    return apiError(409, "บิลคนละสมาชิก - รวมบิลไม่ได้");

  const merged = await prisma.$transaction(async (tx) => {
    // atomically claim both orders so a concurrent /pay cannot settle either mid-merge
    const claimFrom = await tx.salesOrder.updateMany({ where: { id: fromId, status: { in: open } }, data: { status: from.status } });
    if (claimFrom.count === 0) throw new Error("CLOSED");
    const claimTarget = await tx.salesOrder.updateMany({ where: { id: targetId, status: { in: open } }, data: { status: target.status } });
    if (claimTarget.count === 0) throw new Error("CLOSED");

    await tx.salesOrderItem.updateMany({
      where: { orderId: fromId, status: { not: "VOID" } },
      data: { orderId: targetId },
    });
    // if only the source has a member, the merged bill inherits it (keeps loyalty on the kept bill)
    if (from.memberId && !target.memberId)
      await tx.salesOrder.update({ where: { id: targetId }, data: { memberId: from.memberId } });
    await tx.salesOrder.update({
      where: { id: fromId },
      data: { status: "VOID", note: `รวมเข้าบิล ${target.docNo}`, closedAt: new Date() },
    });
    if (from.tableId)
      await tx.diningTable.update({ where: { id: from.tableId }, data: { status: "AVAILABLE" } });
    await recalcOrder(tx, targetId);
    return true;
  }).catch((e) => {
    if (e instanceof Error && e.message === "CLOSED") return false;
    throw e;
  });
  if (!merged) return apiError(409, "บิลถูกแก้ไขโดยรายการอื่น กรุณาลองใหม่");

  await writeAudit({
    userId: auth.user.id, action: "merge_order", entity: "sales_order", entityId: targetId,
    after: { mergedFrom: fromId },
  });

  return Response.json({ ok: true });
}

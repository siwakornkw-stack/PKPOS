import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { PERMISSIONS } from "@/lib/permissions";
import { recalcOrder } from "@/lib/orders";
import { round2 } from "@/lib/format";

const schema = z.object({ rewardId: z.number().int() });
const OPEN = ["DRAFT", "SENT", "SERVED"];

// POST: redeem a catalog reward onto the order's member.
//  - DISCOUNT_AMOUNT: burn points -> add a baht discount (via pointsDiscount)
//  - FREE_ITEM: burn points -> add the menu item to the bill at zero net
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  if (!rateLimit(`reward:${auth.user.id}`, 100, 60_000)) return apiError(429, "ดำเนินการถี่เกินไป ลองใหม่อีกครั้ง");
  const orderId = Number((await params).id);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
  if (!order || order.branchId !== auth.branchId) return apiError(404, "ไม่พบออเดอร์");
  if (!OPEN.includes(order.status)) return apiError(409, "ออเดอร์นี้ปิดแล้ว");
  if (!order.memberId) return apiError(400, "ออเดอร์นี้ยังไม่มีสมาชิก");
  if (order.rewardId) return apiError(409, "บิลนี้ใช้ของรางวัลไปแล้ว");

  const reward = await prisma.reward.findUnique({ where: { id: parsed.data.rewardId } });
  if (!reward || reward.tenantId !== auth.user.tenantId || !reward.isActive) return apiError(404, "ไม่พบของรางวัล");

  let freeItemName: string | null = null;
  const out = await prisma
    .$transaction(async (tx) => {
      // burn the member's points (balance-guarded) - fails if insufficient
      const burn = await tx.member.updateMany({
        where: { id: order.memberId!, tenantId: auth.user.tenantId, points: { gte: reward.pointsCost } },
        data: { points: { decrement: reward.pointsCost } },
      });
      if (burn.count === 0) throw new Error("INSUFFICIENT");

      // claim the order still open (and tag the reward atomically so a 2nd redeem can't race in)
      const claim = await tx.salesOrder.updateMany({
        where: { id: orderId, status: { in: OPEN }, rewardId: null },
        data: { rewardId: reward.id, pointsRedeemed: { increment: reward.pointsCost } },
      });
      if (claim.count === 0) throw new Error("CLOSED");

      if (reward.type === "DISCOUNT_AMOUNT") {
        const offsettable = Math.max(0, round2(order.subtotal - order.discount - order.pointsDiscount));
        const applied = Math.min(reward.value, offsettable);
        await tx.salesOrder.update({ where: { id: orderId }, data: { pointsDiscount: { increment: applied } } });
      } else {
        // FREE_ITEM: add the menu item at full price fully discounted (net 0); kitchen still makes it
        const mi = await tx.menuItem.findFirst({ where: { id: reward.menuItemId!, branchId: auth.branchId } });
        if (!mi) throw new Error("NO_ITEM");
        const channelPrice = await tx.menuPrice.findUnique({ where: { menuItemId_channel: { menuItemId: mi.id, channel: order.orderType } } });
        const unit = round2(channelPrice?.price ?? mi.price);
        await tx.salesOrderItem.create({
          data: {
            orderId, menuItemId: mi.id, name: `${mi.name} (ของรางวัล)`,
            qty: 1, unitPrice: unit, discount: unit, lineAmount: 0, status: "PENDING",
          },
        });
        freeItemName = mi.name;
      }
      await recalcOrder(tx, orderId);
      return true;
    })
    .catch((e) => (e instanceof Error ? e.message : "ERR"));

  if (out === "INSUFFICIENT") return apiError(400, "แต้มไม่เพียงพอ");
  if (out === "CLOSED") return apiError(409, "ออเดอร์นี้ปิดแล้ว");
  if (out === "NO_ITEM") return apiError(400, "ไม่พบเมนูของรางวัล");
  if (out !== true) return apiError(500, "แลกของรางวัลไม่สำเร็จ");

  await writeAudit({ userId: auth.user.id, action: "redeem_reward", entity: "sales_order", entityId: orderId, after: { rewardId: reward.id, points: reward.pointsCost } });
  const updated = await prisma.salesOrder.findUnique({ where: { id: orderId }, select: { netAmount: true, pointsDiscount: true } });
  return Response.json({ ok: true, reward: reward.name, freeItem: freeItemName, ...updated });
}

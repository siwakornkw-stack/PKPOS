import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { PERMISSIONS } from "@/lib/permissions";
import { recalcOrder } from "@/lib/orders";
import { round2 } from "@/lib/format";

const schema = z.object({ points: z.number().int().positive() });
const OPEN = ["DRAFT", "SENT", "SERVED"];

// POST: redeem the order member's loyalty points as a baht discount (1 point = 1 baht).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  if (!rateLimit(`redeem:${auth.user.id}`, 100, 60_000)) return apiError(429, "ดำเนินการถี่เกินไป ลองใหม่อีกครั้ง");
  const orderId = Number((await params).id);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "จำนวนแต้มไม่ถูกต้อง");

  const order = await prisma.salesOrder.findUnique({
    where: { id: orderId },
    select: { branchId: true, status: true, memberId: true, subtotal: true, discount: true, pointsDiscount: true },
  });
  if (!order || order.branchId !== auth.branchId) return apiError(404, "ไม่พบออเดอร์");
  if (!OPEN.includes(order.status)) return apiError(409, "ออเดอร์นี้ปิดแล้ว");
  if (!order.memberId) return apiError(400, "ออเดอร์นี้ยังไม่มีสมาชิก");

  // cap to the amount points can still offset on this bill (1 point = 1 baht)
  const offsettable = Math.floor(Math.max(0, round2(order.subtotal - order.discount - order.pointsDiscount)));
  const redeem = Math.min(parsed.data.points, offsettable);
  if (redeem <= 0) return apiError(400, "ยอดบิลนี้ไม่มีส่วนให้ใช้แต้มแล้ว");

  const ok = await prisma.$transaction(async (tx) => {
    // optimistic claim: order still open AND pointsDiscount unchanged since we computed `redeem`.
    // Folding the pointsDiscount increment into the guarded claim serializes concurrent redeems on
    // the same bill, so a member's points can't be double-burned by two simultaneous requests.
    const claimO = await tx.salesOrder.updateMany({
      where: { id: orderId, status: { in: OPEN }, pointsDiscount: order.pointsDiscount },
      data: { pointsRedeemed: { increment: redeem }, pointsDiscount: { increment: redeem } },
    });
    if (claimO.count === 0) throw new Error("CONFLICT");
    const claimM = await tx.member.updateMany({
      where: { id: order.memberId!, tenantId: auth.user.tenantId, points: { gte: redeem } },
      data: { points: { decrement: redeem } },
    });
    if (claimM.count === 0) throw new Error("INSUFFICIENT");
    await recalcOrder(tx, orderId);
    return true;
  }).catch((e) => {
    if (e instanceof Error && (e.message === "CONFLICT" || e.message === "INSUFFICIENT")) return e.message;
    throw e;
  });
  if (ok === "CONFLICT") return apiError(409, "ออเดอร์ถูกแก้ไข กรุณาลองใหม่");
  if (ok === "INSUFFICIENT") return apiError(400, "แต้มไม่เพียงพอ");

  await writeAudit({ userId: auth.user.id, action: "redeem_points_order", entity: "sales_order", entityId: orderId, after: { points: redeem } });
  const updated = await prisma.salesOrder.findUnique({ where: { id: orderId }, select: { pointsRedeemed: true, pointsDiscount: true, netAmount: true } });
  return Response.json({ ok: true, redeemed: redeem, ...updated });
}

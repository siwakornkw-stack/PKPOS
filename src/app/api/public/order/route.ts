import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, writeAudit } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { resolveOrderItems, recalcOrder } from "@/lib/orders";
import { computeTotals, lineAmount } from "@/lib/totals";
import { nextDocNo } from "@/lib/docno";
import { isBlocked } from "@/lib/plans";

const schema = z.object({
  token: z.string().min(1),
  // bound the unauth payload: qty/array/note caps prevent order-injection + DB bloat
  items: z.array(z.object({
    menuItemId: z.number().int(),
    qty: z.number().int().min(1).max(99),
    note: z.string().max(200).optional(),
  })).min(1).max(50),
});

// PUBLIC (no auth): customer submits a QR self-order. Creates or appends a
// SENT order on the table. No payment/void here - staff close it at the POS.
export async function POST(req: NextRequest) {
  if (!rateLimit(`puborder:${clientIp(req.headers)}`, 20, 60_000))
    return apiError(429, "requests too frequent");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");
  const { token, items } = parsed.data;

  const table = await prisma.diningTable.findUnique({
    where: { qrToken: token },
    include: { branch: { include: { tenant: { select: { status: true, trialEndsAt: true } } } } },
  });
  if (!table) return apiError(404, "ไม่พบโต๊ะ");
  // suspended/expired tenant: stop serving the public QR channel too (mirror requireBranch)
  if (isBlocked(table.branch.tenant, new Date())) return apiError(403, "ร้านนี้ปิดให้บริการชั่วคราว");
  if (!table.branch.isActive) return apiError(403, "สาขานี้ปิดให้บริการ");
  const branchId = table.branchId;
  const recorder = await prisma.user.findFirst({ where: { branchId }, orderBy: { id: "asc" } });
  if (!recorder) return apiError(500, "ไม่พบผู้ใช้สาขา");

  let resolved;
  try {
    resolved = await resolveOrderItems(prisma, branchId, "DINE_IN", items);
  } catch {
    return apiError(400, "มีเมนูที่ไม่พบ");
  }

  // Serialize find-or-create per table with a transaction-scoped advisory lock so two phones
  // scanning the same empty table don't each create a separate open order (duplicate/split bill).
  // Single-arg bigint form (the two-arg one needs int4 casts Prisma won't emit); namespaced so
  // the key can't collide with any other advisory lock.
  const lockKey = 474700000000 + table.id;
  const totals = computeTotals(resolved, "DINE_IN", 0, { taxRate: table.branch.taxRate, serviceRate: table.branch.serviceRate });
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
    const open = await tx.salesOrder.findFirst({
      where: { branchId, tableId: table.id, status: { in: ["DRAFT", "SENT", "SERVED"] } },
      orderBy: { createdAt: "desc" },
    });
    if (open) {
      // a concurrent /pay (which doesn't take this lock) could still settle it - re-claim to be safe
      const claim = await tx.salesOrder.updateMany({
        where: { id: open.id, status: { in: ["DRAFT", "SENT", "SERVED"] } },
        data: { status: open.status },
      });
      if (claim.count === 0) throw new Error("CLOSED");
      for (const i of resolved)
        await tx.salesOrderItem.create({
          data: {
            orderId: open.id, menuItemId: i.menuItemId, name: i.name, qty: i.qty,
            unitPrice: i.unitPrice, discount: 0, lineAmount: lineAmount(i), status: "PENDING", note: i.note,
            options: { create: i.optionRows.map((o) => ({ name: o.name, priceDelta: o.priceDelta })) },
          },
        });
      await recalcOrder(tx, open.id);
      return open.id;
    }
    const o = await tx.salesOrder.create({
      data: {
        docNo: await nextDocNo("SO", table.branch.code, tx),
        branchId, orderType: "DINE_IN", source: "QR", tableId: table.id, guestCount: 1,
        userId: recorder.id, status: "SENT", note: "QR self-order", ...totals,
        items: {
          create: resolved.map((i) => ({
            menuItemId: i.menuItemId, name: i.name, qty: i.qty, unitPrice: i.unitPrice,
            discount: 0, lineAmount: lineAmount(i), status: "PENDING", note: i.note,
            options: { create: i.optionRows.map((o) => ({ name: o.name, priceDelta: o.priceDelta })) },
          })),
        },
      },
    });
    await tx.diningTable.update({ where: { id: table.id }, data: { status: "OCCUPIED" } });
    return o.id;
  }).catch((e) => {
    if (e instanceof Error && e.message === "CLOSED") return null;
    throw e;
  });
  if (result == null) return apiError(409, "ออเดอร์ปิดแล้ว");
  const orderId = result;

  await writeAudit({ userId: recorder.id, action: "self_order", entity: "sales_order", entityId: orderId });
  return Response.json({ ok: true });
}

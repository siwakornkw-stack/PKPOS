import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { resolveOrderItems } from "@/lib/orders";
import { computeTotals, lineAmount } from "@/lib/totals";
import { nextDocNo, nextQueueNo } from "@/lib/docno";

// GET: list orders (filters: status, tableId)
export async function GET(req: NextRequest) {
  const auth = await requireBranch(); // concrete branch (never list across branches via a null filter)
  if (auth instanceof Response) return auth;
  const { branchId } = auth;
  const sp = req.nextUrl.searchParams;

  const status = sp.get("status");
  const tableId = sp.get("tableId");

  const orders = await prisma.salesOrder.findMany({
    where: {
      branchId,
      ...(status ? { status: { in: status.split(",") } } : {}),
      ...(tableId ? { tableId: Number(tableId) } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { items: true, table: true, member: true },
  });
  return Response.json({ orders });
}

const createSchema = z.object({
  orderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]),
  idempotencyKey: z.string().optional(), // offline-queue dedup
  tableId: z.number().int().nullable().optional(),
  guestCount: z.number().int().min(1).default(1),
  memberId: z.number().int().nullable().optional(),
  note: z.string().optional(),
  discount: z.number().nonnegative().default(0),
  send: z.boolean().default(true),
  items: z
    .array(
      z.object({
        menuItemId: z.number().int(),
        qty: z.number().int().min(1),
        options: z.array(z.number().int()).optional(),
        note: z.string().optional(),
        discount: z.number().nonnegative().default(0),
        unitPrice: z.number().positive().max(999999).optional(), // open-price items only
      })
    )
    .min(1),
});

// POST: create a new order from the POS cart
export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  const { user, branchId } = auth;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลออเดอร์ไม่ถูกต้อง", parsed.error.flatten());
  const d = parsed.data;

  // idempotency: if this offline-queued order was already synced, return it.
  // Scope by branch so a (globally-unique) key cannot disclose another tenant's order.
  if (d.idempotencyKey) {
    const dup = await prisma.salesOrder.findFirst({
      where: { idempotencyKey: d.idempotencyKey, branchId },
      include: { items: true, table: true },
    });
    if (dup) return Response.json({ order: dup, deduped: true });
  }

  let bookingId: number | null = null;
  if (d.tableId != null) {
    const table = await prisma.diningTable.findFirst({ where: { id: d.tableId, branchId } });
    if (!table) return apiError(400, "ไม่พบโต๊ะที่เลือก");
    // link an active reservation for this table so its deposit credits this bill at payment
    const bk = await prisma.booking.findFirst({
      where: { branchId, tableId: d.tableId, status: { in: ["BOOKED", "ARRIVED"] } },
      orderBy: { bookingTime: "asc" },
      select: { id: true },
    });
    bookingId = bk?.id ?? null;
  }
  // a supplied memberId must belong to the caller's tenant (else paying corrupts a foreign member's points)
  if (d.memberId != null) {
    const mem = await prisma.member.findUnique({ where: { id: d.memberId }, select: { tenantId: true } });
    if (!mem || mem.tenantId !== user.tenantId) return apiError(400, "ไม่พบสมาชิก");
  }

  // snapshot prices/names from current menu (server is source of truth):
  // applies per-channel price + validated modifier options
  let itemInputs;
  try {
    itemInputs = await resolveOrderItems(prisma, branchId, d.orderType, d.items);
  } catch {
    return apiError(400, "มีเมนูที่ไม่พบในระบบ");
  }
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) return apiError(500, "ไม่พบข้อมูลสาขา");

  const totals = computeTotals(itemInputs, d.orderType, d.discount, {
    taxRate: branch.taxRate,
    serviceRate: branch.serviceRate,
  });

  // find current open shift for this user (optional)
  const shift = await prisma.shift.findFirst({
    where: { branchId, userId: user.id, status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });

  // create order + occupy table atomically
  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      // takeaway/delivery get a daily running queue number (dine-in uses the table)
      const queueNo = d.orderType === "DINE_IN" ? null : await nextQueueNo(branch.code, tx);
      const created = await tx.salesOrder.create({
        data: {
          docNo: await nextDocNo("SO", branch.code, tx),
          idempotencyKey: d.idempotencyKey ?? null,
          branchId,
          orderType: d.orderType,
          tableId: d.tableId ?? null,
          bookingId,
          guestCount: d.guestCount,
          memberId: d.memberId ?? null,
          note: d.note,
          queueNo,
          userId: user.id,
          shiftId: shift?.id ?? null,
          status: d.send ? "SENT" : "DRAFT",
          ...totals,
          items: {
            create: itemInputs.map((i) => ({
              menuItemId: i.menuItemId,
              name: i.name,
              qty: i.qty,
              unitPrice: i.unitPrice,
              discount: i.discount,
              lineAmount: lineAmount(i),
              status: "PENDING",
              note: i.note,
              options: { create: i.optionRows.map((o) => ({ name: o.name, priceDelta: o.priceDelta })) },
            })),
          },
        },
        include: { items: true, table: true },
      });
      if (d.tableId) {
        // claim the table: a walk-in may take a free table; a reserved table only when we link that booking
        const allowed = bookingId ? ["AVAILABLE", "RESERVED"] : ["AVAILABLE"];
        const claim = await tx.diningTable.updateMany({
          where: { id: d.tableId, branchId, status: { in: allowed } },
          data: { status: "OCCUPIED" },
        });
        if (claim.count === 0) throw new Error("TABLE_TAKEN");
      }
      return created;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "TABLE_TAKEN") return apiError(409, "โต๊ะไม่ว่าง (มีบิลเปิดอยู่ หรือถูกจอง)");
    throw e;
  }

  await writeAudit({
    userId: user.id, action: "create_order", entity: "sales_order",
    entityId: order.id, after: { docNo: order.docNo, net: totals.netAmount },
  });

  return Response.json({ order });
}

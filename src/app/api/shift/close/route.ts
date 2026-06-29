import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { round2 } from "@/lib/format";

const schema = z.object({ closingCash: z.number().nonnegative() });

// POST: close the user's open shift, reconcile cash (expected vs counted)
export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.SHIFT_CLOSE);
  if (auth instanceof Response) return auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "กรุณากรอกยอดเงินที่นับได้");

  const shift = await prisma.shift.findFirst({
    where: { branchId: auth.branchId, userId: auth.user.id, status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });
  if (!shift) return apiError(404, "ไม่พบกะที่เปิดอยู่");

  // block close while there are unresolved (unpaid) orders in this shift - incl. HELD (parked)
  const open = await prisma.salesOrder.count({
    where: { shiftId: shift.id, status: { in: ["DRAFT", "SENT", "SERVED", "HELD"] } },
  });
  if (open > 0) return apiError(409, `ยังมี ${open} ออเดอร์ที่ยังไม่ปิด ปิดกะไม่ได้`);

  const paid = await prisma.salesOrder.findMany({
    where: { shiftId: shift.id, status: "PAID" },
    select: { netAmount: true },
  });
  // drawer cash = cash payments stamped to this shift (includes negative cash refunds issued here)
  const cashPays = await prisma.payment.findMany({ where: { shiftId: shift.id, method: "CASH" }, select: { amount: true } });
  const cashSales = round2(cashPays.reduce((s, p) => s + p.amount, 0));
  // petty cash in/out recorded this shift
  const moves = await prisma.cashMovement.findMany({ where: { shiftId: shift.id }, select: { type: true, amount: true } });
  const cashIn = round2(moves.filter((m) => m.type === "PAID_IN").reduce((s, m) => s + m.amount, 0));
  const cashOut = round2(moves.filter((m) => m.type === "PAID_OUT").reduce((s, m) => s + m.amount, 0));
  const expectedCash = round2(shift.openingCash + cashSales + cashIn - cashOut);
  const variance = round2(parsed.data.closingCash - expectedCash);

  const closed = await prisma.shift.update({
    where: { id: shift.id },
    data: {
      closingCash: parsed.data.closingCash,
      expectedCash,
      status: "CLOSED",
      closedAt: new Date(),
    },
  });
  await writeAudit({
    userId: auth.user.id, action: "close_shift", entity: "shift", entityId: shift.id,
    after: { expectedCash, closingCash: parsed.data.closingCash, variance },
  });

  return Response.json({
    shift: closed,
    cashSales, cashIn, cashOut, expectedCash, variance,
    totalSales: round2(paid.reduce((s, o) => s + o.netAmount, 0)),
    orderCount: paid.length,
  });
}

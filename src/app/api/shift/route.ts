import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { round2 } from "@/lib/format";

// summary of cash for an open shift. Sales are attributed to the order's shift; drawer cash
// is summed from payments stamped to THIS shift (so a cash refund issued here counts as cash out,
// and a refund of a sale from a prior closed shift no longer creates a phantom shortage).
async function shiftSummary(shiftId: number) {
  const orders = await prisma.salesOrder.findMany({
    where: { shiftId, status: "PAID" },
    select: { netAmount: true },
  });
  const totalSales = round2(orders.reduce((s, o) => s + o.netAmount, 0));
  const cashPays = await prisma.payment.findMany({ where: { shiftId, method: "CASH" }, select: { amount: true } });
  const cashSales = round2(cashPays.reduce((s, p) => s + p.amount, 0));
  // non-sale drawer movements (petty cash in/out)
  const moves = await prisma.cashMovement.findMany({ where: { shiftId }, select: { type: true, amount: true } });
  const cashIn = round2(moves.filter((m) => m.type === "PAID_IN").reduce((s, m) => s + m.amount, 0));
  const cashOut = round2(moves.filter((m) => m.type === "PAID_OUT").reduce((s, m) => s + m.amount, 0));
  return { orderCount: orders.length, totalSales, cashSales, cashIn, cashOut };
}

// GET: current open shift for this user (+ cash summary)
export async function GET() {
  const auth = await requireBranch();
  if (auth instanceof Response) return auth;

  const shift = await prisma.shift.findFirst({
    where: { branchId: auth.branchId, userId: auth.user.id, status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });
  if (!shift) return Response.json({ shift: null, summary: null });

  const summary = await shiftSummary(shift.id);
  return Response.json({
    shift,
    summary: { ...summary, expectedCash: round2(shift.openingCash + summary.cashSales + summary.cashIn - summary.cashOut) },
  });
}

const openSchema = z.object({ openingCash: z.number().nonnegative().default(0) });

// POST: open a shift
export async function POST(req: NextRequest) {
  const auth = await requireBranch();
  if (auth instanceof Response) return auth;

  const existing = await prisma.shift.findFirst({
    where: { branchId: auth.branchId, userId: auth.user.id, status: "OPEN" },
  });
  if (existing) return apiError(409, "มีกะที่เปิดอยู่แล้ว");

  const parsed = openSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  const shift = await prisma.shift.create({
    data: { branchId: auth.branchId, userId: auth.user.id, openingCash: parsed.data.openingCash },
  });
  await writeAudit({ userId: auth.user.id, action: "open_shift", entity: "shift", entityId: shift.id });
  return Response.json({ shift });
}

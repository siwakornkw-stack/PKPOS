import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { round2, ymd, bizDayStart, bizHour } from "@/lib/format";

// Daily X/Z report: end-of-day sales summary for the branch.
export async function GET(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.REPORT_EXPORT);
  if (auth instanceof Response) return auth;

  const dateStr = req.nextUrl.searchParams.get("date");
  const base = dateStr ? new Date(dateStr) : new Date();
  const start = bizDayStart(base); // Bangkok midnight (UTC instant)
  const end = new Date(start.getTime() + 86400000);

  const orders = await prisma.salesOrder.findMany({
    where: { branchId: auth.branchId, status: { in: ["PAID", "VOID", "REFUNDED"] }, createdAt: { gte: start, lt: end } },
    include: {
      payments: true,
      items: { include: { menuItem: { select: { cost: true, category: { select: { name: true } } } } } },
      user: { select: { fullName: true } },
    },
  });

  const paid = orders.filter((o) => o.status === "PAID");
  const refunded = orders.filter((o) => o.status === "REFUNDED");

  const sum = (f: (o: (typeof paid)[number]) => number) => round2(paid.reduce((s, o) => s + f(o), 0));
  const grossSales = sum((o) => o.subtotal);
  const netSales = sum((o) => o.netAmount);

  const payMap = new Map<string, number>();
  for (const o of paid) for (const p of o.payments) payMap.set(p.method, (payMap.get(p.method) ?? 0) + p.amount);

  const catMap = new Map<string, number>();
  let cost = 0;
  for (const o of paid)
    for (const it of o.items)
      if (it.status !== "VOID") {
        catMap.set(it.menuItem.category.name, (catMap.get(it.menuItem.category.name) ?? 0) + it.lineAmount);
        cost += it.qty * it.menuItem.cost;
      }

  const byHour = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    total: round2(paid.filter((o) => bizHour(o.paidAt ?? o.createdAt) === h).reduce((s, o) => s + o.netAmount, 0)),
  }));

  const cashierMap = new Map<string, { orderCount: number; net: number }>();
  for (const o of paid) {
    const c = cashierMap.get(o.user.fullName) ?? { orderCount: 0, net: 0 };
    c.orderCount++; c.net += o.netAmount;
    cashierMap.set(o.user.fullName, c);
  }

  return Response.json({
    date: ymd(start),
    summary: {
      orderCount: paid.length,
      grossSales,
      discount: sum((o) => o.discount),
      serviceCharge: sum((o) => o.serviceCharge),
      tax: sum((o) => o.taxAmount),
      netSales,
      cost: round2(cost),
      grossProfit: round2(grossSales - cost),
      voidCount: orders.filter((o) => o.status === "VOID").length,
      refundCount: refunded.length,
      refundAmount: round2(refunded.reduce((s, o) => s + o.netAmount, 0)),
    },
    byPayment: [...payMap.entries()].map(([method, amount]) => ({ method, amount: round2(amount) })),
    byCategory: [...catMap.entries()].map(([name, amount]) => ({ name, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
    byHour,
    byCashier: [...cashierMap.entries()].map(([name, v]) => ({ name, orderCount: v.orderCount, net: round2(v.net) })),
  });
}

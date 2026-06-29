import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { round2, ymd, bizDayStart, bizHour } from "@/lib/format";

export async function GET(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.REPORT_EXPORT);
  if (auth instanceof Response) return auth;
  const { branchId } = auth; // concrete branch - never leak sales across branches via a null filter
  const sp = req.nextUrl.searchParams;

  const to = sp.get("to") ? new Date(sp.get("to")!) : new Date();
  const from = sp.get("from")
    ? new Date(sp.get("from")!)
    : new Date(to.getTime() - 29 * 86400000);
  const toEnd = new Date(bizDayStart(to).getTime() + 86400000); // end of `to` day (Bangkok), exclusive
  const fromStart = bizDayStart(from); // start of `from` day (Bangkok)

  const orders = await prisma.salesOrder.findMany({
    where: {
      branchId,
      status: { in: ["PAID", "VOID", "REFUNDED"] },
      createdAt: { gte: fromStart, lt: toEnd },
    },
    include: {
      items: { include: { menuItem: { select: { cost: true } } } },
      payments: true,
      table: true,
      user: { select: { fullName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const paid = orders.filter((o) => o.status === "PAID");
  const voided = orders.filter((o) => o.status === "VOID");
  const refunded = orders.filter((o) => o.status === "REFUNDED");

  const grossSales = round2(paid.reduce((s, o) => s + o.subtotal, 0));
  const discount = round2(paid.reduce((s, o) => s + o.discount, 0));
  const serviceCharge = round2(paid.reduce((s, o) => s + o.serviceCharge, 0));
  const tax = round2(paid.reduce((s, o) => s + o.taxAmount, 0));
  const netSales = round2(paid.reduce((s, o) => s + o.netAmount, 0));

  // daily
  const dayMap = new Map<string, number>();
  for (const o of paid) {
    const k = ymd(o.paidAt ?? o.createdAt);
    dayMap.set(k, (dayMap.get(k) ?? 0) + o.netAmount);
  }
  const daily = [...dayMap.entries()]
    .map(([day, total]) => ({ day, total: round2(total) }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // by menu
  const menuMap = new Map<string, { qty: number; amount: number }>();
  for (const o of paid)
    for (const it of o.items)
      if (it.status !== "VOID") {
        const m = menuMap.get(it.name) ?? { qty: 0, amount: 0 };
        m.qty += it.qty;
        m.amount += it.lineAmount;
        menuMap.set(it.name, m);
      }
  const byMenu = [...menuMap.entries()]
    .map(([name, v]) => ({ name, qty: v.qty, amount: round2(v.amount) }))
    .sort((a, b) => b.amount - a.amount);

  // by payment
  const payMap = new Map<string, number>();
  for (const o of paid)
    for (const p of o.payments)
      payMap.set(p.method, (payMap.get(p.method) ?? 0) + p.amount);
  const byPayment = [...payMap.entries()].map(([method, amount]) => ({
    method,
    amount: round2(amount),
  }));

  // gross profit: revenue (non-void item lineAmount) - cost (qty * menuItem.cost)
  let revenue = 0;
  let cost = 0;
  for (const o of paid)
    for (const it of o.items)
      if (it.status !== "VOID") {
        revenue += it.lineAmount;
        cost += it.qty * (it.menuItem?.cost ?? 0);
      }
  revenue = round2(revenue);
  cost = round2(cost);
  const grossProfit = round2(revenue - cost);
  const grossProfitObj = {
    revenue,
    cost,
    grossProfit,
    marginPct: revenue ? round2((grossProfit / revenue) * 100) : 0,
  };

  // by cashier
  const cashierMap = new Map<string, { orderCount: number; net: number }>();
  for (const o of paid) {
    const name = o.user.fullName;
    const c = cashierMap.get(name) ?? { orderCount: 0, net: 0 };
    c.orderCount += 1;
    c.net += o.netAmount;
    cashierMap.set(name, c);
  }
  const byCashier = [...cashierMap.entries()]
    .map(([name, v]) => ({ name, orderCount: v.orderCount, net: round2(v.net) }))
    .sort((a, b) => b.net - a.net);

  // by hour (0-23)
  const hourTotals = new Array(24).fill(0);
  for (const o of paid) {
    const h = bizHour(o.paidAt ?? o.createdAt);
    hourTotals[h] += o.netAmount;
  }
  const byHour = hourTotals.map((total, hour) => ({ hour, total: round2(total) }));

  // refunds
  const refunds = {
    count: refunded.length,
    amount: round2(refunded.reduce((s, o) => s + o.netAmount, 0)),
  };

  return Response.json({
    range: { from: fromStart.toISOString(), to: toEnd.toISOString() },
    summary: {
      orderCount: paid.length,
      voidCount: voided.length,
      grossSales,
      discount,
      serviceCharge,
      tax,
      netSales,
      avgBill: paid.length ? round2(netSales / paid.length) : 0,
    },
    daily,
    byMenu,
    byPayment,
    grossProfit: grossProfitObj,
    byCashier,
    byHour,
    refunds,
    orders: orders.slice(0, 50).map((o) => ({
      id: o.id,
      docNo: o.docNo,
      createdAt: o.createdAt,
      type: o.orderType,
      table: o.table?.code ?? "-",
      cashier: o.user.fullName,
      net: o.netAmount,
      status: o.status,
    })),
  });
}

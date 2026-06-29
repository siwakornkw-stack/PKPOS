import { prisma } from "@/lib/db";
import { requireBranch } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { round2, ymd, bizDayStart, bizWeekdayShort } from "@/lib/format";

export async function GET() {
  const auth = await requireBranch(PERMISSIONS.DASHBOARD_VIEW);
  if (auth instanceof Response) return auth;
  const { branchId } = auth; // concrete branch - never leak metrics across branches via a null filter

  const now = new Date();
  const startToday = bizDayStart(now); // Bangkok midnight as a UTC instant
  const start7 = new Date(startToday.getTime() - 6 * 86400000);

  const paid7 = await prisma.salesOrder.findMany({
    where: { branchId, status: "PAID", paidAt: { gte: start7 } },
    include: { items: true, payments: true },
  });

  const paidToday = paid7.filter((o) => o.paidAt && o.paidAt >= startToday);
  const todaySales = round2(paidToday.reduce((s, o) => s + o.netAmount, 0));
  const orderCount = paidToday.length;
  const avgBill = orderCount ? round2(todaySales / orderCount) : 0;

  // sales last 7 days
  const days: { day: string; label: string; total: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start7.getTime() + i * 86400000);
    const next = new Date(d.getTime() + 86400000);
    const total = paid7
      .filter((o) => o.paidAt && o.paidAt >= d && o.paidAt < next)
      .reduce((s, o) => s + o.netAmount, 0);
    days.push({
      day: ymd(d),
      label: bizWeekdayShort(d),
      total: round2(total),
    });
  }

  // top menu by qty (last 7 days)
  const menuQty = new Map<string, number>();
  for (const o of paid7)
    for (const it of o.items)
      if (it.status !== "VOID")
        menuQty.set(it.name, (menuQty.get(it.name) ?? 0) + it.qty);
  const topMenu = [...menuQty.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  // payment mix (today)
  const payMix = new Map<string, number>();
  for (const o of paidToday)
    for (const p of o.payments)
      payMix.set(p.method, (payMix.get(p.method) ?? 0) + p.amount);
  const paymentMix = [...payMix.entries()].map(([method, amount]) => ({
    method,
    amount: round2(amount),
  }));

  // low stock
  const ingredients = await prisma.ingredient.findMany({
    where: { branchId, isActive: true },
  });
  const lowStock = ingredients
    .filter((i) => i.stockQty <= i.reorderLevel)
    .map((i) => ({ name: i.name, stockQty: i.stockQty, unit: i.unit, reorderLevel: i.reorderLevel }));

  const openTables = await prisma.diningTable.count({
    where: { branchId, status: { in: ["OCCUPIED", "BILL"] } },
  });

  return Response.json({
    kpis: { todaySales, orderCount, avgBill, lowStockCount: lowStock.length, openTables },
    days,
    topMenu,
    paymentMix,
    lowStock,
  });
}

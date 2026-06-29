import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { isBlocked } from "@/lib/plans";

// PUBLIC (no auth): menu for a table's QR self-order page. Resolved by qrToken.
export async function GET(req: NextRequest) {
  if (!rateLimit(`pubmenu:${clientIp(req.headers)}`, 60, 60_000))
    return apiError(429, "requests too frequent");

  const token = req.nextUrl.searchParams.get("token");
  if (!token) return apiError(400, "missing token");

  const table = await prisma.diningTable.findUnique({
    where: { qrToken: token },
    include: { branch: { select: { id: true, name: true, isActive: true, taxRate: true, serviceRate: true, tenant: { select: { status: true, trialEndsAt: true } } } } },
  });
  if (!table) return apiError(404, "ไม่พบโต๊ะ");
  if (isBlocked(table.branch.tenant, new Date())) return apiError(403, "ร้านนี้ปิดให้บริการชั่วคราว");
  if (!table.branch.isActive) return apiError(403, "สาขานี้ปิดให้บริการ");

  const categories = await prisma.menuCategory.findMany({
    where: { branchId: table.branchId, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        // open-price items can't be self-ordered (customer can't set the price)
        where: { isActive: true, isAvailable: true, isOpenPrice: false },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, price: true, isCombo: true },
      },
    },
  });

  return Response.json({
    table: { code: table.code },
    branch: { name: table.branch.name },
    categories,
  });
}

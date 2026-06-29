import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, apiError } from "@/lib/api";

// GET ?code=... : resolve a scanned barcode to a sellable menu item (POS scan-to-cart).
export async function GET(req: NextRequest) {
  const auth = await requireBranch();
  if (auth instanceof Response) return auth;
  const code = req.nextUrl.searchParams.get("code")?.trim();
  if (!code) return apiError(400, "ไม่มีบาร์โค้ด");

  const item = await prisma.menuItem.findFirst({
    where: { branchId: auth.branchId, barcode: code, isActive: true },
    include: {
      prices: true,
      optionGroups: { include: { group: { include: { options: { orderBy: { sortOrder: "asc" } } } } } },
    },
  });
  if (!item) return apiError(404, "ไม่พบสินค้าจากบาร์โค้ดนี้");
  if (!item.isAvailable) return apiError(409, "สินค้านี้หมด (86)");
  return Response.json({ item });
}

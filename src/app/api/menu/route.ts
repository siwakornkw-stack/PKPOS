import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// GET: categories with their items (used by POS + Menu Management)
export async function GET() {
  const auth = await requireBranch(); // concrete branch (never leak menus across branches)
  if (auth instanceof Response) return auth;
  const { branchId } = auth;

  const categories = await prisma.menuCategory.findMany({
    where: { branchId, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        orderBy: { code: "asc" },
        include: {
          prices: true,
          optionGroups: {
            include: { group: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
          },
        },
      },
    },
  });
  const branch = branchId
    ? await prisma.branch.findUnique({ where: { id: branchId }, select: { taxRate: true, serviceRate: true } })
    : null;
  return Response.json({
    categories,
    config: { taxRate: branch?.taxRate ?? 0.07, serviceRate: branch?.serviceRate ?? 0.1 },
  });
}

const itemSchema = z.object({
  categoryId: z.number().int(),
  code: z.string().min(1),
  barcode: z.string().trim().min(1).optional(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().default(0),
  description: z.string().optional(),
  isOpenPrice: z.boolean().optional(),
});

// POST: create a menu item (Menu Management)
export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.MENU_MANAGE);
  if (auth instanceof Response) return auth;
  const { branchId } = auth;

  const parsed = itemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลเมนูไม่ถูกต้อง", parsed.error.flatten());

  const dup = await prisma.menuItem.findFirst({
    where: { branchId, code: parsed.data.code },
  });
  if (dup) return apiError(409, "รหัสเมนูนี้มีอยู่แล้ว");

  if (parsed.data.barcode) {
    const dupBc = await prisma.menuItem.findFirst({ where: { branchId, barcode: parsed.data.barcode } });
    if (dupBc) return apiError(409, "บาร์โค้ดนี้มีอยู่แล้ว");
  }

  // the category must belong to this branch (no cross-branch FK)
  const cat = await prisma.menuCategory.findUnique({ where: { id: parsed.data.categoryId } });
  if (!cat || cat.branchId !== branchId) return apiError(400, "ไม่พบหมวดหมู่");

  const item = await prisma.menuItem.create({
    data: { ...parsed.data, branchId },
  });
  await writeAudit({
    userId: auth.user.id, action: "create_menu", entity: "menu_item",
    entityId: item.id, after: item,
  });
  return Response.json({ item });
}

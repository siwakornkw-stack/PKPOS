import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  barcode: z.string().trim().nullable().optional(), // "" / null clears it
  price: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  categoryId: z.number().int().optional(),
  description: z.string().optional(),
  isAvailable: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isOpenPrice: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(PERMISSIONS.MENU_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  const before = await prisma.menuItem.findUnique({ where: { id } });
  if (!before || before.branchId !== auth.user.branchId) return apiError(404, "ไม่พบเมนู");

  // a reassigned category must belong to the same branch (no cross-branch FK)
  if (parsed.data.categoryId != null) {
    const cat = await prisma.menuCategory.findUnique({ where: { id: parsed.data.categoryId } });
    if (!cat || cat.branchId !== auth.user.branchId) return apiError(400, "ไม่พบหมวดหมู่");
  }

  // normalise barcode: blank clears it; otherwise enforce per-branch uniqueness
  const data: typeof parsed.data = { ...parsed.data };
  if (parsed.data.barcode !== undefined) {
    const bc = parsed.data.barcode ? parsed.data.barcode : null;
    data.barcode = bc;
    if (bc) {
      const dupBc = await prisma.menuItem.findFirst({ where: { branchId: auth.user.branchId, barcode: bc, id: { not: id } } });
      if (dupBc) return apiError(409, "บาร์โค้ดนี้มีอยู่แล้ว");
    }
  }

  const item = await prisma.menuItem.update({ where: { id }, data });
  await writeAudit({
    userId: auth.user.id, action: "update_menu", entity: "menu_item",
    entityId: id, before, after: item,
  });
  return Response.json({ item });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(PERMISSIONS.MENU_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const existing = await prisma.menuItem.findUnique({ where: { id } });
  if (!existing || existing.branchId !== auth.user.branchId) return apiError(404, "ไม่พบเมนู");

  // soft delete (design: soft delete for master tables)
  const item = await prisma.menuItem.update({
    where: { id },
    data: { isActive: false },
  });
  await writeAudit({
    userId: auth.user.id, action: "delete_menu", entity: "menu_item", entityId: id,
  });
  return Response.json({ ok: true, item });
}

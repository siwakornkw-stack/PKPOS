import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  name: z.string().min(1).optional(),
  station: z.string().trim().nullable().optional(), // "" / null clears it
  isActive: z.boolean().optional(),
  move: z.enum(["up", "down"]).optional(), // swap sortOrder with the adjacent category
});

// PATCH: rename / set station / reorder (up-down) / activate a category.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.MENU_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  const cat = await prisma.menuCategory.findUnique({ where: { id } });
  if (!cat || cat.branchId !== auth.branchId) return apiError(404, "ไม่พบหมวด");

  if (parsed.data.move) {
    // find the neighbouring active category and swap their sortOrder
    const neighbor = await prisma.menuCategory.findFirst({
      where: { branchId: auth.branchId, isActive: true, sortOrder: parsed.data.move === "up" ? { lt: cat.sortOrder } : { gt: cat.sortOrder } },
      orderBy: { sortOrder: parsed.data.move === "up" ? "desc" : "asc" },
    });
    if (neighbor)
      await prisma.$transaction([
        prisma.menuCategory.update({ where: { id: cat.id }, data: { sortOrder: neighbor.sortOrder } }),
        prisma.menuCategory.update({ where: { id: neighbor.id }, data: { sortOrder: cat.sortOrder } }),
      ]);
    return Response.json({ ok: true });
  }

  const data: { name?: string; station?: string | null; isActive?: boolean } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.station !== undefined) data.station = parsed.data.station || null;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

  const updated = await prisma.menuCategory.update({ where: { id }, data });
  await writeAudit({ userId: auth.user.id, action: "update_category", entity: "menu_category", entityId: id, after: data });
  return Response.json({ category: updated });
}

// DELETE: soft-delete a category. Refuses if it still has active items (move them first).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.MENU_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number((await params).id);

  const cat = await prisma.menuCategory.findUnique({ where: { id } });
  if (!cat || cat.branchId !== auth.branchId) return apiError(404, "ไม่พบหมวด");

  const items = await prisma.menuItem.count({ where: { categoryId: id, isActive: true } });
  if (items > 0) return apiError(409, `หมวดนี้มี ${items} เมนู - ย้ายหรือลบเมนูออกก่อน`);

  await prisma.menuCategory.update({ where: { id }, data: { isActive: false } });
  await writeAudit({ userId: auth.user.id, action: "delete_category", entity: "menu_category", entityId: id });
  return Response.json({ ok: true });
}

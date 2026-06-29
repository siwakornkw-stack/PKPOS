import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { round2 } from "@/lib/format";

// GET: menu item + its recipe (ingredients with name/unit/qty)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ menuItemId: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.MENU_MANAGE);
  if (auth instanceof Response) return auth;
  const { branchId } = auth;

  const id = Number((await params).menuItemId);
  const menuItem = await prisma.menuItem.findUnique({
    where: { id },
    include: {
      recipeItems: {
        include: { ingredient: { select: { name: true, unit: true } } },
      },
    },
  });
  if (!menuItem || menuItem.branchId !== branchId) return apiError(404, "ไม่พบเมนู");

  const recipe = menuItem.recipeItems.map((r) => ({
    ingredientId: r.ingredientId,
    name: r.ingredient.name,
    unit: r.ingredient.unit,
    qty: r.qty,
  }));

  return Response.json({
    menuItem: { id: menuItem.id, code: menuItem.code, name: menuItem.name },
    recipe,
  });
}

const schema = z.object({
  items: z
    .array(
      z.object({
        ingredientId: z.number().int(),
        qty: z.number().positive().max(100000),
      })
    )
    .default([]),
});

// PUT: replace the whole recipe for this menu item
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ menuItemId: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.MENU_MANAGE);
  if (auth instanceof Response) return auth;
  const { user, branchId } = auth;

  const id = Number((await params).menuItemId);
  const menuItem = await prisma.menuItem.findUnique({ where: { id } });
  if (!menuItem || menuItem.branchId !== branchId) return apiError(404, "ไม่พบเมนู");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลสูตรไม่ถูกต้อง", parsed.error.flatten());

  // verify all ingredients belong to this branch
  const ids = parsed.data.items.map((i) => i.ingredientId);
  if (ids.length) {
    const found = await prisma.ingredient.count({
      where: { id: { in: ids }, branchId },
    });
    if (found !== new Set(ids).size) return apiError(404, "ไม่พบวัตถุดิบ");
  }

  await prisma.$transaction(async (tx) => {
    await tx.recipeItem.deleteMany({ where: { menuItemId: id } });
    for (const i of parsed.data.items) {
      await tx.recipeItem.create({
        data: { menuItemId: id, ingredientId: i.ingredientId, qty: round2(i.qty) },
      });
    }
  });

  await writeAudit({
    userId: user.id,
    action: "update_recipe",
    entity: "menu_item",
    entityId: id,
    after: parsed.data.items,
  });

  return Response.json({ ok: true });
}

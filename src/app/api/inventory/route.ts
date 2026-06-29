import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { nextDocNo } from "@/lib/docno";
import { round2 } from "@/lib/format";

// GET: ingredient stock list + recent movements
export async function GET() {
  const auth = await requireBranch(PERMISSIONS.INVENTORY_MANAGE);
  if (auth instanceof Response) return auth;
  const { branchId } = auth; // concrete branch - never leak across branches via a null filter

  const ingredients = await prisma.ingredient.findMany({
    where: { branchId, isActive: true },
    orderBy: { code: "asc" },
  });
  const movements = await prisma.stockMovement.findMany({
    where: { branchId },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { ingredient: { select: { name: true, unit: true } } },
  });

  return Response.json({
    ingredients: ingredients.map((i) => ({
      ...i,
      isLow: i.stockQty <= i.reorderLevel,
    })),
    movements,
  });
}

const moveSchema = z.object({
  ingredientId: z.number().int(),
  type: z.enum(["RECEIVE", "ISSUE", "ADJUST", "COUNT"]),
  qty: z.number(), // RECEIVE/ADJUST(+) positive add, ISSUE negative; COUNT = new absolute qty
  note: z.string().optional(),
});

// POST: stock receive / issue / adjust / count
export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.INVENTORY_MANAGE);
  if (auth instanceof Response) return auth;
  const { user, branchId } = auth;

  const parsed = moveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");
  const d = parsed.data;

  const ing = await prisma.ingredient.findUnique({ where: { id: d.ingredientId } });
  if (!ing || ing.branchId !== branchId) return apiError(404, "ไม่พบวัตถุดิบ");

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) return apiError(500, "ไม่พบข้อมูลสาขา");

  // re-read inside tx so balanceAfter is computed from fresh stock
  const out = await prisma
    .$transaction(async (tx) => {
      const fresh = await tx.ingredient.findUnique({ where: { id: d.ingredientId } });
      if (!fresh) throw new Error("NOT_FOUND");
      const delta = d.type === "COUNT" ? round2(d.qty - fresh.stockQty) : round2(d.qty);
      const balanceAfter = round2(fresh.stockQty + delta);
      if (balanceAfter < 0) throw new Error("NEGATIVE");

      await tx.ingredient.update({ where: { id: fresh.id }, data: { stockQty: balanceAfter } });
      await tx.stockMovement.create({
        data: {
          docNo: await nextDocNo("STK", branch.code, tx),
          branchId,
          ingredientId: fresh.id,
          type: d.type,
          qty: delta,
          balanceAfter,
          note: d.note,
          createdBy: user.id,
        },
      });
      return { delta, balanceAfter };
    })
    .catch((e) => (e instanceof Error ? e.message : "ERR"));

  if (out === "NOT_FOUND") return apiError(404, "ไม่พบวัตถุดิบ");
  if (out === "NEGATIVE") return apiError(422, "สต็อกไม่พอ (ติดลบ)");
  if (typeof out === "string") throw new Error(out);

  await writeAudit({
    userId: user.id, action: "stock_" + d.type.toLowerCase(),
    entity: "ingredient", entityId: ing.id, after: out,
  });

  return Response.json({ ok: true, balanceAfter: out.balanceAfter });
}

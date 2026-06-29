import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { nextDocNo } from "@/lib/docno";
import { round2 } from "@/lib/format";

// GET: list POs + suppliers + ingredients for the create form
export async function GET() {
  const auth = await requireBranch(PERMISSIONS.PURCHASE_MANAGE);
  if (auth instanceof Response) return auth;
  const { branchId } = auth;

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { branchId },
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
  const suppliers = await prisma.supplier.findMany({
    where: { branchId },
    orderBy: { name: "asc" },
  });
  const ingredients = await prisma.ingredient.findMany({
    where: { branchId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true, costPerUnit: true },
  });

  return Response.json({ purchaseOrders, suppliers, ingredients });
}

const schema = z.object({
  supplierId: z.number().int(),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        ingredientId: z.number().int(),
        qty: z.number().positive(),
        unitCost: z.number().nonnegative(),
      })
    )
    .min(1),
});

// POST: create a PO (status ORDERED)
export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.PURCHASE_MANAGE);
  if (auth instanceof Response) return auth;
  const { user, branchId } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลใบสั่งซื้อไม่ถูกต้อง");
  const d = parsed.data;

  const supplier = await prisma.supplier.findUnique({ where: { id: d.supplierId } });
  if (!supplier || supplier.branchId !== branchId) return apiError(404, "ไม่พบผู้ขาย");

  const ingIds = d.items.map((i) => i.ingredientId);
  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: ingIds }, branchId },
  });
  if (ingredients.length !== new Set(ingIds).size) return apiError(404, "ไม่พบวัตถุดิบ");

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) return apiError(500, "ไม่พบข้อมูลสาขา");

  const items = d.items.map((i) => ({
    ingredientId: i.ingredientId,
    qty: round2(i.qty),
    unitCost: round2(i.unitCost),
    lineAmount: round2(i.qty * i.unitCost),
  }));
  const totalAmount = round2(items.reduce((s, i) => s + i.lineAmount, 0));

  const docNo = await nextDocNo("PO", branch.code);
  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      docNo,
      branchId,
      supplierId: d.supplierId,
      status: "ORDERED",
      totalAmount,
      note: d.note,
      items: { create: items },
    },
  });

  await writeAudit({
    userId: user.id,
    action: "create_po",
    entity: "purchaseOrder",
    entityId: purchaseOrder.id,
    after: { docNo, totalAmount },
  });

  return Response.json({ purchaseOrder });
}

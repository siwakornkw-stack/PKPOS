import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError } from "@/lib/api";

// GET: auto-generate low-stock notifications, then return latest 50 + unread count
export async function GET() {
  const auth = await requireBranch();
  if (auth instanceof Response) return auth;
  const { branchId } = auth;

  const ingredients = await prisma.ingredient.findMany({
    where: { branchId, isActive: true },
  });
  const lowStock = ingredients.filter((i) => i.stockQty <= i.reorderLevel);

  for (const ing of lowStock) {
    const existing = await prisma.notification.findFirst({
      where: {
        branchId,
        type: "LOW_STOCK",
        isRead: false,
        title: `วัตถุดิบใกล้หมด: ${ing.name}`, // exact match (substring would suppress distinct names)
      },
    });
    if (!existing) {
      await prisma.notification.create({
        data: {
          branchId,
          type: "LOW_STOCK",
          title: `วัตถุดิบใกล้หมด: ${ing.name}`,
          body: `เหลือ ${ing.stockQty} ${ing.unit}`,
        },
      });
    }
  }

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { branchId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({ where: { branchId, isRead: false } }),
  ]);

  return Response.json({ notifications, unread });
}

const schema = z.object({
  id: z.number().int().optional(),
  all: z.boolean().optional(),
});

// POST: mark a single notification read (id) or all branch notifications read (all)
export async function POST(req: NextRequest) {
  const auth = await requireBranch();
  if (auth instanceof Response) return auth;
  const { branchId } = auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");
  const { id, all } = parsed.data;

  if (all) {
    await prisma.notification.updateMany({
      where: { branchId, isRead: false },
      data: { isRead: true },
    });
  } else if (id != null) {
    await prisma.notification.updateMany({
      where: { id, branchId },
      data: { isRead: true },
    });
  } else {
    return apiError(400, "ข้อมูลไม่ถูกต้อง");
  }

  return Response.json({ ok: true });
}

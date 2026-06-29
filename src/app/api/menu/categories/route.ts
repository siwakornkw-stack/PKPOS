import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  name: z.string().min(1),
  station: z.string().trim().optional(),
});

// POST: create a menu category (appended to the end of the list).
export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.MENU_MANAGE);
  if (auth instanceof Response) return auth;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลหมวดไม่ถูกต้อง");

  const max = await prisma.menuCategory.aggregate({ where: { branchId: auth.branchId }, _max: { sortOrder: true } });
  const cat = await prisma.menuCategory.create({
    data: { branchId: auth.branchId, name: parsed.data.name, station: parsed.data.station || null, sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  await writeAudit({ userId: auth.user.id, action: "create_category", entity: "menu_category", entityId: cat.id });
  return Response.json({ category: cat });
}

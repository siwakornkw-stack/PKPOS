import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// GET ?menuItemId= : time-window prices for a menu item (management).
export async function GET(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.MENU_MANAGE);
  if (auth instanceof Response) return auth;
  const menuItemId = Number(req.nextUrl.searchParams.get("menuItemId"));
  if (!menuItemId) return apiError(400, "ไม่มีเมนู");
  const mi = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
  if (!mi || mi.branchId !== auth.branchId) return apiError(404, "ไม่พบเมนู");
  const timePrices = await prisma.menuTimePrice.findMany({ where: { menuItemId }, orderBy: { priority: "desc" } });
  return Response.json({ timePrices });
}

const schema = z.object({
  menuItemId: z.number().int(),
  name: z.string().min(1),
  channel: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]).nullable().default(null),
  days: z.string().regex(/^[0-6]*$/).default("0123456"),
  startMin: z.number().int().min(0).max(1439),
  endMin: z.number().int().min(0).max(1439),
  price: z.number().nonnegative(),
  priority: z.number().int().default(0),
});

// POST: add a time-window price (management).
export async function POST(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.MENU_MANAGE);
  if (auth instanceof Response) return auth;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลราคาตามเวลาไม่ถูกต้อง");

  const mi = await prisma.menuItem.findUnique({ where: { id: parsed.data.menuItemId } });
  if (!mi || mi.branchId !== auth.branchId) return apiError(404, "ไม่พบเมนู");

  const tp = await prisma.menuTimePrice.create({ data: parsed.data });
  await writeAudit({ userId: auth.user.id, action: "create_timeprice", entity: "menu_time_price", entityId: tp.id });
  return Response.json({ timePrice: tp });
}

// DELETE ?id= : remove a time-window price (management).
export async function DELETE(req: NextRequest) {
  const auth = await requireBranch(PERMISSIONS.MENU_MANAGE);
  if (auth instanceof Response) return auth;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return apiError(400, "ไม่มี id");
  const tp = await prisma.menuTimePrice.findUnique({ where: { id }, include: { menuItem: true } });
  if (!tp || tp.menuItem.branchId !== auth.branchId) return apiError(404, "ไม่พบรายการ");
  await prisma.menuTimePrice.delete({ where: { id } });
  await writeAudit({ userId: auth.user.id, action: "delete_timeprice", entity: "menu_time_price", entityId: id });
  return Response.json({ ok: true });
}

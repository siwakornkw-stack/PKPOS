import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  buyerName: z.string().max(200).optional(),
  buyerTaxId: z.string().max(20).optional(),
  buyerAddress: z.string().max(300).optional(),
});

// PATCH: set the buyer's details for a full tax invoice (ใบกำกับภาษีเต็มรูป).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  const orderId = Number((await params).id);

  const order = await prisma.salesOrder.findUnique({ where: { id: orderId }, select: { branchId: true } });
  if (!order || order.branchId !== auth.branchId) return apiError(404, "ไม่พบออเดอร์");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ข้อมูลไม่ถูกต้อง");

  await prisma.salesOrder.update({
    where: { id: orderId },
    data: {
      buyerName: parsed.data.buyerName || null,
      buyerTaxId: parsed.data.buyerTaxId || null,
      buyerAddress: parsed.data.buyerAddress || null,
    },
  });
  await writeAudit({ userId: auth.user.id, action: "set_buyer", entity: "sales_order", entityId: orderId });
  return Response.json({ ok: true });
}

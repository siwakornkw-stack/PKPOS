import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { pushLineMessage, ereceiptText } from "@/lib/integrations/line";

const schema = z.object({ to: z.string().min(1) }); // LINE userId of the customer

// POST: push an e-receipt to the customer's LINE (MOCK/no-op until the branch has a
// LINE channel token).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  const orderId = Number((await params).id);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "ต้องระบุ LINE userId ผู้รับ");

  const order = await prisma.salesOrder.findUnique({ where: { id: orderId }, include: { branch: true } });
  if (!order || order.branchId !== auth.branchId) return apiError(404, "ไม่พบออเดอร์");
  if (order.status !== "PAID") return apiError(409, "ต้องชำระเงินก่อนส่งใบเสร็จ");

  const result = await pushLineMessage(
    order.branch.lineChannelToken,
    parsed.data.to,
    ereceiptText({ docNo: order.docNo, branchName: order.branch.name, netAmount: order.netAmount, paidAt: order.paidAt })
  );
  await writeAudit({ userId: auth.user.id, action: "ereceipt_push", entity: "sales_order", entityId: orderId, after: { mode: result.mode, ok: result.ok } });

  if (!result.ok) return apiError(502, `ส่ง LINE ไม่สำเร็จ: ${result.detail ?? ""}`);
  return Response.json({ ok: true, mode: result.mode });
}

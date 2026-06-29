import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { submitEtax } from "@/lib/integrations/etax";

// POST: submit a full tax invoice for a paid order to e-Tax (MOCK until the branch
// enables e-Tax + ETAX_API_KEY is set). Requires the buyer's tax details first.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBranch(PERMISSIONS.POS_ACCESS);
  if (auth instanceof Response) return auth;
  const orderId = Number((await params).id);

  const order = await prisma.salesOrder.findUnique({ where: { id: orderId }, include: { branch: true } });
  if (!order || order.branchId !== auth.branchId) return apiError(404, "ไม่พบออเดอร์");
  if (order.status !== "PAID") return apiError(409, "ต้องชำระเงินก่อนออกใบกำกับภาษี");
  if (!order.buyerName || !order.buyerTaxId) return apiError(422, "ต้องกรอกข้อมูลผู้ซื้อ (ชื่อ + เลขผู้เสียภาษี) ก่อน");

  // Atomic claim: flip to PENDING only when not already SUBMITTED. This (a) blocks re-issuing
  // a submitted invoice and (b) a retry of a stuck PENDING is safe because submitEtax carries a
  // per-docNo idempotency key, so the provider returns the same invoice instead of double-issuing.
  const claim = await prisma.salesOrder.updateMany({
    // not-SUBMITTED incl. the initial NULL state (Prisma `not` excludes NULLs, so OR it explicitly)
    where: { id: orderId, branchId: auth.branchId, OR: [{ etaxStatus: null }, { etaxStatus: { not: "SUBMITTED" } }] },
    data: { etaxStatus: "PENDING" },
  });
  if (claim.count === 0) return apiError(409, "ออกใบกำกับภาษีอิเล็กทรอนิกส์แล้ว");

  const result = await submitEtax(order.branch.etaxEnabled, {
    docNo: order.docNo,
    branchTaxId: order.branch.taxId,
    buyerName: order.buyerName,
    buyerTaxId: order.buyerTaxId,
    buyerAddress: order.buyerAddress,
    netAmount: order.netAmount,
    taxAmount: order.taxAmount,
  });

  await prisma.salesOrder.update({
    where: { id: orderId },
    data: { etaxStatus: result.status, etaxRef: result.ref ?? null },
  });
  await writeAudit({ userId: auth.user.id, action: "etax_submit", entity: "sales_order", entityId: orderId, after: { status: result.status, mode: result.mode } });

  if (result.status === "FAILED") return apiError(502, `ส่ง e-Tax ไม่สำเร็จ: ${result.detail ?? ""}`);
  return Response.json({ ok: true, ...result });
}

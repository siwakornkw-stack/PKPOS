import { prisma } from "@/lib/db";
import { requireBranch, apiError, writeAudit } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { nextDocNo } from "@/lib/docno";
import { round2 } from "@/lib/format";

// POST: receive a PO -> increases stock + records movements
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBranch(PERMISSIONS.PURCHASE_MANAGE);
  if (auth instanceof Response) return auth;
  const { user, branchId } = auth;
  const id = Number((await params).id);

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!po || po.branchId !== branchId) return apiError(404, "ไม่พบใบสั่งซื้อ");
  if (po.status !== "ORDERED") return apiError(409, "ใบสั่งซื้อนี้รับของไม่ได้");

  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) return apiError(500, "ไม่พบข้อมูลสาขา");

  const ok = await prisma.$transaction(async (tx) => {
    // atomically claim the PO so two concurrent receives can't double the stock
    const claim = await tx.purchaseOrder.updateMany({
      where: { id: po.id, status: "ORDERED" },
      data: { status: "RECEIVED", receivedAt: new Date() },
    });
    if (claim.count === 0) throw new Error("ALREADY_RECEIVED");

    for (const item of po.items) {
      const fresh = await tx.ingredient.findUnique({ where: { id: item.ingredientId } });
      // defense-in-depth: never write a stock movement for an ingredient outside this branch
      if (!fresh || fresh.branchId !== branchId) throw new Error("NOT_FOUND");
      const balanceAfter = round2(fresh.stockQty + item.qty);

      await tx.ingredient.update({
        where: { id: fresh.id },
        data: { stockQty: balanceAfter, costPerUnit: item.unitCost },
      });
      await tx.stockMovement.create({
        data: {
          docNo: await nextDocNo("STK", branch.code, tx),
          branchId,
          ingredientId: fresh.id,
          type: "RECEIVE",
          qty: item.qty,
          balanceAfter,
          refType: "PO",
          refId: po.id,
          createdBy: user.id,
        },
      });
    }

    return true;
  }).catch((e) => {
    if (e instanceof Error && (e.message === "ALREADY_RECEIVED" || e.message === "NOT_FOUND")) return e.message;
    throw e;
  });
  if (ok === "ALREADY_RECEIVED") return apiError(409, "ใบสั่งซื้อนี้รับของไปแล้ว");
  if (ok === "NOT_FOUND") return apiError(404, "ไม่พบวัตถุดิบในใบสั่งซื้อ");

  await writeAudit({
    userId: user.id,
    action: "receive_po",
    entity: "purchaseOrder",
    entityId: po.id,
    before: { status: po.status },
    after: { status: "RECEIVED" },
  });

  return Response.json({ ok: true });
}

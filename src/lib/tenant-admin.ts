import { Prisma } from "@prisma/client";

// FK-safe cascade delete of ONE tenant and all of its data, run inside a transaction.
// Deletion order mirrors prisma/seed.ts clean() but scoped to a single tenant; relations
// with onDelete: Cascade (SalesOrderItem, MenuPrice, RecipeItem, etc.) fall out automatically
// when their parent is deleted, so only the RESTRICT edges need an explicit ordered delete.
// Returns the row count removed per model (for the audit log / response).
export async function deleteTenantCascade(tx: Prisma.TransactionClient, tenantId: number) {
  const branches = await tx.branch.findMany({ where: { tenantId }, select: { id: true, code: true } });
  const branchIds = branches.map((b) => b.id);
  const users = await tx.user.findMany({ where: { tenantId }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const inB = { in: branchIds };

  const counts: Record<string, number> = {};

  // user-scoped (AuditLog.userId is a RESTRICT FK -> clear before deleting the users)
  if (userIds.length)
    counts.auditLog = (await tx.auditLog.deleteMany({ where: { userId: { in: userIds } } })).count;

  // branch-scoped, ordered so every RESTRICT child is gone before its parent
  if (branchIds.length) {
    counts.payment = (await tx.payment.deleteMany({ where: { order: { branchId: inB } } })).count; // no cascade from SalesOrder
    counts.salesOrder = (await tx.salesOrder.deleteMany({ where: { branchId: inB } })).count; // cascades items + item options
    counts.cashMovement = (await tx.cashMovement.deleteMany({ where: { branchId: inB } })).count; // before shift
    counts.shift = (await tx.shift.deleteMany({ where: { branchId: inB } })).count;
    counts.stockMovement = (await tx.stockMovement.deleteMany({ where: { branchId: inB } })).count; // before ingredient
    counts.purchaseOrder = (await tx.purchaseOrder.deleteMany({ where: { branchId: inB } })).count; // cascades PO items
    counts.booking = (await tx.booking.deleteMany({ where: { branchId: inB } })).count; // before member/table
    // combo links (MenuItem<->MenuItem): parent side cascades on menuItem delete, child side is RESTRICT -> clear both first
    counts.comboComponent = (
      await tx.comboComponent.deleteMany({ where: { OR: [{ combo: { branchId: inB } }, { menuItem: { branchId: inB } }] } })
    ).count;
    counts.menuItem = (await tx.menuItem.deleteMany({ where: { branchId: inB } })).count; // cascades recipeItem, menuPrice, menuTimePrice, menuItemOptionGroup
    counts.optionGroup = (await tx.optionGroup.deleteMany({ where: { branchId: inB } })).count; // cascades option, menuItemOptionGroup
    counts.menuCategory = (await tx.menuCategory.deleteMany({ where: { branchId: inB } })).count; // after menuItem
    counts.ingredient = (await tx.ingredient.deleteMany({ where: { branchId: inB } })).count; // after recipeItem/stockMovement/poItem gone
    counts.supplier = (await tx.supplier.deleteMany({ where: { branchId: inB } })).count; // after purchaseOrder
    counts.promotion = (await tx.promotion.deleteMany({ where: { branchId: inB } })).count;
    counts.voucher = (await tx.voucher.deleteMany({ where: { branchId: inB } })).count;
    counts.notification = (await tx.notification.deleteMany({ where: { branchId: inB } })).count;
    counts.printer = (await tx.printer.deleteMany({ where: { branchId: inB } })).count;
    counts.diningTable = (await tx.diningTable.deleteMany({ where: { branchId: inB } })).count; // after salesOrder/booking
    counts.attendance = (await tx.attendance.deleteMany({ where: { branchId: inB } })).count; // before user
  }

  // tenant-scoped
  counts.member = (await tx.member.deleteMany({ where: { tenantId } })).count; // after salesOrder/booking
  counts.user = (await tx.user.deleteMany({ where: { tenantId } })).count; // after shift/salesOrder/auditLog/attendance
  counts.reward = (await tx.reward.deleteMany({ where: { tenantId } })).count;
  counts.memberTier = (await tx.memberTier.deleteMany({ where: { tenantId } })).count; // after member
  counts.branch = (await tx.branch.deleteMany({ where: { tenantId } })).count; // after all branch children
  counts.invoice = (await tx.invoice.deleteMany({ where: { tenantId } })).count;
  counts.subscriptionPayment = (await tx.subscriptionPayment.deleteMany({ where: { tenantId } })).count;

  // best-effort: drop now-orphan global doc counters keyed by this tenant's (globally unique) branch codes
  const codes = branches.map((b) => b.code);
  if (codes.length)
    counts.counter = (await tx.counter.deleteMany({ where: { OR: codes.map((c) => ({ key: { contains: `-${c}-` } })) } })).count;

  counts.tenant = (await tx.tenant.deleteMany({ where: { id: tenantId } })).count;
  return counts;
}

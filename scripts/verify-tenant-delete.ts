// Local-only test of deleteTenantCascade: build a full tenant graph, delete it,
// assert every child row is gone and a control tenant is untouched. Run: npx tsx scripts/verify-tenant-delete.ts
import { PrismaClient } from "@prisma/client";
import { deleteTenantCascade } from "../src/lib/tenant-admin";

const prisma = new PrismaClient();
const TS = Date.now();
let ok = true;
const check = (label: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) ok = false; };

async function buildFullTenant(tag: string, roleId: number) {
  const tenant = await prisma.tenant.create({ data: { name: `deltest ${tag}`, slug: `__deltest_${tag}_${TS}` } });
  const branchCode = `__BR${tag}${TS}`;
  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, code: branchCode, name: "b" } });
  const user = await prisma.user.create({ data: { username: `__u${tag}${TS}`, passwordHash: "x", fullName: "u", roleId, branchId: branch.id, tenantId: tenant.id } });
  const cat = await prisma.menuCategory.create({ data: { branchId: branch.id, name: "c" } });
  const ing = await prisma.ingredient.create({ data: { branchId: branch.id, code: "I1", name: "i", unit: "g" } });
  const item = await prisma.menuItem.create({ data: { branchId: branch.id, categoryId: cat.id, code: "M1", name: "m", price: 100 } });
  const combo = await prisma.menuItem.create({ data: { branchId: branch.id, categoryId: cat.id, code: "M2", name: "combo", price: 150, isCombo: true } });
  await prisma.comboComponent.create({ data: { comboId: combo.id, menuItemId: item.id, qty: 1 } }); // child link = RESTRICT edge
  await prisma.recipeItem.create({ data: { menuItemId: item.id, ingredientId: ing.id, qty: 2 } });
  await prisma.menuPrice.create({ data: { menuItemId: item.id, channel: "DINE_IN", price: 90 } });
  await prisma.menuTimePrice.create({ data: { menuItemId: item.id, name: "hh", startMin: 0, endMin: 60, price: 80 } });
  const og = await prisma.optionGroup.create({ data: { branchId: branch.id, name: "g" } });
  await prisma.option.create({ data: { groupId: og.id, name: "o" } });
  await prisma.menuItemOptionGroup.create({ data: { menuItemId: item.id, groupId: og.id } });
  const tier = await prisma.memberTier.create({ data: { tenantId: tenant.id, name: "Bronze" } });
  const member = await prisma.member.create({ data: { tenantId: tenant.id, code: "C1", name: "mem", tierId: tier.id } });
  await prisma.reward.create({ data: { tenantId: tenant.id, name: "r", pointsCost: 10, type: "DISCOUNT_AMOUNT", value: 5 } });
  const sup = await prisma.supplier.create({ data: { branchId: branch.id, code: "S1", name: "s" } });
  const po = await prisma.purchaseOrder.create({ data: { docNo: `PO${tag}${TS}`, branchId: branch.id, supplierId: sup.id } });
  await prisma.purchaseOrderItem.create({ data: { poId: po.id, ingredientId: ing.id, qty: 1, unitCost: 1, lineAmount: 1 } });
  await prisma.stockMovement.create({ data: { docNo: `SM${tag}${TS}`, branchId: branch.id, ingredientId: ing.id, type: "RECEIVE", qty: 1, balanceAfter: 1 } });
  const table = await prisma.diningTable.create({ data: { branchId: branch.id, code: "T1", qrToken: `qr${tag}${TS}` } });
  const shift = await prisma.shift.create({ data: { branchId: branch.id, userId: user.id } });
  await prisma.cashMovement.create({ data: { branchId: branch.id, shiftId: shift.id, type: "PAID_IN", amount: 10 } });
  const order = await prisma.salesOrder.create({ data: { docNo: `SO${tag}${TS}`, branchId: branch.id, userId: user.id, tableId: table.id, memberId: member.id, shiftId: shift.id, status: "PAID", netAmount: 100 } });
  const oi = await prisma.salesOrderItem.create({ data: { orderId: order.id, menuItemId: item.id, name: "m", qty: 1, unitPrice: 100, lineAmount: 100 } });
  await prisma.salesOrderItemOption.create({ data: { orderItemId: oi.id, name: "o", priceDelta: 0 } });
  await prisma.payment.create({ data: { docNo: `RC${tag}${TS}`, orderId: order.id, method: "CASH", amount: 100, received: 100, shiftId: shift.id } });
  await prisma.booking.create({ data: { docNo: `BK${tag}${TS}`, branchId: branch.id, memberId: member.id, tableId: table.id, customerName: "x", phone: "0", bookingTime: new Date() } });
  await prisma.promotion.create({ data: { branchId: branch.id, code: "P1", name: "p", type: "PERCENT", value: 10 } });
  await prisma.voucher.create({ data: { branchId: branch.id, code: "V1", type: "AMOUNT", value: 50 } });
  await prisma.notification.create({ data: { branchId: branch.id, type: "INFO", title: "n" } });
  await prisma.printer.create({ data: { branchId: branch.id, name: "p", host: "1.1.1.1", type: "RECEIPT" } });
  await prisma.attendance.create({ data: { branchId: branch.id, userId: user.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "test" } });
  await prisma.invoice.create({ data: { tenantId: tenant.id, plan: "BASIC", amount: 299, periodStart: new Date(), periodEnd: new Date() } });
  await prisma.subscriptionPayment.create({ data: { tenantId: tenant.id, plan: "BASIC", amount: 299 } });
  await prisma.counter.create({ data: { key: `SO-${branchCode}-202606`, seq: 5 } });
  return { tenant, branch, user, branchCode };
}

async function main() {
  // global role (not tenant-scoped); reuse or create
  const role = await prisma.role.upsert({ where: { code: "__DELTEST_ROLE" }, update: {}, create: { code: "__DELTEST_ROLE", name: "t", permissions: "[]" } });

  const victim = await buildFullTenant("V", role.id);
  const control = await buildFullTenant("C", role.id);

  const counts = await prisma.$transaction((tx) => deleteTenantCascade(tx, victim.tenant.id), { timeout: 30000 });
  console.log("\ndeleted counts:", JSON.stringify(counts));
  console.log("");

  // victim fully gone
  check("tenant deleted", (await prisma.tenant.count({ where: { id: victim.tenant.id } })) === 0);
  check("branches gone", (await prisma.branch.count({ where: { tenantId: victim.tenant.id } })) === 0);
  check("users gone", (await prisma.user.count({ where: { tenantId: victim.tenant.id } })) === 0);
  check("salesOrders gone", (await prisma.salesOrder.count({ where: { branchId: victim.branch.id } })) === 0);
  check("salesOrderItems gone (cascade)", (await prisma.salesOrderItem.count({ where: { order: { branchId: victim.branch.id } } })) === 0);
  check("payments gone", (await prisma.payment.count({ where: { order: { branchId: victim.branch.id } } })) === 0);
  check("menuItems gone", (await prisma.menuItem.count({ where: { branchId: victim.branch.id } })) === 0);
  check("recipeItems gone (cascade)", (await prisma.recipeItem.count({ where: { menuItem: { branchId: victim.branch.id } } })) === 0);
  check("comboComponents gone", (await prisma.comboComponent.count({ where: { combo: { branchId: victim.branch.id } } })) === 0);
  check("ingredients gone", (await prisma.ingredient.count({ where: { branchId: victim.branch.id } })) === 0);
  check("bookings gone", (await prisma.booking.count({ where: { branchId: victim.branch.id } })) === 0);
  check("members gone", (await prisma.member.count({ where: { tenantId: victim.tenant.id } })) === 0);
  check("memberTiers gone", (await prisma.memberTier.count({ where: { tenantId: victim.tenant.id } })) === 0);
  check("rewards gone", (await prisma.reward.count({ where: { tenantId: victim.tenant.id } })) === 0);
  check("invoices gone", (await prisma.invoice.count({ where: { tenantId: victim.tenant.id } })) === 0);
  check("subscriptionPayments gone", (await prisma.subscriptionPayment.count({ where: { tenantId: victim.tenant.id } })) === 0);
  check("attendance gone", (await prisma.attendance.count({ where: { branchId: victim.branch.id } })) === 0);
  check("auditLog gone", (await prisma.auditLog.count({ where: { userId: victim.user.id } })) === 0);
  check("counter gone", (await prisma.counter.count({ where: { key: { contains: victim.branchCode } } })) === 0);

  // control untouched
  check("control tenant intact", (await prisma.tenant.count({ where: { id: control.tenant.id } })) === 1);
  check("control branch intact", (await prisma.branch.count({ where: { tenantId: control.tenant.id } })) === 1);
  check("control salesOrder intact", (await prisma.salesOrder.count({ where: { branchId: control.branch.id } })) === 1);
  check("control counter intact", (await prisma.counter.count({ where: { key: { contains: control.branchCode } } })) === 1);

  // cleanup control + test role
  await prisma.$transaction((tx) => deleteTenantCascade(tx, control.tenant.id), { timeout: 30000 });
  await prisma.role.delete({ where: { id: role.id } });

  console.log(`\n${ok ? "ALL PASS" : "SOME FAILED"}`);
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => { console.error("ERROR", e); await prisma.$disconnect(); process.exit(1); });

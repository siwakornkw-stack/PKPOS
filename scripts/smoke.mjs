// End-to-end smoke test of the POS core loop against a running server.
const BASE = process.env.BASE || "http://localhost:3000";
let cookie = "";

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", cookie, ...(opts.headers || {}) },
    redirect: "manual",
  });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("OK:", msg);
}

const r1 = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "cashier", secret: "1234" }) });
assert(r1.status === 200 && r1.body.ok, "login as cashier");

const r2 = await call("/api/menu");
assert(r2.status === 200 && r2.body.categories.length > 0, `menu loaded (${r2.body.categories.length} categories)`);
const firstItem = r2.body.categories[0].items[0];
const secondItem = r2.body.categories[1].items[0];

const r3 = await call("/api/tables");
assert(r3.status === 200 && r3.body.tables.length > 0, `tables loaded (${r3.body.tables.length})`);
const tableId = r3.body.tables.find((t) => t.status === "AVAILABLE").id;

const r4 = await call("/api/orders", {
  method: "POST",
  body: JSON.stringify({
    orderType: "DINE_IN", tableId, guestCount: 2, send: true,
    items: [{ menuItemId: firstItem.id, qty: 2 }, { menuItemId: secondItem.id, qty: 1 }],
  }),
});
assert(r4.status === 200 && r4.body.order.docNo.startsWith("SO-BR01-"), `order created ${r4.body.order?.docNo}`);
const orderId = r4.body.order.id;
assert(r4.body.order.netAmount > 0, `net computed = ${r4.body.order.netAmount}`);

const r5 = await call("/api/tables");
const t = r5.body.tables.find((x) => x.id === tableId);
assert(t.status === "OCCUPIED" && t.order, "table now OCCUPIED with order");

const r6 = await call(`/api/orders/${orderId}/items`, {
  method: "POST", body: JSON.stringify({ items: [{ menuItemId: secondItem.id, qty: 1 }] }),
});
assert(r6.status === 200, "append second round of items");

const r7 = await call("/api/kitchen");
assert(r7.status === 200 && r7.body.tickets.some((k) => k.id === orderId), "order appears in kitchen queue");
const kitchenItem = r7.body.tickets.find((k) => k.id === orderId).items[0];

const r8 = await call(`/api/orders/items/${kitchenItem.id}`, { method: "PATCH", body: JSON.stringify({ status: "COOKING" }) });
assert(r8.status === 200, "kitchen bump item to COOKING");

const r9 = await call(`/api/orders/${orderId}`);
const net = r9.body.order.netAmount;
const r10 = await call(`/api/orders/${orderId}/pay`, { method: "POST", body: JSON.stringify({ method: "CASH", received: net + 100 }) });
assert(r10.status === 200 && r10.body.ok, `payment ok, receipt ${r10.body.payment?.docNo}`);
assert(Math.abs(r10.body.change - 100) < 0.01, `change correct = ${r10.body.change}`);

const r11 = await call("/api/tables");
const t2 = r11.body.tables.find((x) => x.id === tableId);
assert(t2.status === "AVAILABLE" && !t2.order, "table freed after payment");

const r12 = await call("/api/dashboard");
assert(r12.status === 200 && r12.body.kpis.orderCount >= 1, `dashboard reflects sale (today orders=${r12.body.kpis.orderCount}, sales=${r12.body.kpis.todaySales})`);

// concurrency: two simultaneous payments on one order -> exactly one succeeds
const menu = (await call("/api/menu")).body;
const item = menu.categories[0].items[0];
const freeTable = (await call("/api/tables")).body.tables.find((t) => t.status === "AVAILABLE");
const co = await call("/api/orders", {
  method: "POST",
  body: JSON.stringify({ orderType: "DINE_IN", tableId: freeTable.id, guestCount: 1, send: true, items: [{ menuItemId: item.id, qty: 1 }] }),
});
const coId = co.body.order.id;
const coNet = co.body.order.netAmount;
const [pa, pb] = await Promise.all([
  call(`/api/orders/${coId}/pay`, { method: "POST", body: JSON.stringify({ method: "CASH", received: coNet }) }),
  call(`/api/orders/${coId}/pay`, { method: "POST", body: JSON.stringify({ method: "CASH", received: coNet }) }),
]);
const oks = [pa, pb].filter((r) => r.status === 200).length;
const conflicts = [pa, pb].filter((r) => r.status === 409).length;
assert(oks === 1 && conflicts === 1, `double-payment prevented (ok=${oks}, conflict=${conflicts})`);
const payCount = (await call(`/api/orders/${coId}`)).body.order.payments.length;
assert(payCount === 1, `exactly one payment record (${payCount})`);

// permission gate: waiter cannot void
await call("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "waiter", secret: "1234" }) });
const r13 = await call("/api/inventory");
assert(r13.status === 403, "waiter blocked from inventory (RBAC 403)");

// ===== Tier 1/2 feature checks (as owner) =====
await call("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "owner", secret: "1234" }) });

// shift open + current
const so = await call("/api/shift", { method: "POST", body: JSON.stringify({ openingCash: 1000 }) });
assert(so.status === 200 || so.status === 409, "open shift");
const sc = await call("/api/shift");
assert(sc.body.shift, "current shift is open");

// promotion applied at POS (order >= 200 to satisfy LUNCH10 minSpend)
const menuF = (await call("/api/menu")).body;
const big = menuF.categories.flatMap((c) => c.items).find((i) => i.price >= 100);
const tF = (await call("/api/tables")).body.tables.find((t) => t.status === "AVAILABLE");
const ord = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "DINE_IN", tableId: tF.id, guestCount: 2, send: true, items: [{ menuItemId: big.id, qty: 2 }] }) });
const ordId = ord.body.order.id;
const ordSubtotal = ord.body.order.subtotal;
const promos = (await call("/api/promotions")).body.promotions;
const applicable = promos.find((p) => p.scope === "ORDER" && !p.memberOnly && p.minSpend <= ordSubtotal);
const pr = await call(`/api/orders/${ordId}/promo`, { method: "POST", body: JSON.stringify({ promotionId: applicable.id }) });
assert(pr.status === 200 && pr.body.discount > 0, `promo applied (discount ${pr.body.discount})`);

// pay then refund -> stock restored, status REFUNDED
const ordNet = (await call(`/api/orders/${ordId}`)).body.order.netAmount;
const payF = await call(`/api/orders/${ordId}/pay`, { method: "POST", body: JSON.stringify({ method: "QR", received: ordNet }) });
assert(payF.status === 200, "pay promo order");
const refund = await call(`/api/orders/${ordId}/refund`, { method: "POST", body: JSON.stringify({ reason: "test" }) });
assert(refund.status === 200, `refund ok (${refund.body.refunded})`);
const refStatus = (await call(`/api/orders/${ordId}`)).body.order.status;
assert(refStatus === "REFUNDED", "order status REFUNDED");

// purchase order: create + receive -> ingredient stock increases
const pdata = (await call("/api/purchasing")).body;
const ingF = pdata.ingredients[0];
const beforeStock = (await call("/api/inventory")).body.ingredients.find((i) => i.id === ingF.id).stockQty;
const po = await call("/api/purchasing", { method: "POST", body: JSON.stringify({ supplierId: pdata.suppliers[0].id, items: [{ ingredientId: ingF.id, qty: 10, unitCost: 50 }] }) });
assert(po.status === 200, `PO created ${po.body.purchaseOrder?.docNo}`);
const recv = await call(`/api/purchasing/${po.body.purchaseOrder.id}/receive`, { method: "POST", body: "{}" });
assert(recv.status === 200, "PO received");
const afterStock = (await call("/api/inventory")).body.ingredients.find((i) => i.id === ingF.id).stockQty;
assert(Math.abs(afterStock - beforeStock - 10) < 0.001, `stock increased by 10 (${beforeStock} -> ${afterStock})`);

// booking create
const bk = await call("/api/bookings", { method: "POST", body: JSON.stringify({ customerName: "ทดสอบ", phone: "0800000000", guestCount: 4, bookingTime: "2026-07-01T18:00:00.000Z", deposit: 100 }) });
assert(bk.status === 200 && bk.body.booking.docNo.startsWith("BK-"), `booking created ${bk.body.booking?.docNo}`);

// business settings: set VAT + PromptPay id, verify
const setRes = await call("/api/branch-settings", { method: "PATCH", body: JSON.stringify({ taxRate: 0.07, serviceRate: 0.1, promptPayId: "0812345678" }) });
assert(setRes.status === 200, "update branch settings");
const cfg = (await call("/api/menu")).body.config;
assert(cfg && cfg.taxRate === 0.07, `menu config carries rates (vat ${cfg.taxRate})`);

// PromptPay QR generated for an amount
const qr = await call("/api/promptpay?amount=120.50");
assert(qr.status === 200 && qr.body.configured && qr.body.qr.startsWith("data:image"), "PromptPay QR generated");

// stock count: count one ingredient to a new value -> variance posted
const invForCount = (await call("/api/inventory")).body.ingredients[0];
const counted = invForCount.stockQty + 5;
const cnt = await call("/api/stock-count", { method: "POST", body: JSON.stringify({ counts: [{ ingredientId: invForCount.id, countedQty: counted }] }) });
assert(cnt.status === 200 && cnt.body.adjusted >= 1, `stock count posted (adjusted ${cnt.body.adjusted})`);
const newQty = (await call("/api/inventory")).body.ingredients.find((i) => i.id === invForCount.id).stockQty;
assert(Math.abs(newQty - counted) < 0.001, `stock set to counted value (${newQty})`);

// member edit + redeem points
const mem = (await call("/api/customers")).body.members[0];
const ed = await call(`/api/customers/${mem.id}`, { method: "PATCH", body: JSON.stringify({ name: mem.name + " *" }) });
assert(ed.status === 200, "member edited");
const rd = await call(`/api/customers/${mem.id}`, { method: "POST", body: JSON.stringify({ action: "redeem", points: 10 }) });
assert(rd.status === 200 && rd.body.remaining === mem.points - 10, `points redeemed (remaining ${rd.body.remaining})`);

// expanded reports fields present
const rep = (await call("/api/reports")).body;
assert(rep.grossProfit && rep.byCashier && rep.byHour && rep.refunds, "reports include profit/cashier/hour/refunds");
assert(rep.byHour.length === 24, "reports byHour has 24 buckets");

// notifications endpoint
const notif = await call("/api/notifications");
assert(notif.status === 200 && Array.isArray(notif.body.notifications), "notifications endpoint works");

// card payment gateway (mock authorize)
const charge = await call("/api/payments/charge", { method: "POST", body: JSON.stringify({ amount: 100, ref: "TEST" }) });
assert(charge.status === 200 && charge.body.transactionId.startsWith("MOCK-"), `card charge mock ok (${charge.body.transactionId})`);

// ESC/POS print buffer + tax invoice (use a paid order from reports)
const paidId = rep.orders.find((o) => o.status === "PAID").id;
const pr2 = await call("/api/print", { method: "POST", body: JSON.stringify({ orderId: paidId, target: "receipt" }) });
assert(pr2.status === 200 && pr2.body.base64 && pr2.body.bytes > 0, `ESC/POS buffer built (${pr2.body.bytes} bytes)`);
const taxPage = await fetch(`${BASE}/receipt/${paidId}/tax`, { headers: { cookie } });
assert(taxPage.status === 200, "tax invoice page renders");

// offline dedup: same idempotencyKey twice -> one order
const idem = "smoke-idem-12345";
const tIdem = (await call("/api/tables")).body.tables.find((t) => t.status === "AVAILABLE");
const mForIdem = (await call("/api/menu")).body.categories[0].items[0];
const body1 = JSON.stringify({ orderType: "TAKEAWAY", tableId: null, guestCount: 1, send: true, idempotencyKey: idem, items: [{ menuItemId: mForIdem.id, qty: 1 }] });
const o1 = await call("/api/orders", { method: "POST", body: body1 });
const o2 = await call("/api/orders", { method: "POST", body: body1 });
assert(o1.body.order.id === o2.body.order.id && o2.body.deduped, "idempotencyKey dedupes replayed order");

// ===== OchaPOS-parity features =====
const menuM = (await call("/api/menu")).body;
const allItems = menuM.categories.flatMap((c) => c.items);

// modifiers: item with an option that has a price delta -> unitPrice includes delta
const withOpt = allItems.find((i) => i.optionGroups && i.optionGroups.length && i.optionGroups.some((g) => g.group.options.some((o) => o.priceDelta > 0)));
const optGrp = withOpt.optionGroups.find((g) => g.group.options.some((o) => o.priceDelta > 0)).group;
const opt = optGrp.options.find((o) => o.priceDelta > 0);
const tOpt = (await call("/api/tables")).body.tables.find((t) => t.status === "AVAILABLE");
const oOpt = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "DINE_IN", tableId: tOpt.id, guestCount: 1, send: true, items: [{ menuItemId: withOpt.id, qty: 1, options: [opt.id] }] }) });
const optItem = oOpt.body.order.items[0];
assert(Math.abs(optItem.unitPrice - (withOpt.price + opt.priceDelta)) < 0.001, `modifier price applied (${withOpt.price}+${opt.priceDelta}=${optItem.unitPrice})`);
const optDetail = (await call(`/api/orders/${oOpt.body.order.id}`)).body.order.items[0];
assert(optDetail.options.length === 1 && optDetail.options[0].name === opt.name, "order line records chosen option");

// channel pricing: an item with a DELIVERY override prices higher on delivery
const delivItem = allItems.find((i) => i.prices && i.prices.some((p) => p.channel === "DELIVERY"));
if (delivItem) {
  const deliv = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "DELIVERY", tableId: null, guestCount: 1, send: true, items: [{ menuItemId: delivItem.id, qty: 1 }] }) });
  const dprice = delivItem.prices.find((p) => p.channel === "DELIVERY").price;
  assert(Math.abs(deliv.body.order.items[0].unitPrice - dprice) < 0.001, `channel (delivery) price used (${dprice})`);
}

// move table
const tA = (await call("/api/tables")).body.tables.find((t) => t.status === "AVAILABLE");
const ordMove = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "DINE_IN", tableId: tA.id, guestCount: 1, send: true, items: [{ menuItemId: allItems[0].id, qty: 1 }] }) });
const tB = (await call("/api/tables")).body.tables.find((t) => t.status === "AVAILABLE");
const mv = await call(`/api/orders/${ordMove.body.order.id}/move`, { method: "POST", body: JSON.stringify({ tableId: tB.id }) });
assert(mv.status === 200, "move table");
const movedTo = (await call(`/api/orders/${ordMove.body.order.id}`)).body.order.tableId;
assert(movedTo === tB.id, "order now on new table");

// park/hold
const hd = await call(`/api/orders/${ordMove.body.order.id}/hold`, { method: "POST", body: JSON.stringify({ name: "คุณทดสอบ" }) });
assert(hd.status === 200, "hold/park bill");
const heldList = (await call("/api/orders?status=HELD")).body.orders;
assert(heldList.some((o) => o.id === ordMove.body.order.id), "held bill listed");

// split payment: one bill, two tenders
const tS = (await call("/api/tables")).body.tables.find((t) => t.status === "AVAILABLE");
const ordSplit = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "DINE_IN", tableId: tS.id, guestCount: 1, send: true, items: [{ menuItemId: allItems[2].id, qty: 2 }] }) });
const sNet = (await call(`/api/orders/${ordSplit.body.order.id}`)).body.order.netAmount;
const half = Math.round((sNet / 2) * 100) / 100;
const sp = await call(`/api/orders/${ordSplit.body.order.id}/pay`, { method: "POST", body: JSON.stringify({ method: "CASH", received: sNet, payments: [{ method: "CASH", amount: half }, { method: "QR", amount: sNet - half }] }) });
assert(sp.status === 200, "split payment accepted");
const splitPays = (await call(`/api/orders/${ordSplit.body.order.id}`)).body.order.payments.length;
assert(splitPays === 2, `two payment records (${splitPays})`);

// cash drawer + Z report + kitchen station filter
assert((await call("/api/cashdrawer", { method: "POST" })).status === 200, "open cash drawer");
const z = (await call("/api/zreport")).body;
assert(z.summary && Array.isArray(z.byCategory) && z.byHour.length === 24, "Z report generated");
const kStation = await call("/api/kitchen?station=" + encodeURIComponent("บาร์/เครื่องดื่ม"));
assert(kStation.status === 200 && Array.isArray(kStation.body.stations), "kitchen station filter works");

// combo / set menu: order it, pay, component stock is deducted
const combo = allItems.find((i) => i.isCombo);
assert(combo, "combo (set menu) present in menu");
const rice0 = (await call("/api/inventory")).body.ingredients.find((i) => i.name === "ข้าวสาร").stockQty;
const tCombo = (await call("/api/tables")).body.tables.find((t) => t.status === "AVAILABLE");
const oCombo = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "DINE_IN", tableId: tCombo.id, guestCount: 1, send: true, items: [{ menuItemId: combo.id, qty: 1 }] }) });
const cNet = (await call(`/api/orders/${oCombo.body.order.id}`)).body.order.netAmount;
const cpay = await call(`/api/orders/${oCombo.body.order.id}/pay`, { method: "POST", body: JSON.stringify({ method: "CASH", received: cNet }) });
assert(cpay.status === 200, "combo paid");
const rice1 = (await call("/api/inventory")).body.ingredients.find((i) => i.name === "ข้าวสาร").stockQty;
assert(rice1 < rice0, `combo deducted component stock (${rice0} -> ${rice1})`);

// QR self-order (public, no auth): scan -> menu -> submit
const qrTable = (await call("/api/tables")).body.tables.find((t) => t.qrToken && t.status === "AVAILABLE");
const pubMenu = await call(`/api/public/menu?token=${qrTable.qrToken}`);
assert(pubMenu.status === 200 && pubMenu.body.categories.length > 0, "public menu by QR token");
const pubItem = pubMenu.body.categories.flatMap((c) => c.items)[0];
const pubOrder = await call("/api/public/order", { method: "POST", body: JSON.stringify({ token: qrTable.qrToken, items: [{ menuItemId: pubItem.id, qty: 1 }] }) });
assert(pubOrder.status === 200 && pubOrder.body.ok, "public self-order submitted");
const qrTableAfter = (await call("/api/tables")).body.tables.find((t) => t.id === qrTable.id);
assert(qrTableAfter.status === "OCCUPIED", "self-order occupied the table");

// voucher: apply a single-use code -> discount, marked used
const vouchers = (await call("/api/vouchers")).body.vouchers;
const v = vouchers.find((x) => !x.used && x.minSpend === 0);
const tVou = (await call("/api/tables")).body.tables.find((t) => t.status === "AVAILABLE");
const oVou = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "DINE_IN", tableId: tVou.id, guestCount: 1, send: true, items: [{ menuItemId: allItems[3].id, qty: 2 }] }) });
const vres = await call(`/api/orders/${oVou.body.order.id}/voucher`, { method: "POST", body: JSON.stringify({ code: v.code }) });
assert(vres.status === 200 && vres.body.discount > 0, `voucher applied (-${vres.body.discount})`);
const vUsed = (await call("/api/vouchers")).body.vouchers.find((x) => x.code === v.code).used;
assert(vUsed === true, "voucher marked used (single-use)");

// ===== OchaPOS-parity: cash in/out, open price, pre-bill =====
// cash drawer in/out (shift is open as owner)
const cashOutAmt = 50;
const cmRes = await call("/api/shift/cash", { method: "POST", body: JSON.stringify({ type: "PAID_OUT", amount: cashOutAmt, reason: "ทดสอบ" }) });
assert(cmRes.status === 200, "cash drawer paid-out recorded");
const sumAfter = (await call("/api/shift")).body.summary;
assert(Math.abs(sumAfter.cashOut - cashOutAmt) < 0.01, `shift drawer reflects paid-out (cashOut ${sumAfter.cashOut})`);

// open-price item: mark an item open-price, order it with a cashier-entered price
const opItem = allItems.find((i) => !i.isCombo);
await call(`/api/menu/${opItem.id}`, { method: "PATCH", body: JSON.stringify({ isOpenPrice: true }) });
const tOpen = (await call("/api/tables")).body.tables.find((t) => t.status === "AVAILABLE");
const opOrder = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "DINE_IN", tableId: tOpen.id, guestCount: 1, send: true, items: [{ menuItemId: opItem.id, qty: 1, unitPrice: 77 }] }) });
const opLine = opOrder.body.order.items.find((it) => it.menuItemId === opItem.id);
assert(opOrder.status === 200 && opLine.unitPrice === 77, `open-price item uses cashier price (${opLine?.unitPrice})`);
// a fixed item ignores a client-sent price (server is source of truth)
await call(`/api/menu/${opItem.id}`, { method: "PATCH", body: JSON.stringify({ isOpenPrice: false }) });
const tFix = (await call("/api/tables")).body.tables.find((t) => t.status === "AVAILABLE");
const fixOrder = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "DINE_IN", tableId: tFix.id, guestCount: 1, send: true, items: [{ menuItemId: opItem.id, qty: 1, unitPrice: 1 }] }) });
const fixLine = fixOrder.body.order.items.find((it) => it.menuItemId === opItem.id);
assert(fixLine.unitPrice !== 1, "fixed item ignores client-supplied price");

// pre-bill (เช็คบิล) print for an open order
const preb = await call("/api/print", { method: "POST", body: JSON.stringify({ orderId: opOrder.body.order.id, target: "prebill" }) });
assert(preb.status === 200 && preb.body.base64, "pre-bill (เช็คบิล) printed");

// ===== OchaPOS-parity round 2: queue number, service-charge waive, tax-invoice buyer =====
// queue number for takeaway
const tkOrder = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "TAKEAWAY", guestCount: 1, send: true, items: [{ menuItemId: allItems[0].id, qty: 1 }] }) });
assert(tkOrder.status === 200 && typeof tkOrder.body.order.queueNo === "number" && tkOrder.body.order.queueNo > 0, `takeaway gets a queue number (${tkOrder.body.order?.queueNo})`);

// service-charge waive on a dine-in bill
const tSvc = (await call("/api/tables")).body.tables.find((t) => t.status === "AVAILABLE");
const svcOrder = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "DINE_IN", tableId: tSvc.id, guestCount: 1, send: true, items: [{ menuItemId: allItems[0].id, qty: 2 }] }) });
assert(svcOrder.body.order.serviceCharge > 0, "dine-in order has service charge");
const svcPay = await call(`/api/orders/${svcOrder.body.order.id}/pay`, { method: "POST", body: JSON.stringify({ method: "CASH", received: 9999, noServiceCharge: true }) });
const svcAfter = (await call(`/api/orders?status=PAID&tableId=${tSvc.id}`)).body.orders.find((o) => o.id === svcOrder.body.order.id);
assert(svcPay.status === 200 && svcAfter && svcAfter.serviceCharge === 0, "service charge waived at payment (serviceCharge=0)");

// full tax-invoice buyer details
const buyer = await call(`/api/orders/${svcOrder.body.order.id}/buyer`, { method: "PATCH", body: JSON.stringify({ buyerName: "บริษัท ทดสอบ จำกัด", buyerTaxId: "0105500000000", buyerAddress: "1 ถนนทดสอบ" }) });
assert(buyer.status === 200, "tax-invoice buyer details saved");

// redeem member points as a bill discount at the POS
const memPts = (await call("/api/customers")).body.members.find((m) => m.points >= 50);
const tRed = (await call("/api/tables")).body.tables.find((t) => t.status === "AVAILABLE");
const redOrder = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "DINE_IN", tableId: tRed.id, guestCount: 1, memberId: memPts.id, send: true, items: [{ menuItemId: allItems[0].id, qty: 3 }] }) });
const netBefore = redOrder.body.order.netAmount;
const red = await call(`/api/orders/${redOrder.body.order.id}/redeem`, { method: "POST", body: JSON.stringify({ points: 50 }) });
assert(red.status === 200 && red.body.redeemed > 0, `redeem points applies a discount (${red.body?.redeemed} pts)`);
assert(red.body.netAmount < netBefore, "order net drops after redeeming points");
const memAfter = (await call("/api/customers")).body.members.find((m) => m.id === memPts.id);
assert(memAfter.points === memPts.points - red.body.redeemed, "member points decremented by redeemed amount");

// print daily X/Z report to thermal
const zdata = (await call(`/api/zreport`)).body;
const zprint = await call("/api/zreport/print", { method: "POST", body: JSON.stringify({ report: { date: zdata.date, summary: zdata.summary, byPayment: zdata.byPayment, byCategory: zdata.byCategory } }) });
assert(zprint.status === 200 && zprint.body.base64, "X/Z daily report printed to thermal");

// health check (public)
const health = await call("/api/health");
assert(health.status === 200 && health.body.ok && health.body.db === "up", "health check ok");

// PDPA: member export + erase
const memP = (await call("/api/customers")).body.members.find((m) => m.phone);
const exp = await call(`/api/customers/${memP.id}`);
assert(exp.status === 200 && exp.body.member && Array.isArray(exp.body.orders), "member data export (PDPA access)");
const era = await call(`/api/customers/${memP.id}`, { method: "DELETE" });
assert(era.status === 200, "member erase accepted");
const erased = (await call("/api/customers")).body.members.find((m) => m.id === memP.id);
assert(erased.phone === null && erased.name === "ลบข้อมูลแล้ว", "member PII erased, record kept");

// branch switch (owner) then back
const branches = (await call("/api/branches")).body;
assert(branches.canSwitch && branches.branches.length === 2, "owner can switch between 2 branches");
const sw = await call("/api/branch/switch", { method: "POST", body: JSON.stringify({ branchId: branches.branches[1].id }) });
assert(sw.status === 200, "switched to branch 2");
await call("/api/branch/switch", { method: "POST", body: JSON.stringify({ branchId: branches.branches[0].id }) });

console.log("\nALL SMOKE TESTS PASSED");

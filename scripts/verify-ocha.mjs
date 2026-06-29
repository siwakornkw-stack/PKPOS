// Ad-hoc end-to-end check for the OchaPOS-parity additions (run against `npm start`).
const BASE = process.env.BASE || "http://localhost:3000";
let cookie = "";
let pass = 0, fail = 0;

async function call(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", cookie, ...(opts.headers || {}) },
    body: opts.body,
  });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}
function A(ok, msg) { if (ok) { pass++; console.log("OK:", msg); } else { fail++; console.log("FAIL:", msg); } }
// delivery webhook fails closed in production unless the shared secret matches; send it when set
const whHeaders = process.env.DELIVERY_WEBHOOK_SECRET ? { "x-webhook-secret": process.env.DELIVERY_WEBHOOK_SECRET } : {};

const login = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "owner", secret: "1234" }) });
A(login.status === 200, "login owner");

const menu = await call("/api/menu");
const items = (menu.body.categories || []).flatMap((c) => c.items);
const byCode = Object.fromEntries(items.map((i) => [i.code, i]));

// 7. barcode lookup (scan-to-cart)
const bc = await call("/api/menu/barcode?code=8850001000017");
A(bc.status === 200 && bc.body.item?.code === "M072", `barcode lookup -> ${bc.body.item?.name}`);
const bcBad = await call("/api/menu/barcode?code=NOPE");
A(bcBad.status === 404, "unknown barcode -> 404");

// 5. BXGY promo: 2x iced tea (M070), buy-1-get-1 frees one unit
const teaOrder = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "DINE_IN", items: [{ menuItemId: byCode.M070.id, qty: 2 }], send: true }) });
const teaId = teaOrder.body.order.id;
const teaUnit = teaOrder.body.order.items[0].unitPrice;
const promos = (await call("/api/promotions?all=1")).body.promotions;
const bxgy = promos.find((p) => p.code === "B1G1TEA");
const applied = await call(`/api/orders/${teaId}/promo`, { method: "POST", body: JSON.stringify({ promotionId: bxgy.id }) });
A(applied.status === 200 && Math.abs(applied.body.discount - teaUnit) < 0.001, `BXGY frees one unit (discount ${applied.body.discount} == unit ${teaUnit})`);

// member-only promo blocked without a member
const vip = promos.find((p) => p.code === "VIP15");
const vipTry = await call(`/api/orders/${teaId}/promo`, { method: "POST", body: JSON.stringify({ promotionId: vip.id }) });
A(vipTry.status === 422, "member-only promo rejected without member");

// 6. reward redeem (DISCOUNT_AMOUNT): order with a member -> burn points -> baht discount
const members = (await call("/api/customers")).body.members;
const richMember = members.find((m) => m.points >= 100);
const rewards = (await call("/api/rewards")).body.rewards;
const discReward = rewards.find((r) => r.type === "DISCOUNT_AMOUNT");
const mOrder = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "TAKEAWAY", memberId: richMember.id, items: [{ menuItemId: byCode.M010.id, qty: 1 }], send: true }) });
const mOrderId = mOrder.body.order.id;
const redeem = await call(`/api/orders/${mOrderId}/reward`, { method: "POST", body: JSON.stringify({ rewardId: discReward.id }) });
A(redeem.status === 200 && redeem.body.pointsDiscount >= discReward.value, `reward redeemed (-${redeem.body.pointsDiscount} baht, ${discReward.pointsCost} pts)`);
const freeReward = rewards.find((r) => r.type === "FREE_ITEM");
if (freeReward) {
  const fOrder = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "TAKEAWAY", memberId: richMember.id, items: [{ menuItemId: byCode.M010.id, qty: 1 }], send: true }) });
  const fr = await call(`/api/orders/${fOrder.body.order.id}/reward`, { method: "POST", body: JSON.stringify({ rewardId: freeReward.id }) });
  A(fr.status === 200 && fr.body.freeItem, `FREE_ITEM reward adds a free line (${fr.body.freeItem})`);
}

// 8. attendance clock in/out
const clockIn = await call("/api/attendance", { method: "POST", body: JSON.stringify({ action: "IN" }) });
A(clockIn.status === 200, "attendance clock IN");
const dupIn = await call("/api/attendance", { method: "POST", body: JSON.stringify({ action: "IN" }) });
A(dupIn.status === 409, "double clock-IN rejected");
const clockOut = await call("/api/attendance", { method: "POST", body: JSON.stringify({ action: "OUT" }) });
A(clockOut.status === 200 && clockOut.body.attendance.clockOut, "attendance clock OUT");

// 1. delivery aggregator webhook import (shared secret sent via header when configured)
const dlv = await call("/api/webhooks/delivery/grab", { method: "POST", headers: whHeaders, body: JSON.stringify({ orderId: `G-${Date.now()}`, branchCode: "BR01", customerName: "ลูกค้า Grab", items: [{ code: "M010", qty: 2 }] }) });
A(dlv.status === 200 && dlv.body.order?.docNo, `delivery import created ${dlv.body.order?.docNo} (queue ${dlv.body.order?.queueNo})`);
await call("/api/webhooks/delivery/grab", { method: "POST", headers: whHeaders, body: JSON.stringify({ orderId: dlv.body.order ? `dup` : "x", branchCode: "BR01", items: [{ code: "M010", qty: 1 }] }) });
// re-post the SAME external id to prove idempotency
const sameId = `G-IDEM-1`;
await call("/api/webhooks/delivery/grab", { method: "POST", headers: whHeaders, body: JSON.stringify({ orderId: sameId, branchCode: "BR01", items: [{ code: "M010", qty: 1 }] }) });
const again = await call("/api/webhooks/delivery/grab", { method: "POST", headers: whHeaders, body: JSON.stringify({ orderId: sameId, branchCode: "BR01", items: [{ code: "M010", qty: 1 }] }) });
A(again.body.deduped === true, "delivery import is idempotent (same external id)");

// 3. e-Tax submit (mock) after pay + buyer details
const etaxOrder = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "TAKEAWAY", items: [{ menuItemId: byCode.M010.id, qty: 1 }], send: true }) });
const etaxId = etaxOrder.body.order.id;
const net = etaxOrder.body.order.netAmount;
await call(`/api/orders/${etaxId}/pay`, { method: "POST", body: JSON.stringify({ method: "CASH", received: Math.ceil(net) }) });
await call(`/api/orders/${etaxId}/buyer`, { method: "PATCH", body: JSON.stringify({ buyerName: "บริษัท ทดสอบ จำกัด", buyerTaxId: "0105500000000", buyerAddress: "1 ถนนทดสอบ" }) });
const etax = await call(`/api/orders/${etaxId}/etax`, { method: "POST" });
A(etax.status === 200 && etax.body.status === "SUBMITTED" && etax.body.mode === "MOCK", `e-Tax submitted (mock) ref ${etax.body.ref}`);

// e-receipt push (mock, no LINE token)
const er = await call(`/api/orders/${etaxId}/ereceipt`, { method: "POST", body: JSON.stringify({ to: "U線mockuser" }) });
A(er.status === 200 && er.body.mode === "MOCK", "e-receipt push (mock LINE)");

// 9. booking deposit credited to the table's bill at payment
const freeTbl = (await call("/api/tables")).body.tables.find((t) => t.status === "AVAILABLE");
const bk = await call("/api/bookings", { method: "POST", body: JSON.stringify({ customerName: "จองมัดจำ", phone: "0812345678", tableId: freeTbl.id, bookingTime: new Date(Date.now() + 3600_000).toISOString(), deposit: 30 }) });
A(bk.status === 200, "booking with deposit created");
const depOrder = await call("/api/orders", { method: "POST", body: JSON.stringify({ orderType: "DINE_IN", tableId: freeTbl.id, items: [{ menuItemId: byCode.M010.id, qty: 2 }], send: true }) });
A(depOrder.body.order?.bookingId === bk.body.booking.id, "new order auto-links the table's reservation");
const depNet = depOrder.body.order.netAmount;
// paying 30 baht LESS than net succeeds ONLY because the deposit is credited as a prepayment
const depPay = await call(`/api/orders/${depOrder.body.order.id}/pay`, { method: "POST", body: JSON.stringify({ method: "CASH", received: Math.ceil(depNet - 30) }) });
A(depPay.status === 200, `deposit (30) credited - paid net ${depNet} with only ${Math.ceil(depNet - 30)} cash`);
// double-booking the same table/time is rejected
const clash = await call("/api/bookings", { method: "POST", body: JSON.stringify({ customerName: "ซ้ำ", phone: "0800000000", tableId: freeTbl.id, bookingTime: new Date(Date.now() + 3600_000).toISOString(), deposit: 0 }) });
A(clash.status === 409, "double-booking same table/time rejected");

console.log(`\n${fail === 0 ? "ALL OCHA-PARITY CHECKS PASSED" : fail + " CHECK(S) FAILED"} (${pass} ok)`);
process.exit(fail === 0 ? 0 : 1);

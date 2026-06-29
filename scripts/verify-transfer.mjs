// Throwaway e2e: PromptPay/transfer subscription flow (submit slip -> admin approve -> active).
const BASE = process.env.BASE || "http://localhost:3000";
let pass = 0, fail = 0;
function A(ok, m) { if (ok) { pass++; console.log("OK:", m); } else { fail++; console.log("FAIL:", m); } }

function jar() {
  let cookie = "";
  return async (path, opts = {}) => {
    const r = await fetch(`${BASE}${path}`, { method: opts.method || "GET", headers: { "Content-Type": "application/json", cookie, ...(opts.headers || {}) }, body: opts.body });
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
    let b = null; try { b = await r.json(); } catch {}
    return { status: r.status, b };
  };
}

const SLIP = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const tenant = jar();
const admin = jar();

const u = "xfer" + Date.now();
const su = await tenant("/api/signup", { method: "POST", body: JSON.stringify({ businessName: "Xfer " + u, branchName: "main", ownerName: "t", username: u, pin: "1234" }) });
A(su.status === 200, "signup tenant (trial)");

const bill0 = await tenant("/api/billing");
A(bill0.b.transfer?.enabled === true && !!bill0.b.transfer.qr?.BASIC, "billing exposes transfer config + QR");

const sub = await tenant("/api/billing/transfer", { method: "POST", body: JSON.stringify({ plan: "BASIC", slip: SLIP, ref: "test-ref" }) });
A(sub.status === 200 && sub.b.payment?.status === "PENDING", "submit slip -> PENDING");

const dup = await tenant("/api/billing/transfer", { method: "POST", body: JSON.stringify({ plan: "BASIC", slip: SLIP }) });
A(dup.status === 409, "duplicate pending rejected (409)");

const bill1 = await tenant("/api/billing");
A(bill1.b.pendingPayment?.plan === "BASIC", "billing shows pendingPayment");
A(bill1.b.tenant.status === "TRIAL", "tenant still TRIAL before approval (not auto-activated)");

const badslip = await tenant("/api/billing/transfer", { method: "POST", body: JSON.stringify({ plan: "BASIC", slip: "notanimage" }) });
A(badslip.status === 400, "non-image slip rejected (400)");

// admin
const lg = await admin("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "superadmin", secret: process.env.SA_PIN || "1234" }) });
A(lg.status === 200, "superadmin login");
const pays = await admin("/api/admin/payments");
const mine = (pays.b.pending || []).find((p) => p.tenant.name === "Xfer " + u);
A(!!mine && !!mine.slipUrl, "admin sees pending payment + slip image");

const appr = await admin(`/api/admin/payments/${mine.id}`, { method: "PATCH", body: JSON.stringify({ action: "approve" }) });
A(appr.status === 200 && appr.b.status === "APPROVED", "admin approve");

const bill2 = await tenant("/api/billing");
A(bill2.b.tenant.status === "ACTIVE" && bill2.b.tenant.plan === "BASIC", "tenant ACTIVE on BASIC after approval");
A(!bill2.b.pendingPayment, "no pending after approval");
A((bill2.b.invoices || []).some((iv) => iv.status === "PAID" && iv.amount === 590), "PAID invoice 590 recorded");

const reReview = await admin(`/api/admin/payments/${mine.id}`, { method: "PATCH", body: JSON.stringify({ action: "reject" }) });
A(reReview.status === 409, "re-review of approved payment blocked (409)");

console.log(`\n${fail === 0 ? "ALL TRANSFER CHECKS PASSED" : fail + " FAILED"} (${pass} ok)`);
process.exit(fail === 0 ? 0 : 1);

// SaaS flow: signup -> tenant isolation -> plan limit -> super-admin suspend -> billing.
const BASE = process.env.BASE || "http://localhost:3000";
let cookie = "";
async function call(p, o = {}) {
  const r = await fetch(BASE + p, { ...o, headers: { "Content-Type": "application/json", cookie, ...(o.headers || {}) }, redirect: "manual" });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  let b = null; try { b = await r.json(); } catch {}
  return { status: r.status, b };
}
function A(c, m) { if (!c) { console.error("FAIL: " + m); process.exit(1); } console.log("OK: " + m); }
const login = (u) => call("/api/auth/login", { method: "POST", body: JSON.stringify({ username: u, secret: "1234" }) });

(async () => {
  // 1. signup a new tenant (14-day trial), auto-logged-in as its owner
  const uniq = "shop" + Math.floor(Math.random() * 1e6);
  const su = await call("/api/signup", { method: "POST", body: JSON.stringify({ businessName: "ร้านทดสอบ " + uniq, branchName: "สาขาหลัก", ownerName: "เจ้าของ", username: uniq, pin: "1234" }) });
  A(su.status === 200 && su.b.ok, "signup new tenant (trial)");
  A((await call("/api/dashboard")).status === 200, "new tenant can use the app (trial active)");

  // 2. tenant isolation: owner sees only their own 1 branch
  const br = (await call("/api/branches")).b;
  A(br.canSwitch && br.branches.length === 1, `tenant isolation - sees only own branch (${br.branches.length})`);

  // 3. plan limit: TRIAL allows 5 users (owner=1). Create until blocked.
  let created = 1, blocked = false;
  for (let i = 2; i <= 7; i++) {
    const r = await call("/api/users", { method: "POST", body: JSON.stringify({ username: `${uniq}_u${i}`, fullName: "Staff " + i, roleCode: "CASHIER", pin: "1234" }) });
    if (r.status === 200) created++;
    else if (r.status === 403) { blocked = true; break; }
  }
  A(created === 5 && blocked, `plan limit enforced (created ${created} users then 403)`);

  // 4. super-admin manages tenants
  await login("superadmin");
  const adm = (await call("/api/admin/tenants")).b;
  A(adm.metrics.total >= 2 && adm.tenants.some((t) => t.name.includes(uniq)), "super-admin lists all tenants + metrics");
  const mine = adm.tenants.find((t) => t.name.includes(uniq));
  A((await call(`/api/admin/tenants/${mine.id}`, { method: "PATCH", body: JSON.stringify({ status: "SUSPENDED" }) })).status === 200, "super-admin suspends tenant");

  // 5. suspended tenant blocked: app pages redirect to /billing + branch APIs 402
  cookie = "";
  await login(uniq);
  const page = await call("/dashboard");
  A(page.status === 307, "suspended tenant: app page redirects (to /billing)");
  A((await call("/api/branch-settings")).status === 402, "suspended tenant: branch API blocked (402)");

  // 6. billing: owner subscribes -> active again
  const bill = await call("/api/billing");
  A(bill.status === 200 && bill.b.tenant, "suspended owner can reach billing");
  A((await call("/api/billing", { method: "POST", body: JSON.stringify({ plan: "PRO" }) })).status === 200, "subscribe PRO (charged) -> active");
  A((await call("/api/dashboard")).status === 200, "tenant active again after payment");

  // 7. auto-renew cron: super-admin backdates the period so it's due, cron charges the saved card (mock) and extends
  await login("superadmin");
  await call(`/api/admin/tenants/${mine.id}`, { method: "PATCH", body: JSON.stringify({ extendDays: -40 }) });
  A((await call("/api/cron/renew")).status === 401, "cron rejects request without CRON_SECRET bearer");
  const cron = await call("/api/cron/renew", { headers: { authorization: `Bearer ${process.env.CRON_SECRET || ""}` } });
  A(cron.status === 200 && cron.b.renewed >= 1, `auto-renew cron renews due subscription (renewed ${cron.b?.renewed})`);

  // 8. webhook endpoint reachable (no-op/ignored in mock mode - cannot verify without platform keys)
  const wh = await call("/api/webhooks/omise", { method: "POST", body: JSON.stringify({ key: "charge.complete", data: { id: "chrg_test_x" } }) });
  A(wh.status === 200, "omise webhook endpoint reachable");

  console.log("\nALL SAAS SMOKE TESTS PASSED");
})();

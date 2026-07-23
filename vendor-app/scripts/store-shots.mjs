// Play Store phone screenshots for PkPos v1.4.
// 540x960 @2x -> 1080x1920, exactly 9:16 and the standard Play phone size. The previous set used
// 600x1067, which rasterises to 1200x2134 = 0.56232 — a hair taller than 9:16 (0.5625) and so
// outside the ratio Play accepts. Keep the width under the app's 640px sm: breakpoint so the
// phone layout (bottom-sheet cart) is what gets captured.
// Setup data is written straight into IndexedDB after the app has created the schema, so the
// screenshots only ever drive the UI for the thing they are showing.
// Playwright is not a vendor-app dependency; this resolves up to the repo root's node_modules,
// where the SaaS app's e2e setup already installs it. Run `npx playwright install chromium` once.
//
//   npm run dev                          # in vendor-app, must be serving on :5180
//   node scripts/store-shots.mjs [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const dir = process.argv[2] ?? "C:/Users/Atlast/Downloads/pkpos-screenshots";
mkdirSync(dir, { recursive: true });

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
let n = 0;
const shot = async (name) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(600);
  // Capture #root rather than the viewport: headless Chromium's viewport raster leaves a ghost
  // copy of the bottom nav painted near the top of a freshly switched tab. The DOM only ever has
  // one <nav> (checked), so it is a compositor artifact, and element capture does not show it.
  // #root fills the viewport, so the output geometry is identical.
  await page.locator("#root").screenshot({ path: `${dir}/${String(++n).padStart(2, "0")}_${name}.png` });
  console.log(`  ${n} ${name}`);
};
const tap = (name) => page.getByRole("button", { name, exact: true }).click();
const wait = (ms) => page.waitForTimeout(ms);

await page.goto("http://localhost:5180", { waitUntil: "networkidle" });
await wait(1800); // let ensureSeed() finish creating the demo menu

// ---- seed a member and a promo directly, then reload so the app reads them ----
await page.evaluate(async () => {
  const db = await new Promise((res) => {
    const r = indexedDB.open("pkpos");
    r.onsuccess = () => res(r.result);
  });
  const put = (store, value) =>
    new Promise((res) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = res;
    });
  await put("customers", {
    id: "shot-c1",
    name: "คุณสมชาย",
    phone: "0812345678",
    points: 48,
    spent: 3250,
    ts: Date.now(),
  });
  await put("promos", {
    id: "shot-p1",
    name: "ลดเที่ยง 10%",
    type: "percent",
    value: 10,
    minSpend: 100,
    active: true,
  });
});
// settings uses an out-of-line key, so set shopName through its own transaction
await page.evaluate(async () => {
  const db = await new Promise((res) => {
    const r = indexedDB.open("pkpos");
    r.onsuccess = () => res(r.result);
  });
  await new Promise((res) => {
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put("ร้านป้าแดง", "shopName");
    tx.oncomplete = res;
  });
});
await page.reload({ waitUntil: "networkidle" });
await wait(1200);

// App.tsx reserves 60px under the nav for the AdMob banner on every tab except Sale.
// On web the banner is a no-op, so that space photographs as an empty white strip that reads
// as a layout bug. Collapse it for the capture only — the real device fills it with the ad.
await page.addStyleTag({ content: '.pb-\\[60px\\] { padding-bottom: 0 !important; }' });

// Open the shift BEFORE selling, so the shift card shows real takings instead of
// "ขายเงินสด ฿0" (correct, but it reads like a bug in a store listing).
await tap("สรุป");
await wait(600);
await page.getByRole("button", { name: "เปิดกะ" }).first().click();
await wait(500);
await page.locator(".fixed input").last().fill("500");
await wait(200);
await page.locator(".fixed").last().getByRole("button", { name: "เปิดกะ" }).click();
await wait(3500); // let the toast time out so it never lands in a screenshot
await tap("ขาย");
await wait(600);

console.log("capturing:");

// 1. Sale: menu grid + a filled cart bar
await page.getByText("ข้าวผัดหมู").click();
await page.getByText("ต้มยำกุ้ง").click();
await page.getByText("โค้ก").click();
await shot("sale");

// 2. Options sheet — the headline new feature
await page.getByText("ข้าวกะเพราหมู").click();
await wait(400);
await page.getByText("เผ็ดน้อย").click();
await page.getByText("ไข่ดาว").click();
await shot("options");
await page.getByRole("button", { name: /เพิ่มลงตะกร้า/ }).click();
await wait(400);

// 3. Member sheet with points on hand
await page.getByRole("button", { name: /รายการ$|รายการ / }).first().click(); // mobile cart bar
await wait(500);
await tap("สมาชิก");
await wait(500);
await page.getByText("คุณสมชาย").click();
await wait(300);
await tap("ใช้เต็ม");
await shot("member");
await tap("ใช้");
await wait(400);

// 4. Cart showing the promo + points breakdown
await tap("ส่วนลด");
await wait(400);
await page.getByRole("button", { name: /โปรโมชัน/ }).click();
await wait(300);
await page.getByRole("button", { name: /ลดเที่ยง/ }).click();
await shot("discount");

// 5. Paid confirmation with change and points earned.
// "คิดเงิน" exists on both the cart bar and the sheet footer, so scope to the open sheet.
const sheet = () => page.locator(".fixed").last();
await sheet().getByRole("button", { name: "คิดเงิน", exact: true }).click();
await wait(600);
await sheet().getByRole("button", { name: /^฿\d/ }).last().click(); // a quick-cash chip
await wait(300);
await sheet().getByRole("button", { name: "ยืนยัน", exact: true }).click();
await shot("paid");
await tap("รายการใหม่");
await wait(400);

// 6. Menu list: option counts and stock
await tap("เมนู");
await shot("menu");

// 7. Summary: KPIs + the shift card, now carrying the sale
await tap("สรุป");
await wait(800);
await shot("summary");

// 8. Report breakdowns further down the same screen.
// The scroller is the screen's own container, not the page, so scroll it directly.
await page.locator("main div.overflow-y-auto").first().evaluate((el) => el.scrollTo({ top: 620 }));
await shot("reports");

await b.close();
console.log(`done -> ${dir}`);

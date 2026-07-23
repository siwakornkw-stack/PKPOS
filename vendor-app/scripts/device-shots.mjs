// Play Store phone screenshots captured from a real Android runtime, so they carry the system
// status bar and gesture bar that a browser capture cannot produce.
//
// The app's WebView is driven over CDP (debug builds expose a devtools socket) but every frame is
// grabbed with `adb screencap`, not a CDP screenshot — that is what keeps the Android chrome in.
// Playwright cannot drive this target: Android WebView answers "Browser context management is not
// supported" to connectOverCDP, so this talks raw CDP Runtime.evaluate over the page socket.
//
//   adb shell wm size 1080x1920 && adb shell wm density 440
//   adb shell svc power stayon true            # CDP sends no touch events, so the screen would
//                                              # sleep, background the app and get it killed
//   adb shell pm clear com.pkpos.vendor        # deterministic: a shift left open by an earlier
//                                              # run turns the "เปิดกะ" button into "ปิดกะ"
//   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
//   adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.pkpos.vendor)
//   node scripts/device-shots.mjs [outDir]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const dir = process.argv[2] ?? "C:/Users/Atlast/Downloads/pkpos-device-shots";
const ADB = "C:/Users/Atlast/android-sdk/platform-tools/adb.exe";
mkdirSync(dir, { recursive: true });

let ws;
const pending = new Map();
let msgId = 0;

// Reconnectable: a reload destroys the execution context and the old page target stops answering,
// so the caller re-attaches instead of waiting forever on a reply that will never come.
async function connect() {
  const targets = await (await fetch("http://localhost:9222/json/list")).json();
  const target = targets.find((t) => t.type === "page" && t.url.includes("localhost"));
  if (!target) throw new Error("PkPos WebView not found on :9222 — is the app running and forwarded?");
  pending.clear();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    pending.get(m.id)?.(m);
    pending.delete(m.id);
  });
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
}

const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++msgId;
    const timer = setTimeout(() => {
      pending.delete(id);
      rej(new Error(`CDP timeout: ${method}`));
    }, 30000);
    pending.set(id, (m) => {
      clearTimeout(timer);
      res(m);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });

// Every expression runs inside an async IIFE so steps can await their own settling.
async function run(body, label = body.trim().slice(0, 48).replace(/\s+/g, " ")) {
  process.stdout.write(`    · ${label}\n`);
  const m = await send("Runtime.evaluate", {
    expression: `(async () => { ${body} })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const err = m.result?.exceptionDetails;
  if (err) throw new Error(err.exception?.description ?? err.text);
  return m.result?.result?.value;
}

// Helpers injected once, then reused by every step. Exact-match matters: "ใช้" must not hit "ใช้เต็ม".
const HELPERS = `
  window.__t = (ms) => new Promise(r => setTimeout(r, ms));
  window.__btn = (txt) => [...document.querySelectorAll('button')].find(b => b.innerText.trim().includes(txt));
  window.__top = () => [...document.querySelectorAll('.fixed')].pop();
  window.__in = (txt) => [...window.__top().querySelectorAll('button')].find(b => b.innerText.trim().includes(txt));
  window.__exact = (txt) => [...window.__top().querySelectorAll('button')].find(b => b.innerText.trim() === txt);
  window.__starts = (txt) => [...window.__top().querySelectorAll('button')].find(b => b.innerText.trim().startsWith(txt));
  // Menu tiles are buttons; matching divs too would return the inner text node, whose click does nothing.
  window.__text = (txt) => [...document.querySelectorAll('button')].find(b => b.innerText.trim().startsWith(txt));
  window.__set = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); };
`;

let n = 0;
async function shot(name) {
  await run(`await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); await window.__t(700);`);
  const png = execFileSync(ADB, ["exec-out", "screencap", "-p"], { maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(`${dir}/${String(++n).padStart(2, "0")}_${name}.png`, png);
  console.log(`  ${n} ${name} (${Math.round(png.length / 1024)}KB)`);
}

await connect();
await run(HELPERS);

// Stub AdMob at the Capacitor bridge. Leaving the Sale tab calls showBanner(), and the SDK's
// binder chatter reliably got this process killed mid-capture ("excessive binder traffic during
// cached" in logcat) — and a live ad has no business in a store listing anyway. Every plugin call
// funnels through nativePromise/toNative, so intercepting there catches the already-bound proxy
// that ads.ts imported. This is what keeps the app alive; the device does not need to be offline
// (airplane mode also works but leaves its icon in the captured status bar).
await run(
  `const cap = window.Capacitor;
   const np = cap.nativePromise.bind(cap), tn = cap.toNative.bind(cap);
   cap.nativePromise = (p, m, o) => (p === 'AdMob' ? Promise.resolve({}) : np(p, m, o));
   cap.toNative = (p, m, o, s) => (p === 'AdMob' ? undefined : tn(p, m, o, s));`,
  "stub AdMob bridge"
);

// App.tsx still reserves 60px under the nav for the banner on every tab except Sale. With the SDK
// stubbed that strip is empty and photographs as a layout bug, so collapse it for the capture.
await run(
  `const s = document.createElement('style');
   s.textContent = '.pb-\\\\[60px\\\\] { padding-bottom: 0 !important; }';
   document.head.appendChild(s);`,
  "collapse ad spacer"
);

// ---- seed the same demo data the web capture uses ----
// No reload: Sale re-reads promos and shopName in its mount effect and MemberSheet lists customers
// on its own mount, so seeding while another tab is showing is enough. (A location.reload() here
// killed the WebView process on the emulator.)
await run(`
  const db = await new Promise(res => { const r = indexedDB.open('pkpos'); r.onsuccess = () => res(r.result); });
  const put = (store, value, key) => new Promise(res => {
    const tx = db.transaction(store, 'readwrite');
    key === undefined ? tx.objectStore(store).put(value) : tx.objectStore(store).put(value, key);
    tx.oncomplete = res;
  });
  await put('customers', { id:'shot-c1', name:'คุณสมชาย', phone:'0812345678', points:48, spent:3250, ts:Date.now() });
  await put('promos', { id:'shot-p1', name:'ลดเที่ยง 10%', type:'percent', value:10, minSpend:100, active:true });
  await put('settings', 'ร้านป้าแดง', 'shopName');
`);

// Open the shift before selling so the drawer figures are not all zero.
// Waits are roomier than the browser script: the emulator renders each transition slower.
await run(`window.__btn('สรุป').click(); await window.__t(2200);
  window.__btn('เปิดกะ').click(); await window.__t(1600);
  window.__set(window.__top().querySelector('input'), '500'); await window.__t(700);
  window.__in('เปิดกะ').click(); await window.__t(4200);
  window.__btn('ขาย').click(); await window.__t(1800);`);

console.log("capturing:");

await run(`window.__text('ข้าวผัดหมู').click(); await window.__t(540);
  window.__text('ต้มยำกุ้ง').click(); await window.__t(540);
  window.__text('โค้ก').click(); await window.__t(900);`);
await shot("sale");

await run(`window.__text('ข้าวกะเพราหมู').click(); await window.__t(1260);
  window.__in('เผ็ดน้อย').click(); await window.__t(450);
  window.__in('ไข่ดาว').click(); await window.__t(720);`);
await shot("options");

await run(`window.__in('เพิ่มลงตะกร้า').click(); await window.__t(1260);
  window.__btn('รายการ').click(); await window.__t(1440);
  window.__exact('สมาชิก').click(); await window.__t(1440);
  window.__starts('คุณสมชาย').click(); await window.__t(720);
  window.__exact('ใช้เต็ม').click(); await window.__t(900);`);
await shot("member");

await run(`window.__exact('ใช้').click(); await window.__t(1260);
  window.__exact('ส่วนลด').click(); await window.__t(1260);
  window.__in('โปรโมชัน').click(); await window.__t(900);
  window.__in('ลดเที่ยง').click(); await window.__t(1260);
  // Bring the modifier line into frame — at this density the sheet's list only shows three rows,
  // and the one carrying "เผ็ดน้อย, ไข่ดาว" is the whole point of the shot.
  const list = [...window.__top().querySelectorAll('div')].find(d => d.scrollHeight > d.clientHeight + 20);
  if (list) list.scrollTo({ top: list.scrollHeight });
  await window.__t(700);`);
await shot("discount");

await run(`window.__exact('คิดเงิน').click(); await window.__t(1620);
  [...window.__top().querySelectorAll('button')].filter(b => /^฿\\d/.test(b.innerText.trim())).pop().click();
  await window.__t(900);
  window.__exact('ยืนยัน').click(); await window.__t(1620);`);
await shot("paid");

await run(`window.__in('รายการใหม่').click(); await window.__t(1260);
  window.__btn('เมนู').click(); await window.__t(1620);`);
await shot("menu");

await run(`window.__btn('สรุป').click(); await window.__t(1980);`);
await shot("summary");

await run(`document.querySelector('main div.overflow-y-auto').scrollTo({ top: 620 }); await window.__t(1080);`);
await shot("reports");

ws.close();
console.log(`done -> ${dir}`);

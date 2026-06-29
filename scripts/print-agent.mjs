#!/usr/bin/env node
// PkPos on-site print-agent.
// Run this on any always-on machine inside the shop's network (PC / Raspberry Pi / old laptop)
// that can reach your ESC/POS network printer(s). It polls the PkPos server for queued print and
// cash-drawer jobs and sends them to the printer over TCP (port 9100). Needed when PkPos is hosted
// on the cloud (the cloud server can't reach a LAN printer directly).
//
// Setup:
//   1. In PkPos: ตั้งค่า > เครื่องพิมพ์ -> set printer host = the printer's LAN IP; switch print mode to "agent"; copy the agent token.
//   2. On the shop machine (Node 18+):
//        SERVER=https://your-pkpos-url  TOKEN=your-agent-token  node print-agent.mjs
//      (or: node print-agent.mjs https://your-pkpos-url your-agent-token)
//
// No PkPos source needed - this single file is the whole agent.
import net from "node:net";

const SERVER = (process.env.SERVER || process.argv[2] || "").replace(/\/$/, "");
const TOKEN = process.env.TOKEN || process.argv[3] || "";
const POLL_MS = Number(process.env.POLL_MS || 2000);

if (!SERVER || !TOKEN) {
  console.error("usage: SERVER=<pkpos-url> TOKEN=<agent-token> node print-agent.mjs");
  process.exit(1);
}

function sendToPrinter(host, port, buf) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(port, host, () => sock.write(buf, () => sock.end()));
    sock.setTimeout(5000, () => { sock.destroy(); reject(new Error("printer timeout")); });
    sock.on("end", resolve);
    sock.on("error", reject);
  });
}

async function poll() {
  let jobs;
  try {
    const r = await fetch(`${SERVER}/api/print/agent?token=${encodeURIComponent(TOKEN)}`);
    if (r.status === 401) { console.error("unauthorized - check TOKEN / print mode = agent"); return; }
    if (!r.ok) { console.error("poll failed:", r.status); return; }
    ({ jobs } = await r.json());
  } catch (e) {
    console.error("poll error:", e?.message || e);
    return;
  }
  for (const j of jobs || []) {
    let ok = true, error = null;
    try {
      await sendToPrinter(j.host, j.port, Buffer.from(j.payload, "base64"));
      console.log(new Date().toISOString(), "printed job", j.id, j.kind, "->", `${j.host}:${j.port}`);
    } catch (e) {
      ok = false; error = String(e?.message || e);
      console.error(new Date().toISOString(), "job", j.id, "FAILED:", error);
    }
    await fetch(`${SERVER}/api/print/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: TOKEN, jobId: j.id, ok, error }),
    }).catch(() => {});
  }
}

console.log("PkPos print-agent polling", SERVER, "every", POLL_MS, "ms");
setInterval(() => poll(), POLL_MS);
poll();

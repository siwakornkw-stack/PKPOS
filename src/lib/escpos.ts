import net from "net";
import { baht, fmtDateTime } from "@/lib/format";

// Minimal ESC/POS command builder for 58/80mm thermal printers.
// Returns a raw Buffer of printer bytes (no library dependency).

// Open cash drawer (kick): ESC p m t1 t2
export const DRAWER_KICK = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);

// Block obvious SSRF targets (loopback + link-local incl. cloud metadata 169.254.169.254).
// LAN/RFC1918 hosts are allowed - that's where real printers live.
export function isBlockedHost(h: string): boolean {
  const host = h.trim().toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host.startsWith("[")) return true;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 127 || (a === 169 && b === 254)) return true;
  }
  return false;
}

// Send a raw buffer to a network ESC/POS printer over TCP (port 9100).
export function sendToPrinter(host: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(port, host, () => sock.write(data, () => sock.end()));
    sock.setTimeout(5000, () => { sock.destroy(); reject(new Error("printer timeout")); });
    sock.on("end", () => resolve());
    sock.on("error", reject);
  });
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const INIT = Buffer.from([ESC, 0x40]); // initialize
const ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]);
const ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);
const BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);
const DOUBLE_ON = Buffer.from([GS, 0x21, 0x11]); // double width + height
const DOUBLE_OFF = Buffer.from([GS, 0x21, 0x00]);
const FEED = Buffer.from([LF]);
const CUT = Buffer.from([GS, 0x56, 0x00]); // full cut

// Characters across a 58mm receipt at the default font.
const WIDTH = 32;

function text(s: string): Buffer {
  // strip ESC/POS control bytes (0x00-0x1F, 0x7F) from user-supplied text (names, notes) so a
  // crafted value can't inject printer commands (drawer-kick, cut). Real control sequences are
  // emitted as their own buffers (INIT, FEED, ...), never through here.
  return Buffer.from(s.replace(/[\x00-\x1f\x7f]/g, " "), "utf8");
}

function line(s = ""): Buffer {
  return Buffer.concat([text(s), FEED]);
}

function center(s: string): Buffer {
  return Buffer.concat([ALIGN_CENTER, line(s), ALIGN_LEFT]);
}

// "left ........... right" padded to WIDTH columns (ASCII-width approximation).
function pair(left: string, right: string): Buffer {
  const space = Math.max(1, WIDTH - left.length - right.length);
  return line(left + " ".repeat(space) + right);
}

function rule(): Buffer {
  return line("-".repeat(WIDTH));
}

function cut(): Buffer {
  return Buffer.concat([FEED, FEED, FEED, CUT]);
}

type PrintOrder = {
  docNo: string;
  orderType: string;
  subtotal: number;
  discount: number;
  pointsDiscount?: number;
  serviceCharge: number;
  taxAmount: number;
  netAmount: number;
  paidAt?: Date | null;
  createdAt: Date;
  queueNo?: number | null;
  branch: { name: string };
  table?: { code: string } | null;
  items: { qty: number; name: string; lineAmount: number; note?: string | null; station?: string | null }[];
  payments?: { method: string; amount: number; received: number; change: number }[];
};
type PrintItem = PrintOrder["items"][number];

const TYPE: Record<string, string> = {
  DINE_IN: "ทานที่ร้าน",
  TAKEAWAY: "กลับบ้าน",
  DELIVERY: "เดลิเวอรี",
};
const METHOD: Record<string, string> = {
  CASH: "เงินสด",
  QR: "QR พร้อมเพย์",
  CARD: "บัตรเครดิต",
};

export function buildReceiptBuffer(order: PrintOrder): Buffer {
  const chunks: Buffer[] = [INIT, ALIGN_LEFT];

  chunks.push(ALIGN_CENTER, BOLD_ON, DOUBLE_ON, line(order.branch.name), DOUBLE_OFF, BOLD_OFF, ALIGN_LEFT);

  chunks.push(rule());
  chunks.push(pair("เลขที่บิล", order.docNo));
  chunks.push(pair("วันที่", fmtDateTime(order.paidAt ?? order.createdAt)));
  chunks.push(pair("ประเภท", TYPE[order.orderType] ?? order.orderType));
  if (order.table) chunks.push(pair("โต๊ะ", order.table.code));
  if (order.queueNo) chunks.push(pair("คิว", String(order.queueNo)));
  chunks.push(rule());

  for (const i of order.items) {
    chunks.push(pair(`${i.qty}x ${i.name}`, baht(i.lineAmount)));
  }
  chunks.push(rule());

  chunks.push(pair("ยอดรวม", baht(order.subtotal)));
  if (order.discount > 0) chunks.push(pair("ส่วนลด", `-${baht(order.discount)}`));
  if ((order.pointsDiscount ?? 0) > 0) chunks.push(pair("ส่วนลดแต้ม", `-${baht(order.pointsDiscount ?? 0)}`));
  if (order.serviceCharge > 0) chunks.push(pair("Service", baht(order.serviceCharge)));
  chunks.push(pair("VAT", baht(order.taxAmount)));

  chunks.push(BOLD_ON, pair("สุทธิ", baht(order.netAmount)), BOLD_OFF);

  // one line per tender (split bills have several); skip refund rows (negative amount)
  const pays = (order.payments ?? []).filter((p) => p.amount > 0);
  if (pays.length) {
    chunks.push(rule());
    for (const p of pays) {
      chunks.push(pair(METHOD[p.method] ?? p.method, baht(p.received)));
      if (p.method === "CASH" && p.change > 0) chunks.push(pair("เงินทอน", baht(p.change)));
    }
  }

  chunks.push(FEED, center("ขอบคุณที่ใช้บริการ"), center("*** PkPos ***"));
  chunks.push(cut());

  return Buffer.concat(chunks);
}

// Provisional bill (เช็คบิล) - same layout as the receipt but flagged UNPAID, no tender lines.
export function buildPreBillBuffer(order: PrintOrder): Buffer {
  const chunks: Buffer[] = [INIT, ALIGN_LEFT];
  chunks.push(ALIGN_CENTER, BOLD_ON, DOUBLE_ON, line(order.branch.name), DOUBLE_OFF, BOLD_OFF, ALIGN_LEFT);
  chunks.push(ALIGN_CENTER, BOLD_ON, line("** ใบแจ้งยอด (ยังไม่ชำระ) **"), BOLD_OFF, ALIGN_LEFT);
  chunks.push(rule());
  chunks.push(pair("เลขที่บิล", order.docNo));
  chunks.push(pair("วันที่", fmtDateTime(order.createdAt)));
  chunks.push(pair("ประเภท", TYPE[order.orderType] ?? order.orderType));
  if (order.table) chunks.push(pair("โต๊ะ", order.table.code));
  chunks.push(rule());
  for (const i of order.items) chunks.push(pair(`${i.qty}x ${i.name}`, baht(i.lineAmount)));
  chunks.push(rule());
  chunks.push(pair("ยอดรวม", baht(order.subtotal)));
  if (order.discount > 0) chunks.push(pair("ส่วนลด", `-${baht(order.discount)}`));
  if ((order.pointsDiscount ?? 0) > 0) chunks.push(pair("ส่วนลดแต้ม", `-${baht(order.pointsDiscount ?? 0)}`));
  if (order.serviceCharge > 0) chunks.push(pair("Service", baht(order.serviceCharge)));
  chunks.push(pair("VAT", baht(order.taxAmount)));
  chunks.push(BOLD_ON, pair("ยอดที่ต้องชำระ", baht(order.netAmount)), BOLD_OFF);
  chunks.push(FEED, center("กรุณาชำระเงินที่เคาน์เตอร์"));
  chunks.push(cut());
  return Buffer.concat(chunks);
}

export interface ZReport {
  date: string;
  summary: { orderCount: number; grossSales: number; discount: number; serviceCharge: number; tax: number; netSales: number; cost: number; grossProfit: number; voidCount: number; refundCount: number; refundAmount: number };
  byPayment: { method: string; amount: number }[];
  byCategory: { name: string; amount: number }[];
}

// Daily X/Z sales summary as a thermal ticket.
export function buildZReportBuffer(r: ZReport, branchName: string): Buffer {
  const chunks: Buffer[] = [INIT, ALIGN_LEFT];
  chunks.push(ALIGN_CENTER, BOLD_ON, DOUBLE_ON, line(branchName), DOUBLE_OFF, line("รายงานยอดขายประจำวัน"), BOLD_OFF, ALIGN_LEFT);
  chunks.push(pair("วันที่", r.date));
  chunks.push(rule());
  chunks.push(pair("จำนวนบิล", String(r.summary.orderCount)));
  chunks.push(pair("ยอดขายรวม", baht(r.summary.grossSales)));
  if (r.summary.discount > 0) chunks.push(pair("ส่วนลด", `-${baht(r.summary.discount)}`));
  if (r.summary.serviceCharge > 0) chunks.push(pair("Service charge", baht(r.summary.serviceCharge)));
  chunks.push(pair("VAT", baht(r.summary.tax)));
  chunks.push(BOLD_ON, pair("ยอดสุทธิ", baht(r.summary.netSales)), BOLD_OFF);
  chunks.push(pair("ต้นทุน", baht(r.summary.cost)));
  chunks.push(pair("กำไรขั้นต้น", baht(r.summary.grossProfit)));
  if (r.summary.refundCount > 0) chunks.push(pair(`คืนเงิน (${r.summary.refundCount})`, `-${baht(r.summary.refundAmount)}`));
  if (r.summary.voidCount > 0) chunks.push(pair("ยกเลิก (บิล)", String(r.summary.voidCount)));
  if (r.byPayment.length) {
    chunks.push(rule(), BOLD_ON, line("แยกตามวิธีชำระ"), BOLD_OFF);
    for (const p of r.byPayment) chunks.push(pair(METHOD[p.method] ?? p.method, baht(p.amount)));
  }
  if (r.byCategory.length) {
    chunks.push(rule(), BOLD_ON, line("แยกตามหมวด"), BOLD_OFF);
    for (const c of r.byCategory) chunks.push(pair(c.name, baht(c.amount)));
  }
  chunks.push(FEED, center(`พิมพ์ ${fmtDateTime(new Date())}`), cut());
  return Buffer.concat(chunks);
}

// items defaults to the whole order; pass a station-filtered subset for per-station printers.
export function buildKitchenTicketBuffer(order: PrintOrder, items: PrintItem[] = order.items): Buffer {
  const chunks: Buffer[] = [INIT, ALIGN_LEFT];

  const head = order.table ? `โต๊ะ ${order.table.code}` : order.queueNo ? `คิว ${order.queueNo}` : TYPE[order.orderType] ?? order.orderType;
  chunks.push(ALIGN_CENTER, BOLD_ON, DOUBLE_ON, line(head), DOUBLE_OFF, BOLD_OFF, ALIGN_LEFT);

  chunks.push(pair("เลขที่บิล", order.docNo));
  chunks.push(pair("เวลา", fmtDateTime(order.createdAt)));
  chunks.push(rule());

  for (const i of items) {
    chunks.push(BOLD_ON, line(`${i.qty} x ${i.name}`), BOLD_OFF);
    if (i.note) chunks.push(line(`   * ${i.note}`));
  }

  chunks.push(cut());

  return Buffer.concat(chunks);
}

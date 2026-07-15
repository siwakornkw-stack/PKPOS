import { useEffect, useMemo, useState } from "react";
import { FileDown, Save, Upload } from "lucide-react";
import type { Order } from "../types";
import { ordersBetween, listItems, listOrders, deleteOrder } from "../db";
import { baht } from "../lib/format";
import { round2 } from "../lib/totals";
import { showInterstitial } from "../lib/ads";
import { ordersToCsv, toBackup, parseBackup, saveText, pickTextFile, restoreBackup } from "../lib/backup";

const fileStamp = () => new Date().toLocaleDateString("en-CA");
const DAY = 86400000;

type Period = "today" | "yesterday" | "7d" | "30d";
const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "วันนี้" },
  { key: "yesterday", label: "เมื่อวาน" },
  { key: "7d", label: "7 วัน" },
  { key: "30d", label: "30 วัน" },
];

function rangeFor(period: Period, now: number): [number, number] {
  const d = new Date(now);
  const startToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (period === "today") return [startToday, now + 1];
  if (period === "yesterday") return [startToday - DAY, startToday];
  if (period === "7d") return [startToday - 6 * DAY, now + 1];
  return [startToday - 29 * DAY, now + 1];
}

function billStamp(ts: number, period: Period): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  if (period === "today") return time;
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" }) + " " + time;
}

export default function Summary() {
  const [period, setPeriod] = useState<Period>("today");
  const [orders, setOrders] = useState<Order[]>([]);
  const [note, setNote] = useState<string | null>(null);

  function reload() {
    const [from, to] = rangeFor(period, Date.now());
    ordersBetween(from, to).then((o) => setOrders(o.sort((a, b) => b.ts - a.ts)));
  }
  useEffect(reload, [period]);

  const count = orders.length;
  const total = round2(orders.reduce((s, o) => s + o.total, 0));

  const bestSellers = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of orders) {
      for (const l of o.lines) {
        const cur = map.get(l.name) || { name: l.name, qty: 0, revenue: 0 };
        cur.qty += l.qty;
        cur.revenue += l.price * l.qty;
        map.set(l.name, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [orders]);

  function flash(msg: string) {
    setNote(msg);
    setTimeout(() => setNote(null), 3000);
  }

  async function closeDay() {
    await showInterstitial(); // natural end-of-day break — no-op on web
    flash(`ปิดยอดวันแล้ว · ${count} บิล · ${baht(total)}`);
  }

  async function exportCsv() {
    const all = await listOrders();
    await saveText(`pkpos-sales-${fileStamp()}.csv`, ordersToCsv(all), "text/csv");
  }

  async function backup() {
    const [items, all] = await Promise.all([listItems(), listOrders()]);
    await saveText(`pkpos-backup-${fileStamp()}.json`, toBackup(items, all), "application/json");
  }

  async function voidBill(o: Order) {
    if (!confirm(`ลบบิลนี้? (${baht(o.total)})`)) return;
    await deleteOrder(o.id);
    reload();
    flash(`ลบบิลแล้ว · ${baht(o.total)}`);
  }

  async function restore() {
    const text = await pickTextFile();
    if (!text) return;
    try {
      const b = parseBackup(text);
      await restoreBackup(b);
      reload();
      flash(`กู้คืนแล้ว · ${b.items.length} เมนู · ${b.orders.length} บิล`);
    } catch (e) {
      flash(`กู้คืนล้มเหลว: ${(e as Error).message}`);
    }
  }

  const actionBtn =
    "flex flex-col items-center gap-1 py-3 rounded-xl bg-white border border-slate-100 shadow-sm text-slate-700 text-xs active:scale-95 transition";

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center justify-between p-3 bg-white border-b sticky top-0">
        <h1 className="font-semibold text-lg">สรุปยอดขาย</h1>
        {period === "today" && (
          <button
            onClick={closeDay}
            disabled={count === 0}
            className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm disabled:opacity-40"
          >
            ปิดยอดวัน
          </button>
        )}
      </div>

      <div className="flex gap-2 p-3 pb-0 overflow-x-auto">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${
              period === p.key ? "bg-emerald-600 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="rounded-2xl bg-emerald-600 text-white p-4 shadow-sm">
          <div className="text-sm opacity-80">ยอดขาย</div>
          <div className="text-3xl font-bold mt-1">{baht(total)}</div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
          <div className="text-sm text-slate-500">จำนวนบิล</div>
          <div className="text-3xl font-bold mt-1">{count}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 px-3 pb-3">
        <button onClick={exportCsv} className={actionBtn}>
          <FileDown size={18} /> ส่งออก CSV
        </button>
        <button onClick={backup} className={actionBtn}>
          <Save size={18} /> สำรองข้อมูล
        </button>
        <button onClick={restore} className={actionBtn}>
          <Upload size={18} /> กู้คืน
        </button>
      </div>

      {bestSellers.length > 0 && (
        <>
          <div className="px-3 text-sm font-medium text-slate-600">เมนูขายดี</div>
          <div className="bg-white mt-1 divide-y">
            {bestSellers.map((b, i) => (
              <div key={b.name} className="flex items-center gap-3 px-3 py-2">
                <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 text-xs font-semibold flex items-center justify-center shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0 truncate">{b.name}</div>
                <div className="text-sm text-slate-500 shrink-0">{b.qty} ชิ้น</div>
                <div className="font-medium w-20 text-right shrink-0">{baht(b.revenue)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="px-3 text-sm font-medium text-slate-600 mt-3">รายการบิล</div>
      <div className="divide-y bg-white mt-1">
        {orders.map((o) => (
          <button
            key={o.id}
            onClick={() => voidBill(o)}
            className="w-full flex items-center justify-between px-3 py-2 text-left active:bg-slate-50"
          >
            <div className="text-sm text-slate-500">
              {billStamp(o.ts, period)}
              <span className="text-slate-400"> · {o.lines.reduce((s, l) => s + l.qty, 0)} ชิ้น</span>
              {o.method === "qr" && <span className="ml-2 text-xs text-emerald-600">QR</span>}
            </div>
            <div className="font-medium">{baht(o.total)}</div>
          </button>
        ))}
        {count === 0 && <div className="text-center text-slate-400 py-10">ไม่มีบิลในช่วงนี้</div>}
      </div>

      {note && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm shadow-lg">
          {note}
        </div>
      )}
    </div>
  );
}

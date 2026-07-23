import { useEffect, useMemo, useState } from "react";
import { FileDown, Save, Upload, Wallet, ArrowDownLeft, ArrowUpRight, RotateCcw, X, AlertTriangle } from "lucide-react";
import type { Item, Order, Shift, CashMove } from "../types";
import {
  ordersBetween,
  listItems,
  putItem,
  listOrders,
  saveOrder,
  getCustomer,
  putCustomer,
  openShift,
  putShift,
  putCashMove,
  movesForShift,
} from "../db";
import { baht } from "../lib/format";
import { round2 } from "../lib/totals";
import { showInterstitial } from "../lib/ads";
import { ordersToCsv, makeBackup, parseBackup, saveText, pickTextFile, restoreBackup } from "../lib/backup";
import { liveOrders, salesTotal, paymentMix, byCategory, hourly, bestSellers, lowStock } from "../lib/report";
import { expectedCash, variance, ordersInShift } from "../lib/shift";
import { restock } from "../lib/stock";
import { reverseOrder } from "../lib/points";

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
  const [items, setItems] = useState<Item[]>([]);
  const [shift, setShift] = useState<Shift | undefined>();
  const [moves, setMoves] = useState<CashMove[]>([]);
  const [openShiftOpen, setOpenShiftOpen] = useState(false);
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function reload() {
    const [from, to] = rangeFor(period, Date.now());
    ordersBetween(from, to).then((o) => setOrders(o.sort((a, b) => b.ts - a.ts)));
    listItems().then(setItems);
  }
  useEffect(reload, [period]);

  async function reloadShift() {
    const s = await openShift();
    setShift(s);
    setMoves(s ? await movesForShift(s.id) : []);
  }
  useEffect(() => {
    reloadShift();
  }, []);

  const live = useMemo(() => liveOrders(orders), [orders]);
  const count = live.length;
  const total = salesTotal(live);
  const mix = useMemo(() => paymentMix(live), [live]);
  const cats = useMemo(() => byCategory(live), [live]);
  const hours = useMemo(() => hourly(live), [live]);
  const sellers = useMemo(() => bestSellers(live), [live]);
  const low = useMemo(() => lowStock(items), [items]);

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
    await saveText(`pkpos-backup-${fileStamp()}.json`, await makeBackup(), "application/json");
  }

  // Soft void: the bill stays in the ledger (and in the CSV) but leaves every total, so a
  // mistake is traceable instead of vanishing. Everything the sale moved is moved back —
  // stock returns to the shelf and the member's points/spend are reversed from the values
  // recorded on the order.
  async function voidBill(o: Order) {
    if (o.voided) return;
    if (!confirm(`ยกเลิกบิลนี้? (${baht(o.total)})\nสต็อกและแต้มสมาชิกจะถูกคืน`)) return;
    await saveOrder({ ...o, voided: true });
    for (const changed of restock(items, o.lines)) await putItem(changed);
    if (o.customerId) {
      const c = await getCustomer(o.customerId);
      if (c) await putCustomer({ ...c, ...reverseOrder(c, o) });
    }
    reload();
    flash(`ยกเลิกบิลแล้ว · ${baht(o.total)}`);
  }

  async function restore() {
    const text = await pickTextFile();
    if (!text) return;
    try {
      const b = parseBackup(text);
      await restoreBackup(b);
      reload();
      reloadShift();
      flash(`กู้คืนแล้ว · ${b.items.length} เมนู · ${b.orders.length} บิล`);
    } catch (e) {
      flash(`กู้คืนล้มเหลว: ${(e as Error).message}`);
    }
  }

  async function doOpenShift(float: number) {
    await putShift({ id: crypto.randomUUID(), openTs: Date.now(), openFloat: float });
    setOpenShiftOpen(false);
    reloadShift();
    flash(`เปิดกะแล้ว · เงินตั้งต้น ${baht(float)}`);
  }

  async function doCloseShift(counted: number) {
    if (!shift) return;
    await putShift({ ...shift, closeTs: Date.now(), countedCash: counted });
    setCloseShiftOpen(false);
    reloadShift();
    const v = variance(counted, shiftExpected);
    flash(v === 0 ? "ปิดกะแล้ว · ตรงพอดี" : `ปิดกะแล้ว · ${v > 0 ? "เกิน" : "ขาด"} ${baht(Math.abs(v))}`);
  }

  async function addCash(amount: number, noteText: string) {
    if (!shift) return;
    await putCashMove({ id: crypto.randomUUID(), shiftId: shift.id, ts: Date.now(), amount, note: noteText });
    setCashOpen(false);
    reloadShift();
    flash(`${amount > 0 ? "เงินเข้า" : "เงินออก"} ${baht(Math.abs(amount))}`);
  }

  const shiftOrders = shift ? ordersInShift(orders, shift.openTs) : [];
  const shiftExpected = shift ? expectedCash(shift.openFloat, shiftOrders, moves) : 0;

  const actionBtn =
    "flex flex-col items-center gap-1 py-3 rounded-xl bg-white border border-slate-100 shadow-sm text-slate-700 text-xs active:scale-95 transition";

  return (
    <div className="h-full overflow-y-auto pb-4">
      <div className="flex items-center justify-between p-3 bg-white border-b sticky top-0 z-10">
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

      {/* Shift / cash drawer — the vendor's daily money reconciliation. */}
      <div className="px-3">
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet size={18} className="text-emerald-600" />
            <span className="font-medium">กะการขาย</span>
            {shift && (
              <span className="ml-auto text-xs text-slate-400">
                เปิด {new Date(shift.openTs).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          {shift ? (
            <>
              <div className="flex justify-between text-sm text-slate-500">
                <span>เงินตั้งต้น</span>
                <span>{baht(shift.openFloat)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-500">
                <span>ขายเงินสด</span>
                <span>{baht(salesTotal(liveOrders(shiftOrders).filter((o) => o.method !== "qr")))}</span>
              </div>
              {moves.length > 0 && (
                <div className="flex justify-between text-sm text-slate-500">
                  <span>เงินเข้า/ออก</span>
                  <span>{baht(round2(moves.reduce((s, m) => s + m.amount, 0)))}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold mt-1 pt-1 border-t">
                <span>ควรมีในลิ้นชัก</span>
                <span>{baht(shiftExpected)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button onClick={() => setCashOpen(true)} className="py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">
                  เงินเข้า/ออก
                </button>
                <button onClick={() => setCloseShiftOpen(true)} className="py-2.5 rounded-xl bg-slate-800 text-white text-sm font-medium">
                  ปิดกะ
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-3">เปิดกะเพื่อนับเงินในลิ้นชักตอนสิ้นวัน</p>
              <button onClick={() => setOpenShiftOpen(true)} className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium">
                เปิดกะ
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 p-3">
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

      {low.length > 0 && (
        <div className="px-3 pb-3">
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3">
            <div className="flex items-center gap-2 text-amber-800 font-medium text-sm mb-1">
              <AlertTriangle size={16} /> ของใกล้หมด
            </div>
            <div className="text-sm text-amber-900 space-y-0.5">
              {low.map((i) => (
                <div key={i.id} className="flex justify-between">
                  <span className="truncate">{i.name}</span>
                  <span className="shrink-0 font-medium">{(i.stock ?? 0) <= 0 ? "หมด" : `เหลือ ${i.stock}`}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {mix.length > 0 && <SliceCard title="ช่องทางชำระ" rows={mix} total={total} />}
      {cats.length > 0 && <SliceCard title="ยอดตามหมวด" rows={cats} total={cats.reduce((s, c) => s + c.amount, 0)} />}

      {count > 0 && <HourChart hours={hours} />}

      {sellers.length > 0 && (
        <>
          <div className="px-3 mt-3 text-sm font-medium text-slate-600">เมนูขายดี</div>
          <div className="bg-white mt-1 divide-y">
            {sellers.map((b, i) => (
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
            <div className={`text-sm ${o.voided ? "text-slate-300 line-through" : "text-slate-500"}`}>
              {billStamp(o.ts, period)}
              <span className="text-slate-400"> · {o.lines.reduce((s, l) => s + l.qty, 0)} ชิ้น</span>
              {o.method === "qr" && !o.voided && <span className="ml-2 text-xs text-emerald-600">QR</span>}
            </div>
            <div className="flex items-center gap-2">
              {o.voided && <RotateCcw size={13} className="text-slate-300" />}
              <span className={`font-medium ${o.voided ? "text-slate-300 line-through" : ""}`}>{baht(o.total)}</span>
            </div>
          </button>
        ))}
        {orders.length === 0 && <div className="text-center text-slate-400 py-10">ไม่มีบิลในช่วงนี้</div>}
      </div>

      {openShiftOpen && (
        <AmountModal
          title="เปิดกะ"
          label="เงินตั้งต้นในลิ้นชัก"
          confirmLabel="เปิดกะ"
          onClose={() => setOpenShiftOpen(false)}
          onConfirm={doOpenShift}
        />
      )}
      {closeShiftOpen && shift && (
        <AmountModal
          title="ปิดกะ"
          label="นับเงินในลิ้นชักได้เท่าไหร่"
          confirmLabel="ปิดกะ"
          expected={shiftExpected}
          onClose={() => setCloseShiftOpen(false)}
          onConfirm={doCloseShift}
        />
      )}
      {cashOpen && <CashMoveModal onClose={() => setCashOpen(false)} onConfirm={addCash} />}

      {note && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm shadow-lg z-30">
          {note}
        </div>
      )}
    </div>
  );
}

function SliceCard({ title, rows, total }: { title: string; rows: { name: string; amount: number; count: number }[]; total: number }) {
  return (
    <>
      <div className="px-3 mt-3 text-sm font-medium text-slate-600">{title}</div>
      <div className="bg-white mt-1 divide-y">
        {rows.map((r) => {
          // Guard the denominator: an all-zero period must not produce NaN width.
          const pct = total > 0 ? (r.amount / total) * 100 : 0;
          return (
            <div key={r.name} className="px-3 py-2">
              <div className="flex justify-between text-sm">
                <span className="truncate">{r.name}</span>
                <span className="shrink-0">
                  {baht(r.amount)} <span className="text-slate-400">({Math.round(pct)}%)</span>
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// Only the hours that actually traded, so a stall open 5 hours does not scroll through 24 empty bars.
function HourChart({ hours }: { hours: { hour: number; amount: number; count: number }[] }) {
  const active = hours.filter((h) => h.count > 0);
  if (active.length === 0) return null;
  const peak = Math.max(...active.map((h) => h.amount));
  return (
    <>
      <div className="px-3 mt-3 text-sm font-medium text-slate-600">ยอดตามชั่วโมง</div>
      <div className="bg-white mt-1 p-3 flex items-end gap-1 h-28 overflow-x-auto">
        {active.map((h) => (
          <div key={h.hour} className="flex-1 min-w-8 flex flex-col items-center justify-end h-full gap-1">
            <div className="text-[10px] text-slate-400">{baht(h.amount)}</div>
            <div
              className="w-full bg-emerald-500 rounded-t"
              style={{ height: `${peak > 0 ? (h.amount / peak) * 100 : 0}%`, minHeight: 2 }}
            />
            <div className="text-[10px] text-slate-500">{h.hour}น.</div>
          </div>
        ))}
      </div>
    </>
  );
}

function AmountModal({
  title,
  label,
  confirmLabel,
  expected,
  onClose,
  onConfirm,
}: {
  title: string;
  label: string;
  confirmLabel: string;
  expected?: number;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}) {
  const [val, setVal] = useState("");
  const amount = parseFloat(val) || 0;
  const diff = expected === undefined ? 0 : round2(amount - expected);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-20" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {expected !== undefined && (
          <div className="flex justify-between text-sm text-slate-500 mb-3">
            <span>ควรมีในลิ้นชัก</span>
            <span className="font-medium">{baht(expected)}</span>
          </div>
        )}
        <label className="block text-sm text-slate-500 mb-1">{label}</label>
        <input
          autoFocus
          inputMode="decimal"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0"
          className="w-full border rounded-xl px-3 py-3 text-2xl text-right mb-3"
        />
        {expected !== undefined && val !== "" && (
          <div className={`text-sm mb-3 text-center ${diff === 0 ? "text-emerald-600" : diff > 0 ? "text-amber-600" : "text-rose-500"}`}>
            {diff === 0 ? "ตรงพอดี" : diff > 0 ? `เกิน ${baht(diff)}` : `ขาด ${baht(-diff)}`}
          </div>
        )}
        <button onClick={() => onConfirm(amount)} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold">
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

function CashMoveModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (amount: number, note: string) => void }) {
  const [dir, setDir] = useState<"in" | "out">("in");
  const [val, setVal] = useState("");
  const [note, setNote] = useState("");
  const amount = parseFloat(val) || 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-20" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-lg">เงินเข้า / ออก</h2>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setDir("in")}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium ${dir === "in" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            <ArrowDownLeft size={16} /> เงินเข้า
          </button>
          <button
            onClick={() => setDir("out")}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium ${dir === "out" ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            <ArrowUpRight size={16} /> เงินออก
          </button>
        </div>
        <input
          autoFocus
          inputMode="decimal"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0"
          className="w-full border rounded-xl px-3 py-3 text-2xl text-right mb-3"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="หมายเหตุ เช่น ซื้อของ, ทอนเพิ่ม"
          className="w-full border rounded-xl px-3 py-2 mb-4"
        />
        <button
          disabled={amount <= 0}
          onClick={() => onConfirm(dir === "in" ? amount : -amount, note.trim())}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40"
        >
          บันทึก
        </button>
      </div>
    </div>
  );
}

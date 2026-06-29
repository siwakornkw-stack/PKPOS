"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, Wallet, LockOpen, Lock, Loader2, Inbox } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui";
import { baht, num, fmtDateTime } from "@/lib/format";
import { useCan } from "@/components/SessionProvider";
import { PERMISSIONS } from "@/lib/permissions";

interface Shift { id: number; openingCash: number; openedAt: string; status: string; }
interface Summary { orderCount: number; totalSales: number; cashSales: number; cashIn: number; cashOut: number; expectedCash: number; }

export default function ShiftPage() {
  const canClose = useCan(PERMISSIONS.SHIFT_CLOSE);
  const [shift, setShift] = useState<Shift | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [cmType, setCmType] = useState("PAID_OUT");
  const [cmAmount, setCmAmount] = useState("");
  const [cmReason, setCmReason] = useState("");

  const load = useCallback(async () => {
    const d = await (await fetch("/api/shift")).json();
    setShift(d.shift);
    setSummary(d.summary);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function openShift() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/shift", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingCash: Number(opening) || 0 }),
    });
    if (res.ok) { setOpening(""); load(); } else setMsg((await res.json()).error?.message ?? "เปิดกะไม่สำเร็จ");
    setBusy(false);
  }

  async function cashMove() {
    if (!cmAmount || Number(cmAmount) <= 0) return;
    setBusy(true); setMsg("");
    const res = await fetch("/api/shift/cash", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: cmType, amount: Number(cmAmount), reason: cmReason || undefined }),
    });
    if (res.ok) { setCmAmount(""); setCmReason(""); load(); }
    else setMsg((await res.json()).error?.message ?? "บันทึกไม่สำเร็จ");
    setBusy(false);
  }

  async function closeShift() {
    if (!confirm("ยืนยันปิดกะ?")) return;
    setBusy(true); setMsg("");
    const res = await fetch("/api/shift/close", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closingCash: Number(closing) || 0 }),
    });
    const d = await res.json();
    if (res.ok) {
      setMsg(`ปิดกะสำเร็จ - คาดว่ามีเงิน ${baht(d.expectedCash)}, นับได้ ${baht(d.shift.closingCash)}, ส่วนต่าง ${baht(d.variance)}`);
      setClosing(""); load();
    } else setMsg(d.error?.message ?? "ปิดกะไม่สำเร็จ");
    setBusy(false);
  }

  if (loading) return <div className="p-6 text-gray-400">กำลังโหลด...</div>;

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title="กะการขาย (Shift)" subtitle="เปิด/ปิดกะ และตรวจนับเงินสด" icon={Clock}
        actions={
          <button onClick={() => fetch("/api/cashdrawer", { method: "POST" }).then(() => alert("เปิดลิ้นชักแล้ว"))} className="btn-ghost">
            <Inbox className="h-4 w-4" /> เปิดลิ้นชัก
          </button>
        }
      />

      {!shift ? (
        <div className="card p-6">
          <div className="flex items-center gap-2 text-gray-700 font-semibold mb-4"><LockOpen className="h-5 w-5 text-brand-600" /> เปิดกะใหม่</div>
          <label className="label">เงินสดตั้งต้นในลิ้นชัก</label>
          <input type="number" className="input max-w-xs" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" />
          <div className="mt-4">
            <button onClick={openShift} disabled={busy} className="btn-primary">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />} เปิดกะ
            </button>
          </div>
          {msg && <p className="text-sm text-rose-600 mt-3">{msg}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">กะเปิดเมื่อ</p>
              <p className="font-semibold text-gray-800">{fmtDateTime(shift.openedAt)}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 text-sm font-medium">
              ● กำลังเปิด
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="เงินตั้งต้น" value={baht(shift.openingCash)} icon={Wallet} tone="blue" />
            <StatCard label="ยอดขายในกะ" value={baht(summary?.totalSales ?? 0)} tone="brand" />
            <StatCard label="ขายเงินสด" value={baht(summary?.cashSales ?? 0)} tone="accent" />
            <StatCard label="บิลในกะ" value={num(summary?.orderCount ?? 0)} tone="blue" />
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 text-gray-700 font-semibold mb-3"><Wallet className="h-5 w-5 text-brand-600" /> เงินเข้า/ออกลิ้นชัก</div>
            <div className="flex flex-wrap items-end gap-2">
              <select value={cmType} onChange={(e) => setCmType(e.target.value)} className="input w-auto">
                <option value="PAID_OUT">เงินออก (จ่ายออก)</option>
                <option value="PAID_IN">เงินเข้า (เติมเงิน)</option>
              </select>
              <input type="number" className="input w-32" value={cmAmount} onChange={(e) => setCmAmount(e.target.value)} placeholder="จำนวนเงิน" />
              <input className="input flex-1 min-w-[140px]" value={cmReason} onChange={(e) => setCmReason(e.target.value)} placeholder="เหตุผล เช่น จ่ายค่าวัตถุดิบ" />
              <button onClick={cashMove} disabled={busy || !cmAmount} className="btn-ghost">บันทึก</button>
            </div>
            {(summary?.cashIn || summary?.cashOut) ? (
              <p className="text-xs text-gray-500 mt-2">เข้า {baht(summary?.cashIn ?? 0)} · ออก {baht(summary?.cashOut ?? 0)}</p>
            ) : null}
          </div>

          {canClose ? (
            <div className="card p-6">
              <div className="flex items-center gap-2 text-gray-700 font-semibold mb-1"><Lock className="h-5 w-5 text-rose-600" /> ปิดกะ</div>
              <p className="text-sm text-gray-500 mb-4">เงินที่ควรมีในลิ้นชัก = ตั้งต้น + ขายเงินสด + เงินเข้า - เงินออก = <b>{baht(summary?.expectedCash ?? 0)}</b></p>
              <label className="label">นับเงินสดจริงในลิ้นชัก</label>
              <input type="number" className="input max-w-xs" value={closing} onChange={(e) => setClosing(e.target.value)} placeholder="0.00" />
              {closing !== "" && (
                <p className="text-sm mt-2">ส่วนต่าง: <b className={Number(closing) - (summary?.expectedCash ?? 0) < 0 ? "text-rose-600" : "text-emerald-600"}>{baht(Number(closing) - (summary?.expectedCash ?? 0))}</b></p>
              )}
              <div className="mt-4">
                <button onClick={closeShift} disabled={busy || closing === ""} className="btn-danger">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} ปิดกะ
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">ไม่มีสิทธิ์ปิดกะ (ต้องเป็น cashier ขึ้นไป)</p>
          )}
          {msg && <p className="text-sm text-gray-700 bg-brand-50 border border-brand-200 rounded-lg p-3">{msg}</p>}
        </div>
      )}
    </div>
  );
}

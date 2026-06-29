"use client";

import { useEffect, useState, useCallback } from "react";
import { Ticket, Plus } from "lucide-react";
import { PageHeader, Modal, Badge, EmptyState } from "@/components/ui";
import { baht, fmtDateTime } from "@/lib/format";

interface Voucher {
  id: number;
  code: string;
  type: "AMOUNT" | "PERCENT";
  value: number;
  minSpend: number;
  used: boolean;
  usedAt: string | null;
  createdAt: string;
}

function typeLabel(v: Voucher): string {
  return v.type === "PERCENT" ? `ลด ${v.value}%` : `ลด ${baht(v.value)}`;
}

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const d = await (await fetch("/api/vouchers")).json();
    setVouchers(d.vouchers ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6">
      <PageHeader
        title="บัตรกำนัล / โค้ดส่วนลด"
        subtitle="โค้ดส่วนลดแบบใช้ครั้งเดียว"
        icon={Ticket}
        actions={<button onClick={() => setAdding(true)} className="btn-primary"><Plus className="h-4 w-4" /> สร้างโค้ด</button>}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="px-4 py-3 font-medium">โค้ด</th>
              <th className="px-4 py-3 font-medium">ประเภท</th>
              <th className="px-4 py-3 font-medium">ขั้นต่ำ</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
              <th className="px-4 py-3 font-medium">วันที่ใช้</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-mono text-gray-700">{v.code}</td>
                <td className="px-4 py-3 text-gray-700">{typeLabel(v)}</td>
                <td className="px-4 py-3 text-gray-700">{baht(v.minSpend)}</td>
                <td className="px-4 py-3">
                  {v.used
                    ? <Badge className="bg-gray-100 text-gray-500">ใช้แล้ว</Badge>
                    : <Badge className="bg-emerald-100 text-emerald-700">ใช้ได้</Badge>}
                </td>
                <td className="px-4 py-3 text-gray-600">{v.usedAt ? fmtDateTime(v.usedAt) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {vouchers.length === 0 && <EmptyState message="ยังไม่มีโค้ด" />}
      </div>

      <AddModal open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
    </div>
  );
}

function AddModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ code: "", type: "AMOUNT" as "AMOUNT" | "PERCENT", value: "", minSpend: "" });
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    const res = await fetch("/api/vouchers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        type: form.type,
        value: Number(form.value),
        minSpend: Number(form.minSpend) || 0,
      }),
    });
    if (res.ok) {
      setForm({ code: "", type: "AMOUNT", value: "", minSpend: "" });
      onSaved();
    } else {
      const d = await res.json();
      setErr(d.error?.message ?? "บันทึกไม่สำเร็จ");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="สร้างโค้ด">
      <div className="space-y-3">
        <div><label className="label">โค้ด</label><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} autoFocus /></div>
        <div>
          <label className="label">ประเภท</label>
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "AMOUNT" | "PERCENT" })}>
            <option value="AMOUNT">จำนวนเงิน (฿)</option>
            <option value="PERCENT">เปอร์เซ็นต์ (%)</option>
          </select>
        </div>
        <div><label className="label">{form.type === "PERCENT" ? "ส่วนลด (%)" : "ส่วนลด (฿)"}</label><input className="input" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
        <div><label className="label">ยอดขั้นต่ำ (฿)</label><input className="input" type="number" value={form.minSpend} onChange={(e) => setForm({ ...form, minSpend: e.target.value })} /></div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button onClick={save} className="btn-primary w-full">บันทึก</button>
      </div>
    </Modal>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarClock, Plus, Phone, Users, Check, X, UserX } from "lucide-react";
import { PageHeader, Modal, Badge, EmptyState } from "@/components/ui";
import { baht, fmtDateTime } from "@/lib/format";

interface Booking {
  id: number;
  docNo: string;
  customerName: string;
  phone: string;
  guestCount: number;
  bookingTime: string;
  deposit: number;
  status: string;
  note: string | null;
  table: { code: string } | null;
  member: { name: string } | null;
}

interface Table { id: number; code: string; zone: string | null; seats: number; }

const STATUS: Record<string, { label: string; className: string }> = {
  BOOKED: { label: "จองแล้ว", className: "bg-blue-100 text-blue-700" },
  ARRIVED: { label: "มาแล้ว", className: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-gray-100 text-gray-600" },
  NO_SHOW: { label: "ไม่มา", className: "bg-rose-100 text-rose-700" },
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const d = await (await fetch("/api/bookings")).json();
    setBookings(d.bookings ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(id: number, status: string) {
    const res = await fetch(`/api/bookings/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (res.ok) load();
  }

  return (
    <div className="p-6">
      <PageHeader
        title="จองโต๊ะ" subtitle={`${bookings.length} รายการ`} icon={CalendarClock}
        actions={<button onClick={() => setAdding(true)} className="btn-primary"><Plus className="h-4 w-4" /> เพิ่มการจอง</button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {bookings.map((b) => {
          const s = STATUS[b.status] ?? STATUS.BOOKED;
          return (
            <div key={b.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-800">{b.customerName}</p>
                  <p className="text-xs text-gray-400">{b.docNo}</p>
                </div>
                <Badge className={s.className}>{s.label}</Badge>
              </div>
              <div className="mt-3 space-y-1 text-sm text-gray-500">
                <p className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />{fmtDateTime(b.bookingTime)}</p>
                <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{b.phone}</p>
                <p className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{b.guestCount} ท่าน{b.table ? ` · โต๊ะ ${b.table.code}` : ""}</p>
                {b.deposit > 0 && <p>มัดจำ: <span className="font-semibold text-gray-700">{baht(b.deposit)}</span></p>}
                {b.member && <p>สมาชิก: {b.member.name}</p>}
              </div>
              {b.status === "BOOKED" && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setStatus(b.id, "ARRIVED")} className="btn-primary flex-1 justify-center"><Check className="h-4 w-4" /> มาแล้ว</button>
                  <button onClick={() => setStatus(b.id, "CANCELLED")} className="btn-ghost"><X className="h-4 w-4" /> ยกเลิก</button>
                  <button onClick={() => setStatus(b.id, "NO_SHOW")} className="btn-danger"><UserX className="h-4 w-4" /> ไม่มา</button>
                </div>
              )}
            </div>
          );
        })}
        {bookings.length === 0 && <div className="col-span-full"><EmptyState message="ยังไม่มีการจอง" /></div>}
      </div>

      <AddModal open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
    </div>
  );
}

function AddModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ customerName: "", phone: "", guestCount: "2", bookingTime: "", tableId: "", deposit: "" });
  const [tables, setTables] = useState<Table[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      const d = await (await fetch("/api/tables")).json();
      setTables(d.tables ?? []);
    })();
  }, [open]);

  async function save() {
    setErr("");
    if (!form.bookingTime) { setErr("กรุณาเลือกวันเวลาที่จอง"); return; }
    const body = {
      customerName: form.customerName,
      phone: form.phone,
      guestCount: Number(form.guestCount) || 2,
      bookingTime: new Date(form.bookingTime).toISOString(),
      tableId: form.tableId ? Number(form.tableId) : undefined,
      deposit: form.deposit ? Number(form.deposit) : undefined,
    };
    const res = await fetch("/api/bookings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) { setForm({ customerName: "", phone: "", guestCount: "2", bookingTime: "", tableId: "", deposit: "" }); onSaved(); }
    else { const d = await res.json(); setErr(d.error?.message ?? "บันทึกไม่สำเร็จ"); }
  }

  return (
    <Modal open={open} onClose={onClose} title="เพิ่มการจอง">
      <div className="space-y-3">
        <div><label className="label">ชื่อลูกค้า</label><input className="input" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} autoFocus /></div>
        <div><label className="label">เบอร์โทร</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><label className="label">จำนวนแขก</label><input className="input" type="number" min={1} value={form.guestCount} onChange={(e) => setForm({ ...form, guestCount: e.target.value })} /></div>
        <div><label className="label">วันเวลาที่จอง</label><input className="input" type="datetime-local" required value={form.bookingTime} onChange={(e) => setForm({ ...form, bookingTime: e.target.value })} /></div>
        <div>
          <label className="label">โต๊ะ (ถ้ามี)</label>
          <select className="input" value={form.tableId} onChange={(e) => setForm({ ...form, tableId: e.target.value })}>
            <option value="">ไม่ระบุ</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>{t.code}{t.zone ? ` (${t.zone})` : ""} · {t.seats} ที่นั่ง</option>
            ))}
          </select>
        </div>
        <div><label className="label">มัดจำ</label><input className="input" type="number" min={0} step="0.01" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} /></div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button onClick={save} className="btn-primary w-full">บันทึก</button>
      </div>
    </Modal>
  );
}

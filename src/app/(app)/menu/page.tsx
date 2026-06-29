"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { BookOpen, Plus, Pencil, Power, ChefHat, Clock, Trash2 } from "lucide-react";
import { PageHeader, Modal, Badge } from "@/components/ui";
import { baht } from "@/lib/format";
import { hhmmToMin, minToHhmm, WEEKDAY_LABELS } from "@/lib/timewin";

interface MenuItem { id: number; name: string; code: string; barcode?: string | null; price: number; cost: number; categoryId: number; isAvailable: boolean; isActive: boolean; isOpenPrice?: boolean; }
interface Category { id: number; name: string; items: MenuItem[]; }
interface TimePrice { id: number; name: string; channel: string | null; days: string; startMin: number; endMin: number; price: number; priority: number; }
const CHANNELS = [{ v: "", l: "ทุกช่องทาง" }, { v: "DINE_IN", l: "ทานที่ร้าน" }, { v: "TAKEAWAY", l: "กลับบ้าน" }, { v: "DELIVERY", l: "เดลิเวอรี" }];

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const d = await (await fetch("/api/menu")).json();
    setCategories(d.categories ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(item: MenuItem) {
    await fetch(`/api/menu/${item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAvailable: !item.isAvailable }),
    });
    load();
  }

  return (
    <div className="p-6">
      <PageHeader
        title="เมนู & ราคา" subtitle="จัดการเมนู ราคา และสถานะพร้อมขาย" icon={BookOpen}
        actions={
          <>
            <Link href="/recipes" className="btn-ghost"><ChefHat className="h-4 w-4" /> สูตร/BOM</Link>
            <button onClick={() => setAdding(true)} className="btn-primary"><Plus className="h-4 w-4" /> เพิ่มเมนู</button>
          </>
        }
      />

      <div className="space-y-6">
        {categories.map((c) => (
          <div key={c.id} className="card overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 font-semibold text-gray-700 border-b border-gray-200">
              {c.name} <span className="text-gray-400 font-normal">({c.items.filter((i) => i.isActive).length})</span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-400 border-b border-gray-100">
                <tr><th className="text-left px-4 py-2">รหัส</th><th className="text-left py-2">ชื่อเมนู</th><th className="text-right py-2">ทุน</th><th className="text-right py-2">ราคา</th><th className="text-center py-2">สถานะ</th><th className="py-2"></th></tr>
              </thead>
              <tbody>
                {c.items.filter((i) => i.isActive).map((i) => (
                  <tr key={i.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-400">{i.code}</td>
                    <td className="py-2 text-gray-700">{i.name}</td>
                    <td className="py-2 text-right text-gray-400">{baht(i.cost)}</td>
                    <td className="py-2 text-right font-semibold text-gray-800">{baht(i.price)}</td>
                    <td className="py-2 text-center">
                      {i.isAvailable
                        ? <Badge className="bg-emerald-100 text-emerald-700">พร้อมขาย</Badge>
                        : <Badge className="bg-rose-100 text-rose-700">หมด (86)</Badge>}
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      <button onClick={() => toggle(i)} title="สลับสถานะ" className="text-gray-400 hover:text-accent-600 mr-2"><Power className="h-4 w-4 inline" /></button>
                      <button onClick={() => setEditing(i)} title="แก้ไข" className="text-gray-400 hover:text-brand-600"><Pencil className="h-4 w-4 inline" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <EditModal item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      <AddModal open={adding} categories={categories} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
    </div>
  );
}

function EditModal({ item, onClose, onSaved }: { item: MenuItem | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [price, setPrice] = useState(0);
  const [cost, setCost] = useState(0);
  const [openPrice, setOpenPrice] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (item) { setName(item.name); setBarcode(item.barcode ?? ""); setPrice(item.price); setCost(item.cost); setOpenPrice(!!item.isOpenPrice); setErr(""); } }, [item]);
  if (!item) return null;

  async function save() {
    setErr("");
    const res = await fetch(`/api/menu/${item!.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, barcode: barcode.trim() || null, price, cost, isOpenPrice: openPrice }),
    });
    if (res.ok) onSaved();
    else setErr((await res.json()).error?.message ?? "บันทึกไม่สำเร็จ");
  }
  return (
    <Modal open={!!item} onClose={onClose} title={`แก้ไข: ${item.code}`} width="max-w-lg">
      <div className="space-y-3">
        <div><label className="label">ชื่อเมนู</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">บาร์โค้ด (สแกนขายได้)</label><input className="input" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="เช่น 8850123456789" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">ราคาขาย</label><input type="number" className="input" value={price} onChange={(e) => setPrice(Number(e.target.value))} disabled={openPrice} /></div>
          <div><label className="label">ต้นทุน</label><input type="number" className="input" value={cost} onChange={(e) => setCost(Number(e.target.value))} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={openPrice} onChange={(e) => setOpenPrice(e.target.checked)} /> ราคาเปิด (กรอกราคาตอนขาย)</label>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button onClick={save} className="btn-primary w-full">บันทึก</button>
        <TimePriceManager menuItemId={item.id} />
      </div>
    </Modal>
  );
}

function TimePriceManager({ menuItemId }: { menuItemId: number }) {
  const [list, setList] = useState<TimePrice[]>([]);
  const [form, setForm] = useState({ name: "", channel: "", start: "16:00", end: "18:00", price: 0, days: "0123456" });
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const d = await (await fetch(`/api/menu/timeprices?menuItemId=${menuItemId}`)).json();
    setList(d.timePrices ?? []);
  }, [menuItemId]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setErr("");
    const res = await fetch("/api/menu/timeprices", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        menuItemId, name: form.name || "ราคาพิเศษ",
        channel: form.channel || null, days: form.days || "0123456",
        startMin: hhmmToMin(form.start), endMin: hhmmToMin(form.end), price: Number(form.price),
      }),
    });
    if (res.ok) { setForm({ ...form, name: "", price: 0 }); load(); }
    else setErr((await res.json()).error?.message ?? "เพิ่มไม่สำเร็จ");
  }
  async function del(id: number) { await fetch(`/api/menu/timeprices?id=${id}`, { method: "DELETE" }); load(); }
  function toggleDay(d: number) {
    const s = new Set(form.days.split(""));
    const k = String(d);
    if (s.has(k)) s.delete(k); else s.add(k);
    setForm({ ...form, days: [...s].sort().join("") });
  }

  return (
    <div className="border-t border-gray-200 pt-3">
      <div className="flex items-center gap-2 text-gray-700 font-semibold mb-2 text-sm"><Clock className="h-4 w-4 text-brand-600" /> ราคาตามเวลา (happy hour)</div>
      {list.length > 0 && (
        <div className="space-y-1 mb-3">
          {list.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm bg-gray-50 rounded px-2 py-1">
              <span className="text-gray-700">{t.name} · {baht(t.price)} · {minToHhmm(t.startMin)}-{minToHhmm(t.endMin)} · {CHANNELS.find((c) => c.v === (t.channel ?? ""))?.l}</span>
              <button onClick={() => del(t.id)} className="text-gray-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <input className="input" placeholder="ชื่อ เช่น Happy Hour" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input type="number" className="input" placeholder="ราคา" value={form.price || ""} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
        <input type="time" className="input" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        <input type="time" className="input" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        <select className="input col-span-2" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
          {CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
        </select>
      </div>
      <div className="flex gap-1 mt-2">
        {WEEKDAY_LABELS.map((lbl, d) => (
          <button key={d} type="button" onClick={() => toggleDay(d)}
            className={`h-7 w-7 rounded text-xs font-medium ${form.days.includes(String(d)) ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-500"}`}>{lbl}</button>
        ))}
      </div>
      {err && <p className="text-sm text-rose-600 mt-1">{err}</p>}
      <button onClick={add} className="btn-ghost mt-2 text-sm"><Plus className="h-4 w-4" /> เพิ่มช่วงราคา</button>
    </div>
  );
}

function AddModal({ open, categories, onClose, onSaved }: { open: boolean; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ code: "", barcode: "", name: "", price: 0, cost: 0, categoryId: 0, isOpenPrice: false });
  const [err, setErr] = useState("");
  useEffect(() => { if (open && categories[0]) setForm((f) => ({ ...f, categoryId: categories[0].id })); }, [open, categories]);

  async function save() {
    setErr("");
    const { barcode, ...rest } = form;
    const res = await fetch("/api/menu", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rest, ...(barcode.trim() ? { barcode: barcode.trim() } : {}), categoryId: Number(form.categoryId), price: Number(form.price), cost: Number(form.cost) }),
    });
    if (res.ok) { setForm({ code: "", barcode: "", name: "", price: 0, cost: 0, categoryId: categories[0]?.id ?? 0, isOpenPrice: false }); onSaved(); }
    else { const d = await res.json(); setErr(d.error?.message ?? "บันทึกไม่สำเร็จ"); }
  }
  return (
    <Modal open={open} onClose={onClose} title="เพิ่มเมนูใหม่">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">รหัสเมนู</label><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="M999" /></div>
          <div><label className="label">หมวด</label>
            <select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: Number(e.target.value) })}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">ชื่อเมนู</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className="label">บาร์โค้ด (ถ้ามี)</label><input className="input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="เช่น 8850123456789" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">ราคาขาย</label><input type="number" className="input" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} disabled={form.isOpenPrice} /></div>
          <div><label className="label">ต้นทุน</label><input type="number" className="input" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.isOpenPrice} onChange={(e) => setForm({ ...form, isOpenPrice: e.target.checked })} /> ราคาเปิด (กรอกราคาตอนขาย)</label>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button onClick={save} className="btn-primary w-full">เพิ่มเมนู</button>
      </div>
    </Modal>
  );
}

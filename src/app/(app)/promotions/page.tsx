"use client";

import { useEffect, useState, useCallback } from "react";
import { Tag, Plus, Pencil } from "lucide-react";
import { PageHeader, Modal, Badge, EmptyState } from "@/components/ui";
import { baht, fmtDateTime } from "@/lib/format";
import { hhmmToMin, minToHhmm, WEEKDAY_LABELS } from "@/lib/timewin";

interface Promotion {
  id: number;
  code: string;
  name: string;
  type: "PERCENT" | "AMOUNT";
  value: number;
  minSpend: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  scope: string;
  menuItemId: number | null;
  categoryId: number | null;
  buyQty: number | null;
  getQty: number | null;
  memberOnly: boolean;
  days: string | null;
  startMin: number | null;
  endMin: number | null;
  usageLimit: number | null;
  usedCount: number;
}
interface MenuItem { id: number; name: string; }
interface Category { id: number; name: string; items: MenuItem[]; }

const SCOPES: Record<string, string> = { ORDER: "ทั้งบิล", ITEM: "เฉพาะเมนู", CATEGORY: "เฉพาะหมวด", BXGY: "ซื้อ X แถม Y" };

function discountLabel(p: Promotion): string {
  if (p.scope === "BXGY") return `ซื้อ ${p.buyQty} แถม ${p.getQty}`;
  return p.type === "PERCENT" ? `ลด ${p.value}%` : `ลด ${baht(p.value)}`;
}

export default function PromotionsPage() {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);

  const load = useCallback(async () => {
    const [pd, md] = await Promise.all([
      (await fetch("/api/promotions?all=1")).json(),
      (await fetch("/api/menu")).json(),
    ]);
    setPromos(pd.promotions ?? []);
    setCats(md.categories ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(p: Promotion) {
    const res = await fetch(`/api/promotions/${p.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    if (res.ok) load();
  }

  const items = cats.flatMap((c) => c.items);

  return (
    <div className="p-6">
      <PageHeader
        title="โปรโมชัน" subtitle="จัดการแคมเปญส่วนลด (ทั้งบิล / เฉพาะเมนู / ซื้อแถม / สมาชิก / ตามเวลา)" icon={Tag}
        actions={<button onClick={() => setAdding(true)} className="btn-primary"><Plus className="h-4 w-4" /> เพิ่มโปรโมชัน</button>}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="px-4 py-3 font-medium">รหัส</th>
              <th className="px-4 py-3 font-medium">ชื่อ</th>
              <th className="px-4 py-3 font-medium">ขอบเขต</th>
              <th className="px-4 py-3 font-medium">ส่วนลด</th>
              <th className="px-4 py-3 font-medium">เงื่อนไข</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
              <th className="px-4 py-3 font-medium text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {promos.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 font-mono text-gray-700">{p.code}</td>
                <td className="px-4 py-3 text-gray-800">{p.name}</td>
                <td className="px-4 py-3"><Badge className="bg-blue-100 text-blue-700">{SCOPES[p.scope] ?? p.scope}</Badge></td>
                <td className="px-4 py-3 text-gray-700">{discountLabel(p)}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {p.minSpend > 0 && <div>ขั้นต่ำ {baht(p.minSpend)}</div>}
                  {p.memberOnly && <div className="text-accent-600">เฉพาะสมาชิก</div>}
                  {p.startMin != null && p.endMin != null && <div>{minToHhmm(p.startMin)}-{minToHhmm(p.endMin)}</div>}
                  {p.usageLimit != null && <div>ใช้ได้ {p.usedCount}/{p.usageLimit}</div>}
                  {(p.startsAt || p.endsAt) && <div>{p.startsAt ? fmtDateTime(p.startsAt) : "—"} ถึง {p.endsAt ? fmtDateTime(p.endsAt) : "—"}</div>}
                </td>
                <td className="px-4 py-3">
                  {p.isActive ? <Badge className="bg-emerald-100 text-emerald-700">ใช้งาน</Badge> : <Badge className="bg-gray-100 text-gray-500">ปิด</Badge>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setEditing(p)} className="btn-ghost"><Pencil className="h-4 w-4" /> แก้ไข</button>
                  <button onClick={() => toggle(p)} className="btn-ghost">{p.isActive ? "ปิด" : "เปิด"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {promos.length === 0 && <EmptyState message="ยังไม่มีโปรโมชัน" />}
      </div>

      <AddModal open={adding} items={items} cats={cats} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
      <EditModal promo={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function WeekdayPicker({ days, onChange }: { days: string; onChange: (d: string) => void }) {
  function toggle(d: number) {
    const s = new Set(days.split("").filter(Boolean));
    const k = String(d);
    if (s.has(k)) s.delete(k); else s.add(k);
    onChange([...s].sort().join(""));
  }
  return (
    <div className="flex gap-1">
      {WEEKDAY_LABELS.map((lbl, d) => (
        <button key={d} type="button" onClick={() => toggle(d)}
          className={`h-7 w-7 rounded text-xs font-medium ${days.includes(String(d)) ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-500"}`}>{lbl}</button>
      ))}
    </div>
  );
}

function AddModal({ open, items, cats, onClose, onSaved }: { open: boolean; items: MenuItem[]; cats: Category[]; onClose: () => void; onSaved: () => void }) {
  const empty = {
    code: "", name: "", scope: "ORDER", type: "PERCENT" as "PERCENT" | "AMOUNT", value: "", minSpend: "",
    menuItemId: "", categoryId: "", buyQty: "1", getQty: "1",
    memberOnly: false, days: "0123456", start: "", end: "", usageLimit: "",
  };
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof empty, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setErr("");
    const hasWindow = form.start && form.end;
    const body: Record<string, unknown> = {
      code: form.code, name: form.name, scope: form.scope, type: form.type,
      value: Number(form.value) || 0, minSpend: Number(form.minSpend) || 0,
      memberOnly: form.memberOnly,
      menuItemId: form.scope === "ITEM" || form.scope === "BXGY" ? Number(form.menuItemId) || null : null,
      categoryId: form.scope === "CATEGORY" ? Number(form.categoryId) || null : null,
      buyQty: form.scope === "BXGY" ? Number(form.buyQty) || null : null,
      getQty: form.scope === "BXGY" ? Number(form.getQty) || null : null,
      days: form.days || null,
      startMin: hasWindow ? hhmmToMin(form.start) : null,
      endMin: hasWindow ? hhmmToMin(form.end) : null,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
    };
    const res = await fetch("/api/promotions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.ok) { setForm(empty); onSaved(); }
    else setErr((await res.json()).error?.message ?? "บันทึกไม่สำเร็จ");
  }

  return (
    <Modal open={open} onClose={onClose} title="เพิ่มโปรโมชัน" width="max-w-lg">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">รหัส</label><input className="input" value={form.code} onChange={(e) => set("code", e.target.value)} autoFocus /></div>
          <div><label className="label">ขอบเขต</label>
            <select className="input" value={form.scope} onChange={(e) => set("scope", e.target.value)}>
              {Object.entries(SCOPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">ชื่อ</label><input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>

        {form.scope === "ITEM" && (
          <div><label className="label">เมนู</label>
            <select className="input" value={form.menuItemId} onChange={(e) => set("menuItemId", e.target.value)}>
              <option value="">- เลือกเมนู -</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        )}
        {form.scope === "CATEGORY" && (
          <div><label className="label">หมวด</label>
            <select className="input" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">- เลือกหมวด -</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {form.scope === "BXGY" && (
          <>
            <div><label className="label">เมนู</label>
              <select className="input" value={form.menuItemId} onChange={(e) => set("menuItemId", e.target.value)}>
                <option value="">- เลือกเมนู -</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">ซื้อ (จำนวน)</label><input type="number" className="input" value={form.buyQty} onChange={(e) => set("buyQty", e.target.value)} /></div>
              <div><label className="label">แถม (จำนวน)</label><input type="number" className="input" value={form.getQty} onChange={(e) => set("getQty", e.target.value)} /></div>
            </div>
          </>
        )}

        {form.scope !== "BXGY" ? (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">ประเภท</label>
              <select className="input" value={form.type} onChange={(e) => set("type", e.target.value)}>
                <option value="PERCENT">เปอร์เซ็นต์ (%)</option><option value="AMOUNT">จำนวนเงิน (฿)</option>
              </select>
            </div>
            <div><label className="label">{form.type === "PERCENT" ? "ส่วนลด (%)" : "ส่วนลด (฿)"}</label><input type="number" className="input" value={form.value} onChange={(e) => set("value", e.target.value)} /></div>
          </div>
        ) : (
          <div><label className="label">% ลดของแถม (เว้นว่าง = ฟรี)</label><input type="number" className="input" value={form.value} onChange={(e) => set("value", e.target.value)} placeholder="100" /></div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">ยอดขั้นต่ำ (฿)</label><input type="number" className="input" value={form.minSpend} onChange={(e) => set("minSpend", e.target.value)} /></div>
          <div><label className="label">จำกัดจำนวนครั้ง</label><input type="number" className="input" value={form.usageLimit} onChange={(e) => set("usageLimit", e.target.value)} placeholder="ไม่จำกัด" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">เวลาเริ่ม (ต่อวัน)</label><input type="time" className="input" value={form.start} onChange={(e) => set("start", e.target.value)} /></div>
          <div><label className="label">เวลาสิ้นสุด</label><input type="time" className="input" value={form.end} onChange={(e) => set("end", e.target.value)} /></div>
        </div>
        <div><label className="label">วันในสัปดาห์</label><WeekdayPicker days={form.days} onChange={(d) => set("days", d)} /></div>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.memberOnly} onChange={(e) => set("memberOnly", e.target.checked)} /> เฉพาะสมาชิก</label>

        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button onClick={save} className="btn-primary w-full">บันทึก</button>
      </div>
    </Modal>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function EditModal({ promo, onClose, onSaved }: { promo: Promotion | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", value: "", minSpend: "", startsAt: "", endsAt: "", memberOnly: false, usageLimit: "" });
  const [err, setErr] = useState("");

  useEffect(() => {
    if (promo) {
      setErr("");
      setForm({
        name: promo.name, value: String(promo.value), minSpend: String(promo.minSpend),
        startsAt: toLocalInput(promo.startsAt), endsAt: toLocalInput(promo.endsAt),
        memberOnly: promo.memberOnly, usageLimit: promo.usageLimit != null ? String(promo.usageLimit) : "",
      });
    }
  }, [promo]);

  async function save() {
    if (!promo) return;
    setErr("");
    const res = await fetch(`/api/promotions/${promo.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, value: Number(form.value), minSpend: Number(form.minSpend) || 0,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : "",
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : "",
        memberOnly: form.memberOnly,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      }),
    });
    if (res.ok) onSaved();
    else setErr((await res.json()).error?.message ?? "บันทึกไม่สำเร็จ");
  }

  return (
    <Modal open={promo != null} onClose={onClose} title="แก้ไขโปรโมชัน">
      <div className="space-y-3">
        <div><label className="label">ชื่อ</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
        <div><label className="label">ส่วนลด</label><input className="input" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">ยอดขั้นต่ำ (฿)</label><input className="input" type="number" value={form.minSpend} onChange={(e) => setForm({ ...form, minSpend: e.target.value })} /></div>
          <div><label className="label">จำกัดจำนวนครั้ง</label><input className="input" type="number" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} placeholder="ไม่จำกัด" /></div>
        </div>
        <div><label className="label">เริ่มต้น</label><input className="input" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></div>
        <div><label className="label">สิ้นสุด</label><input className="input" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.memberOnly} onChange={(e) => setForm({ ...form, memberOnly: e.target.checked })} /> เฉพาะสมาชิก</label>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button onClick={save} className="btn-primary w-full">บันทึก</button>
      </div>
    </Modal>
  );
}

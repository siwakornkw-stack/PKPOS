"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, Plus, Phone, Star, Pencil, Award, Gift, Trash2, Crown } from "lucide-react";
import { PageHeader, Modal, Badge } from "@/components/ui";
import { baht, num } from "@/lib/format";
import { useCan } from "@/components/SessionProvider";
import { PERMISSIONS } from "@/lib/permissions";

interface Member { id: number; code: string; name: string; phone: string | null; email: string | null; points: number; totalSpent: number; tier?: { name: string } | null; }

export default function CustomersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [redeeming, setRedeeming] = useState<Member | null>(null);
  const [config, setConfig] = useState(false);
  const canManage = useCan(PERMISSIONS.PROMOTION_MANAGE);

  const load = useCallback(async () => {
    const d = await (await fetch(`/api/customers?q=${encodeURIComponent(q)}`)).json();
    setMembers(d.members ?? []);
  }, [q]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6">
      <PageHeader
        title="ลูกค้า / สมาชิก" subtitle={`${members.length} สมาชิก`} icon={Users}
        actions={
          <>
            {canManage && <button onClick={() => setConfig(true)} className="btn-ghost"><Award className="h-4 w-4" /> โปรแกรมสมาชิก</button>}
            <button onClick={() => setAdding(true)} className="btn-primary"><Plus className="h-4 w-4" /> เพิ่มสมาชิก</button>
          </>
        }
      />

      <input className="input max-w-sm mb-4" placeholder="ค้นหาชื่อ / เบอร์โทร / รหัส" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((m) => (
          <div key={m.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-800">{m.name}</p>
                <p className="text-xs text-gray-400">{m.code}</p>
                {m.tier && <Badge className="bg-violet-100 text-violet-700 mt-1 inline-flex items-center gap-1"><Crown className="h-3 w-3" />{m.tier.name}</Badge>}
              </div>
              <Badge className="bg-amber-100 text-amber-700 flex items-center gap-1"><Star className="h-3 w-3" />{num(m.points)} แต้ม</Badge>
            </div>
            <div className="mt-3 space-y-1 text-sm text-gray-500">
              {m.phone && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{m.phone}</p>}
              <p>ยอดสะสม: <span className="font-semibold text-gray-700">{baht(m.totalSpent)}</span></p>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setEditing(m)} className="btn-ghost flex-1"><Pencil className="h-4 w-4" /> แก้ไข</button>
              <button onClick={() => setRedeeming(m)} className="btn-primary flex-1"><Star className="h-4 w-4" /> แลกแต้ม</button>
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <button onClick={() => exportMember(m)} className="flex-1 text-gray-400 hover:text-brand-600">ส่งออกข้อมูล (PDPA)</button>
              <button onClick={() => eraseMember(m, () => load())} className="flex-1 text-gray-400 hover:text-rose-600">ลบข้อมูลส่วนตัว</button>
            </div>
          </div>
        ))}
        {members.length === 0 && <p className="text-gray-400 text-sm col-span-full text-center py-10">ไม่พบสมาชิก</p>}
      </div>

      <AddModal open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
      <EditModal member={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      <RedeemModal member={redeeming} onClose={() => setRedeeming(null)} onSaved={() => { setRedeeming(null); load(); }} />
      <LoyaltyConfigModal open={config} onClose={() => setConfig(false)} />
    </div>
  );
}

interface Tier { id: number; name: string; minSpent: number; pointMultiplier: number; }
interface Reward { id: number; name: string; pointsCost: number; type: string; value: number; menuItemId: number | null; isActive: boolean; }

function LoyaltyConfigModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [items, setItems] = useState<{ id: number; name: string }[]>([]);
  const [tf, setTf] = useState({ name: "", minSpent: "", pointMultiplier: "1" });
  const [rf, setRf] = useState({ name: "", pointsCost: "", type: "DISCOUNT_AMOUNT", value: "", menuItemId: "" });
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [t, r, m] = await Promise.all([
      (await fetch("/api/tiers")).json(),
      (await fetch("/api/rewards")).json(),
      (await fetch("/api/menu")).json(),
    ]);
    setTiers(t.tiers ?? []);
    setRewards(r.rewards ?? []);
    setItems((m.categories ?? []).flatMap((c: { items: { id: number; name: string }[] }) => c.items));
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  async function addTier() {
    setErr("");
    const res = await fetch("/api/tiers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tf.name, minSpent: Number(tf.minSpent) || 0, pointMultiplier: Number(tf.pointMultiplier) || 1 }),
    });
    if (res.ok) { setTf({ name: "", minSpent: "", pointMultiplier: "1" }); load(); }
    else setErr((await res.json()).error?.message ?? "เพิ่มไม่สำเร็จ");
  }
  async function addReward() {
    setErr("");
    const res = await fetch("/api/rewards", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: rf.name, pointsCost: Number(rf.pointsCost) || 0, type: rf.type,
        value: rf.type === "DISCOUNT_AMOUNT" ? Number(rf.value) || 0 : 0,
        menuItemId: rf.type === "FREE_ITEM" ? Number(rf.menuItemId) || null : null,
      }),
    });
    if (res.ok) { setRf({ name: "", pointsCost: "", type: "DISCOUNT_AMOUNT", value: "", menuItemId: "" }); load(); }
    else setErr((await res.json()).error?.message ?? "เพิ่มไม่สำเร็จ");
  }
  async function delTier(id: number) { await fetch(`/api/tiers/${id}`, { method: "DELETE" }); load(); }
  async function delReward(id: number) { await fetch(`/api/rewards/${id}`, { method: "DELETE" }); load(); }

  return (
    <Modal open={open} onClose={onClose} title="โปรแกรมสมาชิก" width="max-w-2xl">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 font-semibold text-gray-700 mb-2"><Crown className="h-4 w-4 text-violet-600" /> ระดับสมาชิก</div>
          <div className="space-y-1 mb-3">
            {tiers.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm bg-gray-50 rounded px-2 py-1">
                <span className="text-gray-700">{t.name} · ยอด {baht(t.minSpent)} · x{t.pointMultiplier}</span>
                <button onClick={() => delTier(t.id)} className="text-gray-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {tiers.length === 0 && <p className="text-xs text-gray-400">ยังไม่มีระดับ</p>}
          </div>
          <input className="input mb-2" placeholder="ชื่อระดับ เช่น Gold" value={tf.name} onChange={(e) => setTf({ ...tf, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input type="number" className="input" placeholder="ยอดสะสมขั้นต่ำ" value={tf.minSpent} onChange={(e) => setTf({ ...tf, minSpent: e.target.value })} />
            <input type="number" step="0.1" className="input" placeholder="ตัวคูณแต้ม" value={tf.pointMultiplier} onChange={(e) => setTf({ ...tf, pointMultiplier: e.target.value })} />
          </div>
          <button onClick={addTier} className="btn-ghost text-sm"><Plus className="h-4 w-4" /> เพิ่มระดับ</button>
        </div>

        <div>
          <div className="flex items-center gap-2 font-semibold text-gray-700 mb-2"><Gift className="h-4 w-4 text-brand-600" /> ของรางวัลแลกแต้ม</div>
          <div className="space-y-1 mb-3">
            {rewards.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm bg-gray-50 rounded px-2 py-1">
                <span className="text-gray-700">{r.name} · {num(r.pointsCost)} แต้ม · {r.type === "FREE_ITEM" ? "ฟรีเมนู" : baht(r.value)}</span>
                <button onClick={() => delReward(r.id)} className="text-gray-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {rewards.length === 0 && <p className="text-xs text-gray-400">ยังไม่มีของรางวัล</p>}
          </div>
          <input className="input mb-2" placeholder="ชื่อรางวัล" value={rf.name} onChange={(e) => setRf({ ...rf, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input type="number" className="input" placeholder="ใช้แต้ม" value={rf.pointsCost} onChange={(e) => setRf({ ...rf, pointsCost: e.target.value })} />
            <select className="input" value={rf.type} onChange={(e) => setRf({ ...rf, type: e.target.value })}>
              <option value="DISCOUNT_AMOUNT">ส่วนลด (฿)</option>
              <option value="FREE_ITEM">ฟรีเมนู</option>
            </select>
          </div>
          {rf.type === "DISCOUNT_AMOUNT" ? (
            <input type="number" className="input mb-2" placeholder="มูลค่าส่วนลด (฿)" value={rf.value} onChange={(e) => setRf({ ...rf, value: e.target.value })} />
          ) : (
            <select className="input mb-2" value={rf.menuItemId} onChange={(e) => setRf({ ...rf, menuItemId: e.target.value })}>
              <option value="">- เลือกเมนู -</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          )}
          <button onClick={addReward} className="btn-ghost text-sm"><Plus className="h-4 w-4" /> เพิ่มของรางวัล</button>
        </div>
      </div>
      {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
    </Modal>
  );
}

async function exportMember(m: Member) {
  const res = await fetch(`/api/customers/${m.id}`);
  if (!res.ok) return alert("ส่งออกไม่สำเร็จ");
  const data = await res.json();
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = `member-${m.code}.json`; a.click();
  URL.revokeObjectURL(url);
}

async function eraseMember(m: Member, reload: () => void) {
  if (!confirm(`ลบข้อมูลส่วนตัวของ ${m.name}? (เก็บประวัติการขายไว้ แต่ลบ ชื่อ/เบอร์/อีเมล)`)) return;
  const res = await fetch(`/api/customers/${m.id}`, { method: "DELETE" });
  if (res.ok) reload();
  else alert("ลบไม่สำเร็จ");
}

function EditModal({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [err, setErr] = useState("");
  useEffect(() => {
    if (member) setForm({ name: member.name, phone: member.phone ?? "", email: member.email ?? "" });
    setErr("");
  }, [member]);
  async function save() {
    if (!member) return;
    setErr("");
    const res = await fetch(`/api/customers/${member.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (res.ok) onSaved();
    else { const d = await res.json(); setErr(d.error?.message ?? "บันทึกไม่สำเร็จ"); }
  }
  return (
    <Modal open={!!member} onClose={onClose} title="แก้ไขสมาชิก">
      <div className="space-y-3">
        <div><label className="label">ชื่อ</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
        <div><label className="label">เบอร์โทร</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><label className="label">อีเมล (ถ้ามี)</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button onClick={save} className="btn-primary w-full">บันทึก</button>
      </div>
    </Modal>
  );
}

function RedeemModal({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved: () => void }) {
  const [points, setPoints] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { setPoints(""); setErr(""); }, [member]);
  async function redeem() {
    if (!member) return;
    setErr("");
    const p = Number(points);
    if (!Number.isFinite(p) || p <= 0) { setErr("กรอกจำนวนแต้มให้ถูกต้อง"); return; }
    if (p > (member.points ?? 0)) { setErr("แต้มคงเหลือไม่พอ"); return; }
    const res = await fetch(`/api/customers/${member.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "redeem", points: p }),
    });
    if (res.ok) onSaved();
    else { const d = await res.json(); setErr(d.error?.message ?? "แลกแต้มไม่สำเร็จ"); }
  }
  return (
    <Modal open={!!member} onClose={onClose} title="แลกแต้ม">
      <div className="space-y-3">
        <p className="text-sm text-gray-500">แต้มคงเหลือ: <span className="font-semibold text-gray-700">{num(member?.points ?? 0)}</span></p>
        <div><label className="label">จำนวนแต้มที่แลก</label><input className="input" type="number" min={1} value={points} onChange={(e) => setPoints(e.target.value)} autoFocus /></div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button onClick={redeem} className="btn-primary w-full">ยืนยันแลกแต้ม</button>
      </div>
    </Modal>
  );
}

function AddModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    const res = await fetch("/api/customers", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (res.ok) { setForm({ name: "", phone: "", email: "" }); onSaved(); }
    else { const d = await res.json(); setErr(d.error?.message ?? "บันทึกไม่สำเร็จ"); }
  }
  return (
    <Modal open={open} onClose={onClose} title="เพิ่มสมาชิกใหม่">
      <div className="space-y-3">
        <div><label className="label">ชื่อ</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
        <div><label className="label">เบอร์โทร</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><label className="label">อีเมล (ถ้ามี)</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button onClick={save} className="btn-primary w-full">บันทึก</button>
      </div>
    </Modal>
  );
}

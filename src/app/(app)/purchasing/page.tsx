"use client";

import { useEffect, useState, useCallback } from "react";
import { Truck, Plus, Trash2, PackageCheck } from "lucide-react";
import { PageHeader, Modal, Badge, EmptyState } from "@/components/ui";
import { baht, fmtDateTime } from "@/lib/format";

interface Supplier { id: number; name: string; }
interface Ingredient { id: number; name: string; unit: string; costPerUnit: number; }
interface PO {
  id: number;
  docNo: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  supplier: { name: string };
  _count: { items: number };
}

interface Line { ingredientId: string; qty: string; unitCost: string; }

const STATUS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "ร่าง", className: "bg-gray-100 text-gray-600" },
  ORDERED: { label: "สั่งซื้อแล้ว", className: "bg-blue-100 text-blue-700" },
  RECEIVED: { label: "รับของแล้ว", className: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "ยกเลิก", className: "bg-rose-100 text-rose-700" },
};

export default function PurchasingPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const d = await (await fetch("/api/purchasing")).json();
    setPurchaseOrders(d.purchaseOrders ?? []);
    setSuppliers(d.suppliers ?? []);
    setIngredients(d.ingredients ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function receive(id: number) {
    const res = await fetch(`/api/purchasing/${id}/receive`, { method: "POST" });
    if (res.ok) load();
    else { const e = await res.json(); alert(e.error?.message ?? "รับของไม่สำเร็จ"); }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="จัดซื้อ (PO)" subtitle={`${purchaseOrders.length} ใบสั่งซื้อ`} icon={Truck}
        actions={<button onClick={() => setAdding(true)} className="btn-primary"><Plus className="h-4 w-4" /> สร้างใบสั่งซื้อ</button>}
      />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 font-medium">เลขที่</th>
              <th className="px-4 py-3 font-medium">ผู้ขาย</th>
              <th className="px-4 py-3 font-medium">รายการ</th>
              <th className="px-4 py-3 font-medium text-right">ยอดรวม</th>
              <th className="px-4 py-3 font-medium">สถานะ</th>
              <th className="px-4 py-3 font-medium">วันที่</th>
              <th className="px-4 py-3 font-medium text-right"></th>
            </tr>
          </thead>
          <tbody>
            {purchaseOrders.map((po) => {
              const st = STATUS[po.status] ?? { label: po.status, className: "bg-gray-100 text-gray-600" };
              return (
                <tr key={po.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-800">{po.docNo}</td>
                  <td className="px-4 py-3 text-gray-700">{po.supplier.name}</td>
                  <td className="px-4 py-3 text-gray-500">{po._count.items} รายการ</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">{baht(po.totalAmount)}</td>
                  <td className="px-4 py-3"><Badge className={st.className}>{st.label}</Badge></td>
                  <td className="px-4 py-3 text-gray-500">{fmtDateTime(po.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {po.status === "ORDERED" && (
                      <button onClick={() => receive(po.id)} className="btn-ghost">
                        <PackageCheck className="h-4 w-4" /> รับของ
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {purchaseOrders.length === 0 && <EmptyState message="ยังไม่มีใบสั่งซื้อ" />}
      </div>

      <CreateModal
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); load(); }}
        suppliers={suppliers}
        ingredients={ingredients}
      />
    </div>
  );
}

function CreateModal({ open, onClose, onSaved, suppliers, ingredients }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  suppliers: Supplier[]; ingredients: Ingredient[];
}) {
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ingredientId: "", qty: "", unitCost: "" }]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setSupplierId(""); setNote(""); setLines([{ ingredientId: "", qty: "", unitCost: "" }]); setErr("");
  }

  function setLine(idx: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      if (patch.ingredientId) {
        const ing = ingredients.find((g) => g.id === Number(patch.ingredientId));
        if (ing && !l.unitCost) next.unitCost = String(ing.costPerUnit);
      }
      return next;
    }));
  }

  function lineAmount(l: Line) { return (Number(l.qty) || 0) * (Number(l.unitCost) || 0); }
  const grandTotal = lines.reduce((s, l) => s + lineAmount(l), 0);

  async function save() {
    setErr("");
    const items = lines
      .filter((l) => l.ingredientId && Number(l.qty) > 0)
      .map((l) => ({ ingredientId: Number(l.ingredientId), qty: Number(l.qty), unitCost: Number(l.unitCost) || 0 }));
    if (!supplierId) { setErr("กรุณาเลือกผู้ขาย"); return; }
    if (items.length === 0) { setErr("กรุณาเพิ่มรายการอย่างน้อย 1 รายการ"); return; }

    setSaving(true);
    const res = await fetch("/api/purchasing", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId: Number(supplierId), note: note || undefined, items }),
    });
    setSaving(false);
    if (res.ok) { reset(); onSaved(); }
    else { const e = await res.json(); setErr(e.error?.message ?? "บันทึกไม่สำเร็จ"); }
  }

  return (
    <Modal open={open} onClose={onClose} title="สร้างใบสั่งซื้อ" width="max-w-2xl">
      <div className="space-y-4">
        <div>
          <label className="label">ผู้ขาย</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">-- เลือกผู้ขาย --</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div>
          <label className="label">รายการสั่งซื้อ</label>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className="input flex-1"
                  value={l.ingredientId}
                  onChange={(e) => setLine(i, { ingredientId: e.target.value })}
                >
                  <option value="">-- วัตถุดิบ --</option>
                  {ingredients.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}
                </select>
                <input className="input w-20" type="number" placeholder="จำนวน" value={l.qty}
                  onChange={(e) => setLine(i, { qty: e.target.value })} />
                <input className="input w-24" type="number" placeholder="ราคา/หน่วย" value={l.unitCost}
                  onChange={(e) => setLine(i, { unitCost: e.target.value })} />
                <span className="w-24 text-right text-sm font-medium text-gray-700">{baht(lineAmount(l))}</span>
                <button
                  type="button"
                  onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, x) => x !== i) : ls)}
                  className="text-gray-400 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setLines((ls) => [...ls, { ingredientId: "", qty: "", unitCost: "" }])}
            className="btn-ghost mt-2"
          >
            <Plus className="h-4 w-4" /> เพิ่มรายการ
          </button>
        </div>

        <div>
          <label className="label">หมายเหตุ</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 pt-3">
          <span className="text-sm text-gray-500">ยอดรวมทั้งสิ้น</span>
          <span className="text-lg font-bold text-gray-800">{baht(grandTotal)}</span>
        </div>

        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button onClick={save} disabled={saving} className="btn-primary w-full">
          {saving ? "กำลังบันทึก..." : "บันทึกใบสั่งซื้อ"}
        </button>
      </div>
    </Modal>
  );
}

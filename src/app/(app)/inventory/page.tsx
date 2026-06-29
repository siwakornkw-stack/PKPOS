"use client";

import { useEffect, useState, useCallback } from "react";
import { Boxes, AlertTriangle, ArrowDownToLine, Pencil } from "lucide-react";
import { PageHeader, Modal, Badge } from "@/components/ui";
import { num, baht, fmtDateTime } from "@/lib/format";

interface Ing { id: number; code: string; name: string; unit: string; stockQty: number; reorderLevel: number; costPerUnit: number; isLow: boolean; }
interface Move { id: number; docNo: string; type: string; qty: number; balanceAfter: number; createdAt: string; ingredient: { name: string; unit: string }; }

const MOVE_LABEL: Record<string, string> = { RECEIVE: "รับเข้า", ISSUE: "เบิกออก", ADJUST: "ปรับยอด", COUNT: "นับสต็อก", SALE_DEDUCT: "ตัดขาย" };

export default function InventoryPage() {
  const [ingredients, setIngredients] = useState<Ing[]>([]);
  const [movements, setMovements] = useState<Move[]>([]);
  const [active, setActive] = useState<Ing | null>(null);

  const load = useCallback(async () => {
    const d = await (await fetch("/api/inventory")).json();
    setIngredients(d.ingredients ?? []);
    setMovements(d.movements ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const lowCount = ingredients.filter((i) => i.isLow).length;

  return (
    <div className="p-6">
      <PageHeader title="คลังสินค้า / วัตถุดิบ" subtitle={`${ingredients.length} รายการ - ใกล้หมด ${lowCount} รายการ`} icon={Boxes} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card overflow-hidden lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-200">
              <tr><th className="text-left px-4 py-2">รหัส</th><th className="text-left py-2">วัตถุดิบ</th><th className="text-right py-2">คงเหลือ</th><th className="text-right py-2">ขั้นต่ำ</th><th className="text-right py-2">ทุน/หน่วย</th><th className="py-2"></th></tr>
            </thead>
            <tbody>
              {ingredients.map((i) => (
                <tr key={i.id} className={`border-b border-gray-50 ${i.isLow ? "bg-rose-50/50" : "hover:bg-gray-50"}`}>
                  <td className="px-4 py-2 text-gray-400">{i.code}</td>
                  <td className="py-2 text-gray-700 flex items-center gap-1.5">
                    {i.isLow && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}{i.name}
                  </td>
                  <td className="py-2 text-right font-semibold text-gray-800">{num(i.stockQty, 1)} {i.unit}</td>
                  <td className="py-2 text-right text-gray-400">{num(i.reorderLevel, 1)}</td>
                  <td className="py-2 text-right text-gray-500">{baht(i.costPerUnit)}</td>
                  <td className="py-2 pr-4 text-right">
                    <button onClick={() => setActive(i)} className="btn-ghost px-2 py-1 text-xs"><ArrowDownToLine className="h-3.5 w-3.5" /> ปรับ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-4">
          <h3 className="font-bold text-gray-700 mb-3">ความเคลื่อนไหวล่าสุด</h3>
          <div className="space-y-2 max-h-[28rem] overflow-y-auto">
            {movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm border-b border-gray-50 pb-1.5">
                <div>
                  <p className="text-gray-700">{m.ingredient.name}</p>
                  <p className="text-[11px] text-gray-400">{MOVE_LABEL[m.type] ?? m.type} - {fmtDateTime(m.createdAt)}</p>
                </div>
                <span className={`font-semibold ${m.qty >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {m.qty >= 0 ? "+" : ""}{num(m.qty, 1)}
                </span>
              </div>
            ))}
            {movements.length === 0 && <p className="text-center text-gray-400 text-sm py-6">ยังไม่มีรายการ</p>}
          </div>
        </div>
      </div>

      <AdjustModal ing={active} onClose={() => setActive(null)} onSaved={() => { setActive(null); load(); }} />
    </div>
  );
}

function AdjustModal({ ing, onClose, onSaved }: { ing: Ing | null; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState("RECEIVE");
  const [qty, setQty] = useState(0);
  const [err, setErr] = useState("");
  useEffect(() => { if (ing) { setType("RECEIVE"); setQty(0); setErr(""); } }, [ing]);
  if (!ing) return null;

  async function save() {
    setErr("");
    // RECEIVE/ADJUST add qty; ISSUE subtracts; COUNT sets absolute
    let payloadQty = qty;
    if (type === "ISSUE") payloadQty = -Math.abs(qty);
    const res = await fetch("/api/inventory", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredientId: ing!.id, type, qty: payloadQty }),
    });
    if (res.ok) onSaved();
    else { const d = await res.json(); setErr(d.error?.message ?? "บันทึกไม่สำเร็จ"); }
  }

  return (
    <Modal open={!!ing} onClose={onClose} title={`ปรับสต็อก: ${ing.name}`}>
      <p className="text-sm text-gray-500 mb-3">คงเหลือปัจจุบัน <Badge className="bg-gray-100 text-gray-700">{num(ing.stockQty, 1)} {ing.unit}</Badge></p>
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {[["RECEIVE", "รับเข้า"], ["ISSUE", "เบิกออก"], ["ADJUST", "ปรับ +/-"], ["COUNT", "นับจริง"]].map(([v, l]) => (
          <button key={v} onClick={() => setType(v)} className={`rounded-lg py-1.5 text-xs font-medium border ${type === v ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200"}`}>{l}</button>
        ))}
      </div>
      <label className="label">{type === "COUNT" ? "จำนวนนับจริง" : "จำนวน"}</label>
      <input type="number" className="input" value={qty} onChange={(e) => setQty(Number(e.target.value))} autoFocus />
      {err && <p className="text-sm text-rose-600 mt-2">{err}</p>}
      <button onClick={save} className="btn-primary w-full mt-3">บันทึก</button>
    </Modal>
  );
}

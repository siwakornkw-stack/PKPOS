import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, ChevronLeft } from "lucide-react";
import type { Promo } from "../types";
import { listPromos, putPromo, deletePromo } from "../db";
import { baht } from "../lib/format";

const blank = (): Promo => ({ id: "", name: "", type: "percent", value: 10, minSpend: 0, active: true });

function describe(p: Promo): string {
  const cut = p.type === "percent" ? `ลด ${p.value}%` : `ลด ${baht(p.value)}`;
  return p.minSpend > 0 ? `${cut} เมื่อซื้อครบ ${baht(p.minSpend)}` : cut;
}

export default function Promos({ onBack }: { onBack: () => void }) {
  const [all, setAll] = useState<Promo[]>([]);
  const [edit, setEdit] = useState<Promo | null>(null);

  function reload() {
    listPromos().then(setAll);
  }
  useEffect(reload, []);

  async function save(p: Promo) {
    await putPromo({ ...p, id: p.id || crypto.randomUUID() });
    setEdit(null);
    reload();
  }
  async function remove(id: string) {
    if (!confirm("ลบโปรนี้?")) return;
    await deletePromo(id);
    reload();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center gap-2 p-3 bg-white border-b sticky top-0 z-10">
        <button onClick={onBack} className="p-1 -ml-1 text-slate-600">
          <ChevronLeft size={22} />
        </button>
        <h1 className="font-semibold text-lg flex-1">โปรโมชัน ({all.length})</h1>
        <button
          onClick={() => setEdit(blank())}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm shadow-sm active:scale-95 transition"
        >
          <Plus size={16} /> เพิ่ม
        </button>
      </div>

      <div className="divide-y bg-white">
        {all.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className={`font-medium truncate ${p.active ? "" : "text-slate-400 line-through"}`}>{p.name}</div>
              <div className="text-xs text-slate-500">{describe(p)}</div>
            </div>
            <button onClick={() => setEdit(p)} className="p-2 text-slate-500">
              <Pencil size={16} />
            </button>
            <button onClick={() => remove(p.id)} className="p-2 text-red-500">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {all.length === 0 && <div className="text-center text-slate-400 py-10">ยังไม่มีโปร กด "เพิ่ม"</div>}
      </div>

      <div className="p-3 text-xs text-slate-400">
        โปรที่เปิดอยู่และถึงยอดขั้นต่ำจะขึ้นให้เลือกในจอขาย ตอนกด "ส่วนลด"
      </div>

      {edit && <EditModal promo={edit} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  );
}

function EditModal({ promo, onClose, onSave }: { promo: Promo; onClose: () => void; onSave: (p: Promo) => void }) {
  const [f, setF] = useState<Promo>(promo);
  const valid = f.name.trim() !== "" && f.value > 0 && (f.type !== "percent" || f.value <= 100);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-20" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-lg">{promo.id ? "แก้โปร" : "เพิ่มโปร"}</h2>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <label className="block text-sm text-slate-500 mb-1">ชื่อโปร</label>
        <input
          autoFocus
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          placeholder="เช่น ลด 10% ช่วงเที่ยง"
          className="w-full border rounded-xl px-3 py-2 mb-3"
        />

        <label className="block text-sm text-slate-500 mb-1">แบบ</label>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setF({ ...f, type: "percent" })}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${f.type === "percent" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            เปอร์เซ็นต์
          </button>
          <button
            onClick={() => setF({ ...f, type: "amount" })}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${f.type === "amount" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            จำนวนบาท
          </button>
        </div>

        <label className="block text-sm text-slate-500 mb-1">{f.type === "percent" ? "ลดกี่ %" : "ลดกี่บาท"}</label>
        <input
          inputMode="decimal"
          value={f.value === 0 ? "" : String(f.value)}
          onChange={(e) => setF({ ...f, value: Math.max(0, parseFloat(e.target.value) || 0) })}
          className="w-full border rounded-xl px-3 py-2 mb-3"
        />
        {f.type === "percent" && f.value > 100 && <p className="text-xs text-rose-500 -mt-2 mb-3">เกิน 100%</p>}

        <label className="block text-sm text-slate-500 mb-1">ซื้อขั้นต่ำ (0 = ไม่กำหนด)</label>
        <input
          inputMode="decimal"
          value={f.minSpend === 0 ? "" : String(f.minSpend)}
          onChange={(e) => setF({ ...f, minSpend: Math.max(0, parseFloat(e.target.value) || 0) })}
          placeholder="0"
          className="w-full border rounded-xl px-3 py-2 mb-3"
        />

        <label className="flex items-center gap-2 mb-4">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          <span>เปิดใช้</span>
        </label>

        <button
          disabled={!valid}
          onClick={() => onSave({ ...f, name: f.name.trim() })}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40"
        >
          บันทึก
        </button>
      </div>
    </div>
  );
}

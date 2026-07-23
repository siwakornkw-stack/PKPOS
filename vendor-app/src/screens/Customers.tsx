import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, ChevronLeft, Search } from "lucide-react";
import type { Customer } from "../types";
import { listCustomers, putCustomer, deleteCustomer } from "../db";
import { baht } from "../lib/format";
import { tierFor, TIERS } from "../lib/points";

const blank = (): Customer => ({ id: "", name: "", phone: "", points: 0, spent: 0, ts: Date.now() });

export default function Customers({ onBack }: { onBack: () => void }) {
  const [all, setAll] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Customer | null>(null);

  function reload() {
    listCustomers().then(setAll);
  }
  useEffect(reload, []);

  const shown = useMemo(
    () => all.filter((c) => c.name.includes(q) || c.phone.includes(q)).sort((a, b) => b.spent - a.spent),
    [all, q]
  );

  async function save(c: Customer) {
    await putCustomer({ ...c, id: c.id || crypto.randomUUID() });
    setEdit(null);
    reload();
  }
  async function remove(id: string) {
    if (!confirm("ลบสมาชิกคนนี้? แต้มที่สะสมไว้จะหายไปด้วย")) return;
    await deleteCustomer(id);
    reload();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center gap-2 p-3 bg-white border-b sticky top-0 z-10">
        <button onClick={onBack} className="p-1 -ml-1 text-slate-600">
          <ChevronLeft size={22} />
        </button>
        <h1 className="font-semibold text-lg flex-1">สมาชิก ({all.length})</h1>
        <button
          onClick={() => setEdit(blank())}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm shadow-sm active:scale-95 transition"
        >
          <Plus size={16} /> เพิ่ม
        </button>
      </div>

      <div className="p-3">
        <div className="flex items-center gap-2 bg-white border rounded-xl px-3">
          <Search size={16} className="text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นชื่อ / เบอร์"
            className="flex-1 bg-transparent py-2.5 outline-none text-sm"
          />
        </div>
      </div>

      <div className="divide-y bg-white">
        {shown.map((c) => {
          const t = tierFor(c.spent);
          return (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs text-slate-500">
                  {c.phone || "ไม่มีเบอร์"} · {t.name} · ซื้อสะสม {baht(c.spent)}
                </div>
              </div>
              <div className="text-emerald-600 font-semibold shrink-0">{c.points} แต้ม</div>
              <button onClick={() => setEdit(c)} className="p-2 text-slate-500">
                <Pencil size={16} />
              </button>
              <button onClick={() => remove(c.id)} className="p-2 text-red-500">
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
        {shown.length === 0 && (
          <div className="text-center text-slate-400 py-10">{all.length === 0 ? 'ยังไม่มีสมาชิก กด "เพิ่ม"' : "ไม่พบสมาชิก"}</div>
        )}
      </div>

      <div className="p-3 text-xs text-slate-400">
        ระดับสมาชิกเลื่อนอัตโนมัติตามยอดซื้อสะสม:{" "}
        {TIERS.map((t) => `${t.name} ${baht(t.minSpent)} (x${t.multiplier})`).join(" · ")}
      </div>

      {edit && <EditModal customer={edit} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  );
}

function EditModal({
  customer,
  onClose,
  onSave,
}: {
  customer: Customer;
  onClose: () => void;
  onSave: (c: Customer) => void;
}) {
  const [f, setF] = useState<Customer>(customer);
  const valid = f.name.trim() !== "";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-20" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-lg">{customer.id ? "แก้สมาชิก" : "เพิ่มสมาชิก"}</h2>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <label className="block text-sm text-slate-500 mb-1">ชื่อ</label>
        <input
          autoFocus
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          className="w-full border rounded-xl px-3 py-2 mb-3"
        />
        <label className="block text-sm text-slate-500 mb-1">เบอร์โทร</label>
        <input
          value={f.phone}
          onChange={(e) => setF({ ...f, phone: e.target.value })}
          inputMode="tel"
          className="w-full border rounded-xl px-3 py-2 mb-3"
        />
        <label className="block text-sm text-slate-500 mb-1">แต้มคงเหลือ</label>
        <input
          inputMode="numeric"
          value={String(f.points)}
          onChange={(e) => setF({ ...f, points: Math.max(0, parseInt(e.target.value) || 0) })}
          className="w-full border rounded-xl px-3 py-2 mb-4"
        />
        <button
          disabled={!valid}
          onClick={() => onSave({ ...f, name: f.name.trim(), phone: f.phone.trim() })}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40"
        >
          บันทึก
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import type { Item } from "../types";
import { listItems, putItem, deleteItem } from "../db";
import { ensureSeed } from "../seed";
import { baht } from "../lib/format";

const blank = (): Item => ({ id: "", name: "", price: 0, category: "อาหาร", active: true });

export default function Menu() {
  const [items, setItems] = useState<Item[]>([]);
  const [edit, setEdit] = useState<Item | null>(null);

  async function reload() {
    await ensureSeed();
    setItems(await listItems());
  }
  useEffect(() => {
    reload();
  }, []);

  async function save(it: Item) {
    await putItem({ ...it, id: it.id || crypto.randomUUID() });
    setEdit(null);
    reload();
  }
  async function remove(id: string) {
    if (!confirm("ลบเมนูนี้?")) return;
    await deleteItem(id);
    reload();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center justify-between p-3 bg-white border-b sticky top-0">
        <h1 className="font-semibold text-lg">เมนู ({items.length})</h1>
        <button onClick={() => setEdit(blank())} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm shadow-sm active:scale-95 transition">
          <Plus size={16} /> เพิ่ม
        </button>
      </div>
      <div className="divide-y bg-white">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className={`font-medium truncate ${it.active ? "" : "text-slate-400 line-through"}`}>{it.name}</div>
              <div className="text-xs text-slate-500">{it.category}</div>
            </div>
            <div className="text-emerald-600 font-semibold">{baht(it.price)}</div>
            <button onClick={() => setEdit(it)} className="p-2 text-slate-500">
              <Pencil size={16} />
            </button>
            <button onClick={() => remove(it.id)} className="p-2 text-red-500">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {items.length === 0 && <div className="text-center text-slate-400 py-10">ยังไม่มีเมนู กด "เพิ่ม"</div>}
      </div>

      {edit && <EditModal item={edit} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  );
}

function EditModal({ item, onClose, onSave }: { item: Item; onClose: () => void; onSave: (i: Item) => void }) {
  const [f, setF] = useState<Item>(item);
  const valid = f.name.trim() !== "" && f.price >= 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-10" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-lg">{item.id ? "แก้เมนู" : "เพิ่มเมนู"}</h2>
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
        <label className="block text-sm text-slate-500 mb-1">ราคา</label>
        <input
          inputMode="decimal"
          value={f.price === 0 ? "" : String(f.price)}
          onChange={(e) => setF({ ...f, price: parseFloat(e.target.value) || 0 })}
          placeholder="0"
          className="w-full border rounded-xl px-3 py-2 mb-3"
        />
        <label className="block text-sm text-slate-500 mb-1">หมวด</label>
        <input
          value={f.category}
          onChange={(e) => setF({ ...f, category: e.target.value })}
          className="w-full border rounded-xl px-3 py-2 mb-3"
        />
        <label className="flex items-center gap-2 mb-4">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          <span>เปิดขาย</span>
        </label>
        <button
          disabled={!valid}
          onClick={() => onSave(f)}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40"
        >
          บันทึก
        </button>
      </div>
    </div>
  );
}

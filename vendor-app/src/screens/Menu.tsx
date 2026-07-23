import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, ChevronDown, ChevronRight } from "lucide-react";
import type { Item, OptionGroup } from "../types";
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
      <div className="flex items-center justify-between p-3 bg-white border-b sticky top-0 z-10">
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
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <span>{it.category}</span>
                {it.options?.length ? <span className="text-emerald-600">{it.options.length} ตัวเลือก</span> : null}
                {it.stock !== undefined && (
                  <span className={it.stock <= 0 ? "text-red-500 font-medium" : "text-slate-500"}>
                    {it.stock <= 0 ? "หมด" : `เหลือ ${it.stock}`}
                  </span>
                )}
              </div>
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
  const [showOpts, setShowOpts] = useState((item.options?.length ?? 0) > 0);
  const valid = f.name.trim() !== "" && f.price >= 0;
  const tracked = f.stock !== undefined;

  function setGroups(options: OptionGroup[]) {
    setF({ ...f, options });
  }
  function addGroup() {
    setShowOpts(true);
    setGroups([
      ...(f.options ?? []),
      { id: crypto.randomUUID(), name: "", multi: false, required: false, choices: [] },
    ]);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-10" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="font-semibold text-lg">{item.id ? "แก้เมนู" : "เพิ่มเมนู"}</h2>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
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

          <label className="flex items-center gap-2 mb-3">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
            <span>เปิดขาย</span>
          </label>

          {/* Stock is opt-in: leave it off and the item never runs out, which is what most stalls want. */}
          <label className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={tracked}
              onChange={(e) => setF({ ...f, stock: e.target.checked ? 0 : undefined })}
            />
            <span>นับสต็อก</span>
          </label>
          {tracked && (
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => setF({ ...f, stock: Math.max(0, (f.stock ?? 0) - 1) })}
                className="p-2.5 rounded-lg bg-slate-100"
              >
                <span className="block w-4 text-center leading-none">-</span>
              </button>
              <input
                inputMode="numeric"
                value={String(f.stock ?? 0)}
                onChange={(e) => setF({ ...f, stock: Math.max(0, parseInt(e.target.value) || 0) })}
                className="flex-1 border rounded-xl px-3 py-2 text-center"
              />
              <button
                type="button"
                onClick={() => setF({ ...f, stock: (f.stock ?? 0) + 1 })}
                className="p-2.5 rounded-lg bg-slate-100"
              >
                <span className="block w-4 text-center leading-none">+</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowOpts((v) => !v)}
            className="w-full flex items-center gap-1 py-2 text-sm text-slate-600 border-t mt-1"
          >
            {showOpts ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            ตัวเลือก / ท็อปปิ้ง {f.options?.length ? `(${f.options.length})` : ""}
          </button>

          {showOpts && (
            <div className="space-y-3">
              {(f.options ?? []).map((g, gi) => (
                <GroupEditor
                  key={g.id}
                  group={g}
                  onChange={(ng) => setGroups((f.options ?? []).map((x, i) => (i === gi ? ng : x)))}
                  onDelete={() => setGroups((f.options ?? []).filter((_, i) => i !== gi))}
                />
              ))}
              <button
                type="button"
                onClick={addGroup}
                className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-500 text-sm"
              >
                + เพิ่มกลุ่มตัวเลือก
              </button>
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          <button
            disabled={!valid}
            onClick={() => onSave(f)}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupEditor({
  group,
  onChange,
  onDelete,
}: {
  group: OptionGroup;
  onChange: (g: OptionGroup) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={group.name}
          onChange={(e) => onChange({ ...group, name: e.target.value })}
          placeholder="ชื่อกลุ่ม เช่น ท็อปปิ้ง"
          className="flex-1 border rounded-lg px-2.5 py-2 text-sm"
        />
        <button onClick={onDelete} className="p-2 text-red-500">
          <Trash2 size={16} />
        </button>
      </div>
      <div className="flex gap-3 text-sm text-slate-600">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={group.multi} onChange={(e) => onChange({ ...group, multi: e.target.checked })} />
          เลือกหลายอย่าง
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={group.required}
            onChange={(e) => onChange({ ...group, required: e.target.checked })}
          />
          ต้องเลือก
        </label>
      </div>
      {group.choices.map((c, ci) => (
        <div key={c.id} className="flex items-center gap-2">
          <input
            value={c.name}
            onChange={(e) =>
              onChange({ ...group, choices: group.choices.map((x, i) => (i === ci ? { ...x, name: e.target.value } : x)) })
            }
            placeholder="ชื่อ"
            className="flex-1 border rounded-lg px-2.5 py-1.5 text-sm"
          />
          <input
            inputMode="decimal"
            value={c.price === 0 ? "" : String(c.price)}
            onChange={(e) =>
              onChange({
                ...group,
                choices: group.choices.map((x, i) => (i === ci ? { ...x, price: parseFloat(e.target.value) || 0 } : x)),
              })
            }
            placeholder="+0"
            className="w-20 border rounded-lg px-2.5 py-1.5 text-sm text-right"
          />
          <button
            onClick={() => onChange({ ...group, choices: group.choices.filter((_, i) => i !== ci) })}
            className="p-1.5 text-red-500"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({ ...group, choices: [...group.choices, { id: crypto.randomUUID(), name: "", price: 0 }] })
        }
        className="text-sm text-emerald-600"
      >
        + เพิ่มตัวเลือก
      </button>
    </div>
  );
}

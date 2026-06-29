"use client";

import { useEffect, useState, useCallback } from "react";
import { ChefHat, Plus, Trash2, Pencil } from "lucide-react";
import { PageHeader, Modal, Badge, EmptyState } from "@/components/ui";

interface MenuItemLite { id: number; code: string; name: string; }
interface Category { id: number; name: string; items: MenuItemLite[]; }
interface Ingredient { id: number; code: string; name: string; unit: string; }
interface RecipeRow { ingredientId: number; qty: number; name?: string; }

export default function RecipesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<MenuItemLite | null>(null);

  const load = useCallback(async () => {
    const d = await (await fetch("/api/menu")).json();
    setCategories(d.categories ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const total = categories.reduce((s, c) => s + c.items.length, 0);

  return (
    <div className="p-6">
      <PageHeader
        title="สูตรอาหาร / BOM"
        subtitle={`${total} เมนู`}
        icon={ChefHat}
      />

      {categories.length === 0 && <EmptyState message="ยังไม่มีเมนู" />}

      <div className="space-y-6">
        {categories.map((c) => (
          <div key={c.id}>
            <h2 className="text-sm font-semibold text-gray-500 mb-2">{c.name}</h2>
            <div className="card divide-y divide-gray-100">
              {c.items.length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-400">ไม่มีเมนูในหมวดนี้</p>
              )}
              {c.items.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setEditing(m)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <Badge className="bg-gray-100 text-gray-600">{m.code}</Badge>
                    <span className="font-medium text-gray-800">{m.name}</span>
                  </div>
                  <Pencil className="h-4 w-4 text-gray-400" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <RecipeModal
          menuItem={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RecipeModal({ menuItem, onClose }: { menuItem: MenuItemLite; onClose: () => void }) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [ing, rec] = await Promise.all([
        (await fetch("/api/ingredients")).json(),
        (await fetch(`/api/recipes/${menuItem.id}`)).json(),
      ]);
      setIngredients(ing.ingredients ?? []);
      setRows((rec.recipe ?? []).map((r: { ingredientId: number; qty: number; name?: string }) => ({
        ingredientId: r.ingredientId, qty: r.qty, name: r.name,
      })));
    })();
  }, [menuItem.id]);

  function addRow() {
    setRows([...rows, { ingredientId: 0, qty: 1 }]);
  }
  function setRow(i: number, patch: Partial<RecipeRow>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows(rows.filter((_, idx) => idx !== i));
  }

  async function save() {
    setErr("");
    const items = rows
      .filter((r) => r.ingredientId > 0 && r.qty > 0)
      .map((r) => ({ ingredientId: r.ingredientId, qty: Number(r.qty) }));
    setSaving(true);
    const res = await fetch(`/api/recipes/${menuItem.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    setSaving(false);
    if (res.ok) onClose();
    else {
      const d = await res.json();
      setErr(d.error?.message ?? "บันทึกไม่สำเร็จ");
    }
  }

  return (
    <Modal open onClose={onClose} title={`สูตร: ${menuItem.name}`} width="max-w-lg">
      <div className="space-y-3">
        {rows.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีวัตถุดิบในสูตรนี้</p>
        )}
        {rows.map((r, i) => {
          const unit = ingredients.find((ing) => ing.id === r.ingredientId)?.unit;
          return (
            <div key={i} className="flex items-center gap-2">
              <select
                className="input flex-1"
                value={r.ingredientId}
                onChange={(e) => setRow(i, { ingredientId: Number(e.target.value) })}
              >
                <option value={0}>เลือกวัตถุดิบ</option>
                {/* keep a deactivated/removed ingredient visible so its selection isn't silently lost */}
                {r.ingredientId > 0 && !ingredients.some((ing) => ing.id === r.ingredientId) && (
                  <option value={r.ingredientId}>{r.name ?? `#${r.ingredientId}`} (ปิดใช้งาน)</option>
                )}
                {ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>{ing.name}</option>
                ))}
              </select>
              <input
                type="number"
                step="any"
                min="0"
                className="input w-24"
                value={r.qty}
                onChange={(e) => setRow(i, { qty: Number(e.target.value) })}
              />
              <span className="w-10 text-sm text-gray-400">{unit ?? ""}</span>
              <button onClick={() => removeRow(i)} className="btn-ghost text-rose-600 px-2">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}

        <button onClick={addRow} className="btn-ghost w-full">
          <Plus className="h-4 w-4" /> เพิ่มวัตถุดิบ
        </button>

        {err && <p className="text-sm text-rose-600">{err}</p>}

        <button onClick={save} disabled={saving} className="btn-primary w-full">
          {saving ? "กำลังบันทึก..." : "บันทึกสูตร"}
        </button>
      </div>
    </Modal>
  );
}

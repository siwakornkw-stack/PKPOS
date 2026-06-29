"use client";

import { useEffect, useState, useCallback } from "react";
import { ClipboardList } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { num } from "@/lib/format";

interface Ing {
  id: number;
  code: string;
  name: string;
  unit: string;
  stockQty: number;
}
interface Variance {
  name: string;
  before: number;
  counted: number;
  variance: number;
}

export default function StockCountPage() {
  const [ingredients, setIngredients] = useState<Ing[]>([]);
  const [counted, setCounted] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ adjusted: number; variances: Variance[] } | null>(null);

  const load = useCallback(async () => {
    const d = await (await fetch("/api/inventory")).json();
    const list: Ing[] = d.ingredients ?? [];
    setIngredients(list);
    const init: Record<number, number> = {};
    for (const i of list) init[i.id] = i.stockQty;
    setCounted(init);
    setResult(null);
    setErr("");
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function variance(i: Ing) {
    const c = counted[i.id] ?? 0;
    return Math.round((c - i.stockQty + Number.EPSILON) * 100) / 100;
  }

  async function save() {
    setErr("");
    setSaving(true);
    const counts = ingredients.map((i) => ({ ingredientId: i.id, countedQty: counted[i.id] ?? 0 }));
    const res = await fetch("/api/stock-count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counts }),
    });
    setSaving(false);
    if (res.ok) {
      const d = await res.json();
      setResult(d);
    } else {
      const d = await res.json();
      setErr(d.error?.message ?? "บันทึกไม่สำเร็จ");
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="นับสต็อก"
        subtitle={`${ingredients.length} รายการ`}
        icon={ClipboardList}
        actions={
          <button onClick={save} disabled={saving || ingredients.length === 0} className="btn-primary">
            {saving ? "กำลังบันทึก..." : "บันทึกผลนับ"}
          </button>
        }
      />

      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      {result && (
        <div className="card p-4 mb-4">
          <h3 className="font-bold text-gray-700 mb-2">
            ปรับยอด {num(result.adjusted)} รายการ
          </h3>
          {result.variances.filter((v) => v.variance !== 0).length === 0 ? (
            <p className="text-sm text-gray-500">ไม่มีส่วนต่าง</p>
          ) : (
            <div className="space-y-1">
              {result.variances
                .filter((v) => v.variance !== 0)
                .map((v, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm border-b border-gray-50 pb-1">
                    <span className="text-gray-700">{v.name}</span>
                    <span className="text-gray-400">
                      {num(v.before, 1)} {"->"} {num(v.counted, 1)}{" "}
                      <span className={`font-semibold ${v.variance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        ({v.variance >= 0 ? "+" : ""}
                        {num(v.variance, 1)})
                      </span>
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2">รหัส</th>
              <th className="text-left py-2">วัตถุดิบ</th>
              <th className="text-right py-2">ยอดระบบ</th>
              <th className="text-right py-2 pr-4">นับจริง</th>
              <th className="text-right py-2 pr-4">ส่วนต่าง</th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map((i) => {
              const v = variance(i);
              return (
                <tr key={i.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400">{i.code}</td>
                  <td className="py-2 text-gray-700">{i.name}</td>
                  <td className="py-2 text-right text-gray-500">
                    {num(i.stockQty, 1)} {i.unit}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <input
                      type="number"
                      className="input w-28 text-right"
                      value={counted[i.id] ?? 0}
                      onChange={(e) => setCounted((s) => ({ ...s, [i.id]: Number(e.target.value) }))}
                    />
                  </td>
                  <td className={`py-2 pr-4 text-right font-semibold ${v === 0 ? "text-gray-400" : v > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {v > 0 ? "+" : ""}
                    {num(v, 1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {ingredients.length === 0 && <EmptyState message="ยังไม่มีวัตถุดิบ" />}
      </div>
    </div>
  );
}

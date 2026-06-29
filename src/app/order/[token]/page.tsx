"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Minus, Send, Check, Loader2, UtensilsCrossed } from "lucide-react";
import { baht } from "@/lib/format";

interface PItem { id: number; code: string; name: string; price: number; isCombo: boolean; }
interface PCat { id: number; name: string; items: PItem[]; }
interface Line { menuItemId: number; name: string; price: number; qty: number; }

export default function SelfOrderPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<{ table: { code: string }; branch: { name: string }; categories: PCat[] } | null>(null);
  const [err, setErr] = useState("");
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const [cart, setCart] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/public/menu?token=${token}`).then((r) => r.json()).then((d) => {
      if (d.error) setErr(d.error.message);
      else setData(d);
    });
  }, [token]);

  const items = useMemo(() => {
    if (!data) return [];
    if (activeCat === "all") return data.categories.flatMap((c) => c.items);
    return data.categories.find((c) => c.id === activeCat)?.items ?? [];
  }, [data, activeCat]);

  function add(m: PItem) {
    setCart((c) => {
      const i = c.findIndex((l) => l.menuItemId === m.id);
      if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
      return [...c, { menuItemId: m.id, name: m.name, price: m.price, qty: 1 }];
    });
  }
  function setQty(id: number, d: number) {
    setCart((c) => c.map((l) => l.menuItemId === id ? { ...l, qty: Math.max(0, l.qty + d) } : l).filter((l) => l.qty > 0));
  }
  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);

  async function submit() {
    setBusy(true);
    const res = await fetch("/api/public/order", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, items: cart.map((l) => ({ menuItemId: l.menuItemId, qty: l.qty })) }),
    });
    setBusy(false);
    if (res.ok) { setDone(true); setCart([]); }
    else alert((await res.json()).error?.message ?? "สั่งไม่สำเร็จ");
  }

  if (err) return <div className="min-h-screen flex items-center justify-center text-gray-500">{err}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-gray-400">กำลังโหลด...</div>;

  if (done) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center bg-gray-50">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600"><Check className="h-8 w-8" /></div>
      <h1 className="text-xl font-bold text-gray-800">ส่งออเดอร์แล้ว</h1>
      <p className="text-gray-500">ครัวกำลังเตรียมอาหารให้ โต๊ะ {data.table.code}</p>
      <button onClick={() => setDone(false)} className="btn-primary mt-2">สั่งเพิ่ม</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <header className="bg-brand-700 text-white px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-2"><UtensilsCrossed className="h-5 w-5" /><div>
          <p className="font-bold leading-tight">{data.branch.name}</p>
          <p className="text-xs text-brand-200">โต๊ะ {data.table.code} · สั่งอาหารด้วยตัวเอง</p>
        </div></div>
      </header>

      <div className="flex gap-2 overflow-x-auto p-3 sticky top-[60px] bg-gray-50 z-10">
        <Tab active={activeCat === "all"} onClick={() => setActiveCat("all")}>ทั้งหมด</Tab>
        {data.categories.map((c) => <Tab key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>{c.name}</Tab>)}
      </div>

      <div className="grid grid-cols-2 gap-3 px-3">
        {items.map((m) => (
          <button key={m.id} onClick={() => add(m)} className="bg-white rounded-xl border border-gray-200 p-3 text-left active:scale-95 transition">
            <div className="h-20 rounded-lg bg-gradient-to-br from-brand-100 to-emerald-50 mb-2 flex items-center justify-center text-brand-600 font-bold text-xl">{m.name.charAt(0)}</div>
            <p className="text-sm font-medium text-gray-700 leading-tight">{m.name}{m.isCombo && <span className="text-[10px] text-blue-500"> (ชุด)</span>}</p>
            <p className="text-sm font-bold text-brand-600 mt-0.5">{baht(m.price)}</p>
          </button>
        ))}
      </div>

      {cart.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 p-3 shadow-lg">
          <div className="max-h-32 overflow-y-auto mb-2 space-y-1">
            {cart.map((l) => (
              <div key={l.menuItemId} className="flex items-center gap-2 text-sm">
                <button onClick={() => setQty(l.menuItemId, -1)} className="h-7 w-7 rounded bg-gray-100 flex items-center justify-center"><Minus className="h-3.5 w-3.5" /></button>
                <span className="w-5 text-center">{l.qty}</span>
                <button onClick={() => setQty(l.menuItemId, 1)} className="h-7 w-7 rounded bg-gray-100 flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></button>
                <span className="flex-1 text-gray-700">{l.name}</span>
                <span className="text-gray-600">{baht(l.price * l.qty)}</span>
              </div>
            ))}
          </div>
          <button onClick={submit} disabled={busy} className="btn-primary w-full py-3">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} ส่งออเดอร์ · {baht(total)}
          </button>
        </div>
      )}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${active ? "bg-brand-600 text-white" : "bg-white text-gray-600 border border-gray-200"}`}>{children}</button>;
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { ChefHat, Clock, RefreshCw, Flame, CheckCircle2, Bell } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { fmtTime } from "@/lib/format";

interface KItem { id: number; name: string; qty: number; note: string | null; status: string; station: string | null; options: string[]; combo: string[]; }
interface Ticket { id: number; docNo: string; orderType: string; table: string | null; queueNo: number | null; createdAt: string; items: KItem[]; }

const NEXT: Record<string, string> = { PENDING: "COOKING", COOKING: "DONE", DONE: "SERVED" };
const ACTION: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  PENDING: { label: "เริ่มทำ", icon: Flame, cls: "bg-amber-500 hover:bg-amber-600" },
  COOKING: { label: "ทำเสร็จ", icon: CheckCircle2, cls: "bg-blue-500 hover:bg-blue-600" },
  DONE: { label: "เสิร์ฟแล้ว", icon: Bell, cls: "bg-emerald-600 hover:bg-emerald-700" },
};

export default function KitchenPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stations, setStations] = useState<string[]>([]);
  const [station, setStation] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const d = await (await fetch(`/api/kitchen${station ? `?station=${encodeURIComponent(station)}` : ""}`)).json();
    setTickets(d.tickets ?? []);
    setStations(d.stations ?? []);
    setLoading(false);
  }, [station]);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  async function bump(itemId: number, status: string) {
    const next = NEXT[status];
    if (!next) return;
    setTickets((ts) =>
      ts.map((t) => ({ ...t, items: t.items.map((i) => (i.id === itemId ? { ...i, status: next } : i)) }))
    );
    const res = await fetch(`/api/orders/items/${itemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }),
    });
    if (!res.ok) { load(); return; } // revert the optimistic change if the server rejected it
    if (next === "SERVED") setTimeout(load, 400);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="ครัว (Kitchen Display)" subtitle="คิวออเดอร์ที่ต้องทำ" icon={ChefHat}
        actions={
          <>
            {stations.length > 0 && (
              <select value={station} onChange={(e) => setStation(e.target.value)} className="input w-auto">
                <option value="">ทุกจุด</option>
                {stations.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <button onClick={load} className="btn-ghost"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> รีเฟรช</button>
          </>
        }
      />

      {tickets.length === 0 ? (
        <EmptyState message="ไม่มีออเดอร์ค้างในครัว" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tickets.map((t) => (
            <div key={t.id} className="card overflow-hidden">
              <div className="bg-brand-700 text-white px-4 py-2 flex items-center justify-between">
                <div>
                  <p className="font-bold">{t.table ? `โต๊ะ ${t.table}` : t.queueNo ? `คิว ${t.queueNo}` : t.orderType}</p>
                  <p className="text-[11px] text-brand-200">{t.docNo}</p>
                </div>
                <span className="flex items-center gap-1 text-xs"><Clock className="h-3.5 w-3.5" />{fmtTime(t.createdAt)}</span>
              </div>
              <div className="p-3 space-y-2">
                {t.items.map((i) => {
                  const a = ACTION[i.status];
                  return (
                    <div key={i.id} className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 font-bold text-gray-700 text-sm">{i.qty}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">{i.name}</p>
                        {i.combo.length > 0 && <p className="text-xs text-blue-600">▪ {i.combo.join(", ")}</p>}
                        {i.options.length > 0 && <p className="text-xs text-brand-600">+ {i.options.join(", ")}</p>}
                        {i.note && <p className="text-xs text-accent-600">* {i.note}</p>}
                      </div>
                      {a && (
                        <button onClick={() => bump(i.id, i.status)} className={`btn text-white text-xs px-2.5 py-1.5 ${a.cls}`}>
                          <a.icon className="h-3.5 w-3.5" /> {a.label}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { MonitorSmartphone } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { baht } from "@/lib/format";

interface TableRow {
  id: number;
  code: string;
  status: string;
  order: { id: number; netAmount: number } | null;
}

interface OrderItem {
  id: number;
  name: string;
  qty: number;
  unitPrice: number;
  lineAmount: number;
  status: string;
  options?: { name: string }[];
}

interface OrderDetail {
  docNo: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  serviceCharge: number;
  taxAmount: number;
  netAmount: number;
  table?: { code: string };
}

export default function DisplayPage() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);

  const loadTables = useCallback(async () => {
    try {
      const d = await (await fetch("/api/tables")).json();
      const rows: TableRow[] = (d.tables ?? []).filter((t: TableRow) => t.status === "OCCUPIED");
      setTables(rows);
      setSelected((prev) => {
        if (prev != null && rows.some((t) => t.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
    } catch {
      // transient fetch/parse error on the 4s polling loop: keep the last good state, don't crash
    }
  }, []);

  useEffect(() => { loadTables(); }, [loadTables]);

  const loadOrder = useCallback(async () => {
    if (selected == null) { setOrder(null); return; }
    const table = tables.find((t) => t.id === selected);
    const orderId = table?.order?.id;
    if (!orderId) { setOrder(null); return; }
    try {
      const d = await (await fetch(`/api/orders/${orderId}`)).json();
      setOrder(d.order ?? null);
    } catch {
      // transient error: keep showing the last good order rather than crashing the display
    }
  }, [selected, tables]);

  useEffect(() => { loadOrder(); }, [loadOrder]);

  useEffect(() => {
    const t = setInterval(() => { loadTables(); loadOrder(); }, 4000);
    return () => clearInterval(t);
  }, [loadTables, loadOrder]);

  return (
    <div className="p-6">
      <PageHeader
        title="จอแสดงผลลูกค้า"
        subtitle="แสดงรายการสั่งซื้อสำหรับลูกค้า"
        icon={MonitorSmartphone}
        actions={
          <select
            className="input w-44"
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : null)}
          >
            {tables.length === 0 && <option value="">ไม่มีโต๊ะที่ใช้งาน</option>}
            {tables.map((t) => (
              <option key={t.id} value={t.id}>โต๊ะ {t.code}</option>
            ))}
          </select>
        }
      />

      <div className="rounded-2xl bg-gray-900 text-white shadow-xl overflow-hidden">
        {order ? (
          <div>
            <div className="flex items-end justify-between px-8 py-6 border-b border-white/10">
              <div>
                <p className="text-sm uppercase tracking-widest text-brand-300">ยินดีต้อนรับ</p>
                <h2 className="text-3xl font-bold">รายการสั่งซื้อของท่าน</h2>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-400">โต๊ะ</p>
                <p className="text-3xl font-bold">{order.table?.code ?? "-"}</p>
                <p className="text-xs text-gray-500">{order.docNo}</p>
              </div>
            </div>

            <ul className="divide-y divide-white/10">
              {order.items.map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-4 px-8 py-5">
                  <div className="min-w-0">
                    <p className="text-2xl font-semibold">
                      <span className="text-brand-300">{it.qty}x</span> {it.name}
                    </p>
                    {it.options && it.options.length > 0 && (
                      <p className="text-base text-gray-400 mt-1">
                        {it.options.map((o) => o.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <p className="text-2xl font-bold tabular-nums whitespace-nowrap">{baht(it.lineAmount)}</p>
                </li>
              ))}
              {order.items.length === 0 && (
                <li className="px-8 py-10 text-center text-xl text-gray-400">ยังไม่มีรายการ</li>
              )}
            </ul>

            <div className="px-8 py-6 border-t border-white/10 space-y-2 text-lg">
              <div className="flex justify-between text-gray-300">
                <span>ยอดรวม</span>
                <span className="tabular-nums">{baht(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>ส่วนลด</span>
                  <span className="tabular-nums">-{baht(order.discount)}</span>
                </div>
              )}
              {order.serviceCharge > 0 && (
                <div className="flex justify-between text-gray-300">
                  <span>ค่าบริการ</span>
                  <span className="tabular-nums">{baht(order.serviceCharge)}</span>
                </div>
              )}
              {order.taxAmount > 0 && (
                <div className="flex justify-between text-gray-300">
                  <span>ภาษีมูลค่าเพิ่ม (VAT)</span>
                  <span className="tabular-nums">{baht(order.taxAmount)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between pt-4 mt-2 border-t border-white/20">
                <span className="text-xl font-medium">ยอดสุทธิ</span>
                <span className="text-5xl font-extrabold text-brand-300 tabular-nums">{baht(order.netAmount)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <MonitorSmartphone className="h-16 w-16 text-brand-300 mb-6" />
            <p className="text-4xl font-bold">ยินดีต้อนรับ</p>
            <p className="text-lg text-gray-400 mt-3">ขอบคุณที่ใช้บริการ</p>
          </div>
        )}
      </div>
    </div>
  );
}

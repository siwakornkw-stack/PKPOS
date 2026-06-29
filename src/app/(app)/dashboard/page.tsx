"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  LayoutDashboard, Wallet, Receipt, TrendingUp, AlertTriangle, Grid3x3,
} from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/ui";
import { baht, num } from "@/lib/format";

interface DashData {
  kpis: { todaySales: number; orderCount: number; avgBill: number; lowStockCount: number; openTables: number };
  days: { label: string; total: number }[];
  topMenu: { name: string; qty: number }[];
  paymentMix: { method: string; amount: number }[];
  lowStock: { name: string; stockQty: number; unit: string; reorderLevel: number }[];
}

const PIE_COLORS = ["#10b981", "#f97316", "#3b82f6", "#a855f7"];
const METHOD_LABEL: Record<string, string> = { CASH: "เงินสด", QR: "QR", CARD: "บัตร" };

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard").then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <div className="p-6 text-gray-400">กำลังโหลด...</div>;

  return (
    <div className="p-6">
      <PageHeader title="แดชบอร์ด" subtitle="ภาพรวมยอดขายวันนี้" icon={LayoutDashboard} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="ยอดขายวันนี้" value={baht(data.kpis.todaySales)} icon={Wallet} tone="brand" />
        <StatCard label="จำนวนบิล" value={num(data.kpis.orderCount)} icon={Receipt} tone="blue" />
        <StatCard label="บิลเฉลี่ย" value={baht(data.kpis.avgBill)} icon={TrendingUp} tone="accent" />
        <StatCard label="โต๊ะที่มีลูกค้า" value={num(data.kpis.openTables)} icon={Grid3x3} tone="blue" />
        <StatCard label="วัตถุดิบใกล้หมด" value={num(data.kpis.lowStockCount)} icon={AlertTriangle} tone="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-bold text-gray-700 mb-4">ยอดขาย 7 วันล่าสุด</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.days}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => baht(v)} />
              <Bar dataKey="total" fill="#10b981" radius={[6, 6, 0, 0]} name="ยอดขาย" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="font-bold text-gray-700 mb-4">สัดส่วนการชำระเงิน (วันนี้)</h3>
          {data.paymentMix.length === 0 ? (
            <EmptyState message="ยังไม่มียอดขายวันนี้" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={data.paymentMix}
                  dataKey="amount"
                  nameKey="method"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {data.paymentMix.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend formatter={(v) => METHOD_LABEL[v] ?? v} />
                <Tooltip formatter={(v: number) => baht(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-bold text-gray-700 mb-4">เมนูขายดี (7 วัน)</h3>
          {data.topMenu.length === 0 ? (
            <EmptyState message="ยังไม่มีข้อมูล" />
          ) : (
            <ul className="space-y-3">
              {data.topMenu.map((m, i) => (
                <li key={m.name} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-gray-700">{m.name}</span>
                  <span className="text-sm font-semibold text-gray-800">{num(m.qty)} จาน</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5 lg:col-span-2">
          <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-500" /> แจ้งเตือนวัตถุดิบใกล้หมด
          </h3>
          {data.lowStock.length === 0 ? (
            <EmptyState message="สต็อกเพียงพอทุกรายการ" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.lowStock.map((s) => (
                <div key={s.name} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                  <p className="text-sm font-medium text-gray-700">{s.name}</p>
                  <p className="text-xs text-rose-600">
                    เหลือ {num(s.stockQty, 1)} {s.unit} (ขั้นต่ำ {num(s.reorderLevel, 1)})
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

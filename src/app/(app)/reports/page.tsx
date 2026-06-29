"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { BarChart3, Download, FileText, Users, Clock, RotateCcw, TrendingUp } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui";
import { baht, num, fmtDateTime, ymd } from "@/lib/format";

interface Report {
  summary: { orderCount: number; voidCount: number; grossSales: number; discount: number; serviceCharge: number; tax: number; netSales: number; avgBill: number };
  daily: { day: string; total: number }[];
  byMenu: { name: string; qty: number; amount: number }[];
  byPayment: { method: string; amount: number }[];
  grossProfit: { revenue: number; cost: number; grossProfit: number; marginPct: number };
  byCashier: { name: string; orderCount: number; net: number }[];
  byHour: { hour: number; total: number }[];
  refunds: { count: number; amount: number };
  orders: { id: number; docNo: string; createdAt: string; type: string; table: string; cashier: string; net: number; status: string }[];
}

const METHOD_LABEL: Record<string, string> = { CASH: "เงินสด", QR: "QR", CARD: "บัตร" };
const TYPE_LABEL: Record<string, string> = { DINE_IN: "ทานที่ร้าน", TAKEAWAY: "กลับบ้าน", DELIVERY: "เดลิเวอรี" };

const isoDay = ymd; // business-tz YYYY-MM-DD (correct even if the browser isn't in Bangkok)

export default function ReportsPage() {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 29 * 86400000);
  const [from, setFrom] = useState(isoDay(monthAgo));
  const [to, setTo] = useState(isoDay(today));
  const [data, setData] = useState<Report | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/reports?from=${from}&to=${to}`);
    if (!res.ok) { setData(null); return; } // don't crash the page on an error response
    setData(await res.json());
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!data) return;
    // escape quotes and neutralize spreadsheet formula injection (=,+,-,@)
    const cell = (v: unknown) => {
      let s = String(v ?? "");
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = [
      ["เลขที่บิล", "วันที่", "ประเภท", "โต๊ะ", "แคชเชียร์", "ยอดสุทธิ", "สถานะ"],
      ...data.orders.map((o) => [o.docNo, fmtDateTime(o.createdAt), TYPE_LABEL[o.type] ?? o.type, o.table, o.cashier, String(o.net), o.status]),
    ];
    const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `sales-report-${from}-to-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="รายงานยอดขาย" subtitle="สรุปยอดขายตามช่วงเวลา" icon={BarChart3}
        actions={
          <>
            <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-gray-400">ถึง</span>
            <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
            <a href="/zreport" className="btn-ghost">ปิดยอด (Z)</a>
            <button onClick={exportCsv} className="btn-primary"><Download className="h-4 w-4" /> CSV</button>
          </>
        }
      />

      {!data ? (
        <div className="text-gray-400">กำลังโหลด...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="ยอดขายสุทธิ" value={baht(data.summary.netSales)} icon={BarChart3} tone="brand" />
            <StatCard label="จำนวนบิล" value={num(data.summary.orderCount)} icon={FileText} tone="blue" hint={`Void ${data.summary.voidCount} บิล`} />
            <StatCard label="บิลเฉลี่ย" value={baht(data.summary.avgBill)} tone="accent" />
            <StatCard label="ภาษี (VAT)" value={baht(data.summary.tax)} tone="rose" hint={`Service ${baht(data.summary.serviceCharge)}`} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatCard label="ยอดขาย (ก่อนภาษี)" value={baht(data.grossProfit.revenue)} icon={TrendingUp} tone="brand" />
            <StatCard label="ต้นทุนวัตถุดิบ" value={baht(data.grossProfit.cost)} icon={FileText} tone="rose" />
            <StatCard label="กำไรขั้นต้น" value={baht(data.grossProfit.grossProfit)} icon={TrendingUp} tone="accent" />
            <StatCard label="อัตรากำไรขั้นต้น" value={`${num(data.grossProfit.marginPct, 1)}%`} tone="blue" />
            <StatCard label="คืนเงิน (Refund)" value={baht(data.refunds.amount)} icon={RotateCcw} tone="rose" hint={`${num(data.refunds.count)} บิล`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="card p-5 lg:col-span-2">
              <h3 className="font-bold text-gray-700 mb-4">แนวโน้มยอดขายรายวัน</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => baht(v)} />
                  <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} name="ยอดขาย" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-5">
              <h3 className="font-bold text-gray-700 mb-4">ยอดขายตามวิธีชำระ</h3>
              <div className="space-y-3">
                {data.byPayment.map((p) => {
                  const payTotal = data.byPayment.reduce((s, x) => s + x.amount, 0);
                  const pct = payTotal > 0 ? (p.amount / payTotal) * 100 : 0;
                  return (
                    <div key={p.method}>
                      <div className="flex justify-between text-sm mb-1"><span className="text-gray-600">{METHOD_LABEL[p.method] ?? p.method}</span><span className="font-semibold">{baht(p.amount)}</span></div>
                      <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
                {data.byPayment.length === 0 && <p className="text-gray-400 text-sm">ไม่มีข้อมูล</p>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card overflow-hidden">
              <div className="px-4 py-3 font-bold text-gray-700 border-b border-gray-100">เมนูขายดี</div>
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-400 border-b border-gray-100"><tr><th className="text-left px-4 py-2">เมนู</th><th className="text-right py-2">จำนวน</th><th className="text-right px-4 py-2">ยอดขาย</th></tr></thead>
                <tbody>
                  {data.byMenu.slice(0, 10).map((m) => (
                    <tr key={m.name} className="border-b border-gray-50"><td className="px-4 py-2 text-gray-700">{m.name}</td><td className="py-2 text-right">{num(m.qty)}</td><td className="px-4 py-2 text-right font-semibold">{baht(m.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card overflow-hidden">
              <div className="px-4 py-3 font-bold text-gray-700 border-b border-gray-100">บิลล่าสุด</div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-400 border-b border-gray-100 sticky top-0 bg-white"><tr><th className="text-left px-4 py-2">เลขที่</th><th className="text-left py-2">เวลา</th><th className="text-right px-4 py-2">สุทธิ</th></tr></thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o.docNo} className="border-b border-gray-50">
                        <td className="px-4 py-2">
                          {o.status === "VOID"
                            ? <span className="text-gray-400">{o.docNo} <span className="text-rose-500">(ยกเลิก)</span></span>
                            : <a href={`/receipt/${o.id}`} target="_blank" className="text-brand-600 hover:underline">{o.docNo}</a>}
                        </td>
                        <td className="py-2 text-gray-400">{fmtDateTime(o.createdAt)}</td>
                        <td className="px-4 py-2 text-right font-semibold">{baht(o.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
            <div className="card p-5 lg:col-span-2">
              <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2"><Clock className="h-4 w-4 text-gray-400" /> ยอดขายตามช่วงเวลา</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.byHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={(h: number) => `${h}:00`} interval={1} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => baht(v)} labelFormatter={(h) => `${h}:00 น.`} />
                  <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} name="ยอดขาย" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card overflow-hidden">
              <div className="px-4 py-3 font-bold text-gray-700 border-b border-gray-100 flex items-center gap-2"><Users className="h-4 w-4 text-gray-400" /> ยอดขายตามพนักงาน</div>
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-400 border-b border-gray-100"><tr><th className="text-left px-4 py-2">พนักงาน</th><th className="text-right py-2">บิล</th><th className="text-right px-4 py-2">ยอดสุทธิ</th></tr></thead>
                <tbody>
                  {data.byCashier.map((c) => (
                    <tr key={c.name} className="border-b border-gray-50"><td className="px-4 py-2 text-gray-700">{c.name}</td><td className="py-2 text-right">{num(c.orderCount)}</td><td className="px-4 py-2 text-right font-semibold">{baht(c.net)}</td></tr>
                  ))}
                  {data.byCashier.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">ไม่มีข้อมูล</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

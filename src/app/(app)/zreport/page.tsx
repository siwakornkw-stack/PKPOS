"use client";

import { useEffect, useState, useCallback } from "react";
import { FileBarChart, Printer } from "lucide-react";
import { PageHeader, StatCard } from "@/components/ui";
import { baht, num, ymd } from "@/lib/format";

interface ZData {
  date: string;
  summary: { orderCount: number; grossSales: number; discount: number; serviceCharge: number; tax: number; netSales: number; cost: number; grossProfit: number; voidCount: number; refundCount: number; refundAmount: number };
  byPayment: { method: string; amount: number }[];
  byCategory: { name: string; amount: number }[];
  byHour: { hour: number; total: number }[];
  byCashier: { name: string; orderCount: number; net: number }[];
}

const METHOD: Record<string, string> = { CASH: "เงินสด", QR: "QR", CARD: "บัตร" };

const isoDay = ymd; // business-tz YYYY-MM-DD (correct even if the browser isn't in Bangkok)

export default function ZReportPage() {
  const [date, setDate] = useState(isoDay(new Date()));
  const [data, setData] = useState<ZData | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/zreport?date=${date}`);
    setData(res.ok ? await res.json() : null);
  }, [date]);
  useEffect(() => { load(); }, [load]);

  async function printThermal() {
    if (!data) return;
    const res = await fetch("/api/zreport/print", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report: { date: data.date, summary: data.summary, byPayment: data.byPayment, byCategory: data.byCategory } }),
    });
    const d = await res.json().catch(() => null);
    alert(res.ok ? `ส่งไปเครื่องพิมพ์แล้ว (${d.bytes} bytes)` : d?.error?.message ?? "พิมพ์ไม่สำเร็จ");
  }

  return (
    <div className="p-6">
      <PageHeader
        title="ปิดยอดรายวัน (Z Report)" subtitle="สรุปยอดขายประจำวัน" icon={FileBarChart}
        actions={
          <>
            <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
            <button onClick={printThermal} className="btn-ghost no-print"><Printer className="h-4 w-4" /> ใบความร้อน</button>
            <button onClick={() => window.print()} className="btn-primary no-print"><Printer className="h-4 w-4" /> พิมพ์</button>
          </>
        }
      />

      {!data ? <p className="text-gray-400">กำลังโหลด...</p> : (
        <div className="space-y-6 receipt">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="ยอดขายสุทธิ" value={baht(data.summary.netSales)} tone="brand" />
            <StatCard label="จำนวนบิล" value={num(data.summary.orderCount)} tone="blue" hint={`Void ${data.summary.voidCount}`} />
            <StatCard label="กำไรขั้นต้น" value={baht(data.summary.grossProfit)} tone="accent" hint={`ทุน ${baht(data.summary.cost)}`} />
            <StatCard label="คืนเงิน" value={baht(data.summary.refundAmount)} tone="rose" hint={`${num(data.summary.refundCount)} บิล`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ZTable title="ตามวิธีชำระ" rows={data.byPayment.map((p) => [METHOD[p.method] ?? p.method, baht(p.amount)])} />
            <ZTable title="ตามหมวดเมนู" rows={data.byCategory.map((c) => [c.name, baht(c.amount)])} />
            <ZTable title="ตามพนักงาน" rows={data.byCashier.map((c) => [`${c.name} (${c.orderCount})`, baht(c.net)])} />
          </div>

          <div className="card p-5">
            <h3 className="font-bold text-gray-700 mb-3">สรุปยอด</h3>
            <div className="max-w-md space-y-1 text-sm">
              <Line l="ยอดขาย (ก่อนภาษี)" r={baht(data.summary.grossSales)} />
              <Line l="ส่วนลด" r={`-${baht(data.summary.discount)}`} />
              <Line l="Service charge" r={baht(data.summary.serviceCharge)} />
              <Line l="ภาษีมูลค่าเพิ่ม (VAT)" r={baht(data.summary.tax)} />
              <div className="border-t border-gray-200 pt-1 font-bold flex justify-between"><span>ยอดสุทธิ</span><span className="text-brand-600">{baht(data.summary.netSales)}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ZTable({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 font-bold text-gray-700 border-b border-gray-100">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-50"><td className="px-4 py-1.5 text-gray-600">{r[0]}</td><td className="px-4 py-1.5 text-right font-medium">{r[1]}</td></tr>
          ))}
          {rows.length === 0 && <tr><td className="px-4 py-3 text-gray-400 text-center" colSpan={2}>ไม่มีข้อมูล</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Line({ l, r }: { l: string; r: string }) {
  return <div className="flex justify-between text-gray-600"><span>{l}</span><span>{r}</span></div>;
}

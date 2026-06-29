"use client";

import { useEffect, useState, useCallback } from "react";
import { Timer, LogIn, LogOut, Loader2 } from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

interface Row {
  id: number;
  userId: number;
  clockIn: string;
  clockOut: string | null;
  user: { fullName: string };
}

function hours(inAt: string, outAt: string | null): string {
  const end = outAt ? new Date(outAt).getTime() : Date.now();
  const h = (end - new Date(inAt).getTime()) / 3.6e6;
  return `${h.toFixed(2)} ชม.`;
}

export default function AttendancePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const d = await (await fetch("/api/attendance")).json();
    setRows(d.rows ?? []);
    setOpen(d.open ?? null);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function clock(action: "IN" | "OUT") {
    setBusy(true); setMsg("");
    const res = await fetch("/api/attendance", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) load();
    else setMsg((await res.json()).error?.message ?? "ลงเวลาไม่สำเร็จ");
    setBusy(false);
  }

  if (loading) return <div className="p-6 text-gray-400">กำลังโหลด...</div>;

  const totalToday = rows
    .filter((r) => new Date(r.clockIn).toDateString() === new Date().toDateString())
    .length;

  return (
    <div className="p-6 max-w-4xl">
      <PageHeader title="ลงเวลางาน (Attendance)" subtitle="ลงเวลาเข้า-ออกงานของพนักงาน" icon={Timer} />

      <div className="card p-6 mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">สถานะของคุณ</p>
          {open ? (
            <p className="font-semibold text-emerald-700">เข้างานตั้งแต่ {fmtDateTime(open.clockIn)} ({hours(open.clockIn, null)})</p>
          ) : (
            <p className="font-semibold text-gray-700">ยังไม่ได้ลงเวลาเข้างาน</p>
          )}
        </div>
        {open ? (
          <button onClick={() => clock("OUT")} disabled={busy} className="btn-danger">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} ลงเวลาออก
          </button>
        ) : (
          <button onClick={() => clock("IN")} disabled={busy} className="btn-primary">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} ลงเวลาเข้า
          </button>
        )}
      </div>
      {msg && <p className="text-sm text-rose-600 mb-4">{msg}</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <StatCard label="ลงเวลาวันนี้" value={totalToday} icon={Timer} tone="brand" />
        <StatCard label="รายการ 7 วัน" value={rows.length} tone="blue" />
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState message="ยังไม่มีการลงเวลา" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">พนักงาน</th>
                <th className="px-4 py-2 font-medium">เข้า</th>
                <th className="px-4 py-2 font-medium">ออก</th>
                <th className="px-4 py-2 font-medium text-right">รวม</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-800">{r.user.fullName}</td>
                  <td className="px-4 py-2 text-gray-600">{fmtDateTime(r.clockIn)}</td>
                  <td className="px-4 py-2 text-gray-600">{r.clockOut ? fmtDateTime(r.clockOut) : <span className="text-emerald-600">กำลังทำงาน</span>}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{hours(r.clockIn, r.clockOut)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

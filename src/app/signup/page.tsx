"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Store, UserPlus, Loader2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ businessName: "", branchName: "สาขาหลัก", ownerName: "", username: "", pin: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setErr("");
    const res = await fetch("/api/signup", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (res.ok) { router.push("/dashboard"); router.refresh(); }
    else { setErr((await res.json()).error?.message ?? "สมัครไม่สำเร็จ"); setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-700 via-brand-600 to-emerald-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 text-white">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur mb-3"><Store className="h-9 w-9" /></div>
          <h1 className="text-2xl font-bold">สมัครใช้งาน PkPos</h1>
          <p className="text-brand-100 text-sm">ทดลองใช้ฟรี 14 วัน ไม่ต้องใส่บัตร</p>
        </div>

        <form onSubmit={submit} className="card p-6 space-y-3">
          <div><label className="label">ชื่อร้าน / ธุรกิจ</label><input className="input" value={form.businessName} onChange={set("businessName")} autoFocus required /></div>
          <div><label className="label">ชื่อสาขาแรก</label><input className="input" value={form.branchName} onChange={set("branchName")} required /></div>
          <div><label className="label">ชื่อเจ้าของ</label><input className="input" value={form.ownerName} onChange={set("ownerName")} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">ชื่อผู้ใช้ (login)</label><input className="input" value={form.username} onChange={set("username")} required /></div>
            <div><label className="label">PIN</label><input className="input" type="password" value={form.pin} onChange={set("pin")} required /></div>
          </div>
          {err && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{err}</div>}
          <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} เริ่มทดลองใช้ฟรี
          </button>
          <p className="text-center text-sm text-gray-500">มีบัญชีแล้ว? <Link href="/login" className="text-brand-600 font-semibold">เข้าสู่ระบบ</Link></p>
        </form>
      </div>
    </div>
  );
}

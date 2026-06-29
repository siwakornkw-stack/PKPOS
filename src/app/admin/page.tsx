"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Building2, Wallet, Loader2, LogOut, Users, Check, HelpCircle, QrCode } from "lucide-react";
import { baht, num, fmtDateTime } from "@/lib/format";
import { Modal, Badge } from "@/components/ui";

interface T { id: number; name: string; slug: string; plan: string; status: string; trialEndsAt: string | null; currentPeriodEnd: string | null; branches: number; users: number; orders: number; }
interface Metrics { total: number; active: number; trial: number; suspended: number; mrr: number; }
interface TUser { id: number; username: string; fullName: string; isActive: boolean; locked: boolean; role: string; roleCode: string; branch: string | null; createdAt: string; }
interface Detail { id: number; name: string; slug: string; plan: string; status: string; trialEndsAt: string | null; currentPeriodEnd: string | null; createdAt: string; cardBrand: string | null; cardLast4: string | null; branches: { id: number; code: string; name: string }[]; users: TUser[]; }
interface Pay { id: number; plan: string; amount: number; method: string; ref: string | null; slipUrl?: string | null; status: string; note: string | null; createdAt: string; reviewedAt?: string | null; tenant: { name: string; slug: string; status?: string } }

const STATUS: Record<string, string> = { TRIAL: "bg-blue-100 text-blue-700", ACTIVE: "bg-emerald-100 text-emerald-700", SUSPENDED: "bg-rose-100 text-rose-700", CANCELLED: "bg-gray-100 text-gray-500" };

export default function AdminPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<T[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [busy, setBusy] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailBusy, setDetailBusy] = useState(0);
  const [pending, setPending] = useState<Pay[]>([]);
  const [slip, setSlip] = useState<Pay | null>(null);
  const [payBusy, setPayBusy] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showPlatform, setShowPlatform] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [delOpen, setDelOpen] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delConfirm, setDelConfirm] = useState("");
  const [delErr, setDelErr] = useState("");

  function toggle(id: number) {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectEmptyJunk() {
    // non-ACTIVE tenants with zero sales orders = safe-to-delete test/abandoned signups
    setSel(new Set(tenants.filter((t) => t.status !== "ACTIVE" && t.orders === 0).map((t) => t.id)));
  }
  const selectedTenants = tenants.filter((t) => sel.has(t.id));

  async function runBulkDelete() {
    setDelBusy(true); setDelErr("");
    const res = await fetch("/api/admin/tenants/bulk-delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...sel], confirm: delConfirm }),
    });
    setDelBusy(false);
    if (!res.ok) { setDelErr((await res.json()).error?.message ?? "ลบไม่สำเร็จ"); return; }
    const r = await res.json();
    const msg = `ลบแล้ว ${r.deleted.length} ร้าน` + (r.skipped.length ? `, ข้าม ${r.skipped.length} (${r.skipped.map((s: { name: string; reason: string }) => `${s.name}: ${s.reason}`).join("; ")})` : "");
    setDelOpen(false); setDelConfirm(""); setSel(new Set());
    await load();
    alert(msg);
  }

  async function openDetail(id: number) {
    setDetailBusy(id);
    const res = await fetch(`/api/admin/tenants/${id}`);
    if (res.ok) setDetail((await res.json()).tenant);
    setDetailBusy(0);
  }

  const loadPayments = useCallback(async () => {
    const res = await fetch("/api/admin/payments");
    if (res.ok) setPending((await res.json()).pending ?? []);
  }, []);

  async function reviewPay(id: number, action: "approve" | "reject") {
    if (action === "reject" && !confirm("ปฏิเสธรายการนี้?")) return;
    setPayBusy(id);
    const res = await fetch(`/api/admin/payments/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    setPayBusy(0);
    if (res.ok) { setSlip(null); await loadPayments(); await load(); }
    else alert((await res.json()).error?.message ?? "ไม่สำเร็จ");
  }

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/tenants");
    if (res.status === 401) return router.push("/login");
    if (res.status === 403) return router.push("/dashboard");
    const d = await res.json();
    setTenants(d.tenants ?? []); setMetrics(d.metrics ?? null);
  }, [router]);
  useEffect(() => { load(); loadPayments(); }, [load, loadPayments]);

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(id);
    await fetch(`/api/admin/tenants/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await load(); setBusy(0);
  }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900 text-white"><ShieldCheck className="h-6 w-6" /></div>
            <div><h1 className="text-xl font-bold text-gray-800">Platform Admin</h1><p className="text-sm text-gray-500">จัดการร้านค้า (tenants) ทั้งหมด</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPlatform(true)} className="btn-ghost"><QrCode className="h-4 w-4" /> ตั้งค่ารับเงิน</button>
            <button onClick={() => setShowHelp((v) => !v)} className="btn-ghost"><HelpCircle className="h-4 w-4" /> วิธีใช้</button>
            <button onClick={logout} className="btn-ghost"><LogOut className="h-4 w-4" /> ออก</button>
          </div>
        </div>

        {showHelp && <AdminHelp onClose={() => setShowHelp(false)} />}

        {metrics && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <Card label="ร้านทั้งหมด" value={num(metrics.total)} icon={Building2} />
            <Card label="ใช้งานอยู่" value={num(metrics.active)} />
            <Card label="ทดลองใช้" value={num(metrics.trial)} />
            <Card label="ระงับ/ยกเลิก" value={num(metrics.suspended)} />
            <Card label="MRR (รายเดือน)" value={baht(metrics.mrr)} icon={Wallet} />
          </div>
        )}

        {pending.length > 0 && (
          <div className="card overflow-hidden mb-6 border-amber-300">
            <div className="px-4 py-3 font-bold text-amber-800 bg-amber-50 border-b border-amber-200">
              การชำระเงินโอน/PromptPay รออนุมัติ ({pending.length})
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 text-left">
                <tr><th className="px-4 py-2">ร้าน</th><th className="py-2">แผน</th><th className="py-2">ยอด</th><th className="py-2">อ้างอิง</th><th className="py-2">ส่งเมื่อ</th><th className="py-2 text-right pr-4">จัดการ</th></tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-4 py-2"><p className="font-medium text-gray-800">{p.tenant.name}</p><p className="text-[11px] text-gray-400">{p.tenant.slug}</p></td>
                    <td className="py-2 text-gray-700">{p.plan}</td>
                    <td className="py-2 font-semibold text-gray-800">{baht(p.amount)}</td>
                    <td className="py-2 text-gray-500 text-xs">{p.ref || "-"}</td>
                    <td className="py-2 text-gray-400 text-xs">{fmtDateTime(p.createdAt)}</td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      {payBusy === p.id ? <Loader2 className="h-4 w-4 animate-spin inline" /> : (
                        <>
                          {p.slipUrl && <button onClick={() => setSlip(p)} className="text-brand-600 text-xs mr-3">ดูสลิป</button>}
                          <button onClick={() => reviewPay(p.id, "approve")} className="text-emerald-600 text-xs font-medium mr-3">อนุมัติ</button>
                          <button onClick={() => reviewPay(p.id, "reject")} className="text-rose-600 text-xs">ปฏิเสธ</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
            <span className="font-bold text-gray-700">ร้านค้า</span>
            <div className="flex items-center gap-2">
              <button onClick={selectEmptyJunk} className="btn-ghost text-xs">เลือกร้านว่าง (0 ออเดอร์)</button>
              <button onClick={() => { setDelErr(""); setDelConfirm(""); setDelOpen(true); }} disabled={sel.size === 0}
                className="text-xs rounded-lg px-3 py-1.5 font-medium bg-rose-600 text-white disabled:opacity-40 disabled:cursor-not-allowed">
                ลบที่เลือก ({sel.size})
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500"><tr>
                <th className="w-8 px-4 py-2"></th>
                <th className="text-left py-2">ร้าน</th><th className="text-left py-2">แผน</th><th className="text-left py-2">สถานะ</th>
                <th className="text-center py-2">สาขา</th><th className="text-center py-2">ผู้ใช้</th><th className="text-center py-2">ออเดอร์</th><th className="text-left py-2">หมดอายุ</th><th className="py-2">จัดการ</th>
              </tr></thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className={`border-b border-gray-50 ${sel.has(t.id) ? "bg-rose-50/40" : ""}`}>
                    <td className="px-4 py-2"><input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} className="h-4 w-4 accent-rose-600" /></td>
                    <td className="py-2"><p className="font-medium text-gray-700">{t.name}</p><p className="text-[11px] text-gray-400">{t.slug}</p></td>
                    <td className="py-2">
                      <select value={t.plan} onChange={(e) => patch(t.id, { plan: e.target.value })} className="rounded border border-gray-200 px-2 py-1 text-xs">
                        {["TRIAL", "BASIC", "PRO"].map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className="py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[t.status]}`}>{t.status}</span></td>
                    <td className="py-2 text-center">{t.branches}</td>
                    <td className="py-2 text-center">
                      <button onClick={() => openDetail(t.id)} className="text-brand-600 underline decoration-dotted underline-offset-2 inline-flex items-center gap-1">
                        {detailBusy === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Users className="h-3.5 w-3.5" />{t.users}</>}
                      </button>
                    </td>
                    <td className="py-2 text-center text-gray-600">{t.orders}</td>
                    <td className="py-2 text-gray-400 text-xs">{t.status === "TRIAL" ? (t.trialEndsAt && fmtDateTime(t.trialEndsAt)) : (t.currentPeriodEnd && fmtDateTime(t.currentPeriodEnd))}</td>
                    <td className="py-2 pr-4 whitespace-nowrap text-right">
                      {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin inline" /> : (
                        <>
                          {t.status !== "ACTIVE" && <button onClick={() => patch(t.id, { status: "ACTIVE" })} className="text-emerald-600 text-xs mr-2">เปิด</button>}
                          {t.status !== "SUSPENDED" && <button onClick={() => patch(t.id, { status: "SUSPENDED" })} className="text-rose-600 text-xs mr-2">ระงับ</button>}
                          <button onClick={() => patch(t.id, { extendDays: 30 })} className="text-brand-600 text-xs">+30 วัน</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {tenants.length === 0 && <tr><td colSpan={9} className="text-center text-gray-400 py-8">ยังไม่มีร้านค้า</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <DetailModal detail={detail} onClose={() => setDetail(null)} />
        <SlipModal pay={slip} busy={payBusy} onClose={() => setSlip(null)} onReview={reviewPay} />
        <PlatformModal open={showPlatform} onClose={() => setShowPlatform(false)} />
        <DeleteModal open={delOpen} tenants={selectedTenants} confirm={delConfirm} setConfirm={setDelConfirm}
          busy={delBusy} err={delErr} onClose={() => setDelOpen(false)} onConfirm={runBulkDelete} />
      </div>
    </div>
  );
}

function SlipModal({ pay, busy, onClose, onReview }: { pay: Pay | null; busy: number; onClose: () => void; onReview: (id: number, a: "approve" | "reject") => void }) {
  if (!pay) return null;
  return (
    <Modal open={!!pay} onClose={onClose} title={`สลิปโอน: ${pay.tenant.name}`} width="max-w-md">
      <div className="space-y-3">
        <div className="flex justify-between text-sm text-gray-600">
          <span>แผน <b className="text-gray-800">{pay.plan}</b></span>
          <span>ยอด <b className="text-gray-800">{baht(pay.amount)}</b></span>
        </div>
        {pay.ref && <p className="text-sm text-gray-500">อ้างอิง: {pay.ref}</p>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {pay.slipUrl ? <img src={pay.slipUrl} alt="สลิปโอนเงิน" className="w-full rounded-lg border border-gray-200" /> : <p className="text-gray-400 text-sm">ไม่มีรูปสลิป</p>}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button onClick={() => onReview(pay.id, "reject")} disabled={busy === pay.id} className="btn-danger">ปฏิเสธ</button>
          <button onClick={() => onReview(pay.id, "approve")} disabled={busy === pay.id} className="btn-primary">
            {busy === pay.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} อนุมัติ +30 วัน
          </button>
        </div>
      </div>
    </Modal>
  );
}

const ROLE_BADGE: Record<string, string> = {
  OWNER: "bg-violet-100 text-violet-700", MANAGER: "bg-blue-100 text-blue-700",
  CASHIER: "bg-emerald-100 text-emerald-700", WAITER: "bg-amber-100 text-amber-700",
  KITCHEN: "bg-orange-100 text-orange-700", STOCK: "bg-cyan-100 text-cyan-700", AUDITOR: "bg-gray-100 text-gray-600",
};

function DetailModal({ detail, onClose }: { detail: Detail | null; onClose: () => void }) {
  if (!detail) return null;
  return (
    <Modal open={!!detail} onClose={onClose} title={`ผู้ใช้: ${detail.name}`} width="max-w-3xl">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          <span>แผน <b className="text-gray-700">{detail.plan}</b></span>
          <span>· สถานะ <b className="text-gray-700">{detail.status}</b></span>
          <span>· สาขา <b className="text-gray-700">{detail.branches.length}</b> ({detail.branches.map((b) => b.name).join(", ") || "-"})</span>
          {detail.cardLast4 && <span>· บัตร {detail.cardBrand} ****{detail.cardLast4}</span>}
          <span>· สมัคร {fmtDateTime(detail.createdAt)}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2">ชื่อ</th>
                <th className="py-2">username</th>
                <th className="py-2">บทบาท</th>
                <th className="py-2">สาขา</th>
                <th className="py-2">สถานะ</th>
                <th className="py-2">สร้างเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {detail.users.map((u) => (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-800">{u.fullName}</td>
                  <td className="py-2 text-gray-600 font-mono">{u.username}</td>
                  <td className="py-2"><Badge className={ROLE_BADGE[u.roleCode] ?? "bg-gray-100 text-gray-600"}>{u.role}</Badge></td>
                  <td className="py-2 text-gray-600">{u.branch ?? "-"}</td>
                  <td className="py-2">
                    {!u.isActive ? <Badge className="bg-gray-100 text-gray-500">ปิดใช้งาน</Badge>
                      : u.locked ? <Badge className="bg-rose-100 text-rose-700">ถูกล็อก</Badge>
                      : <Badge className="bg-emerald-100 text-emerald-700">ใช้งาน</Badge>}
                  </td>
                  <td className="py-2 text-gray-400 text-xs">{fmtDateTime(u.createdAt)}</td>
                </tr>
              ))}
              {detail.users.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6">ไม่มีผู้ใช้</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function PlatformModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [promptPayId, setPromptPayId] = useState("");
  const [bankInfo, setBankInfo] = useState("");
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [newImage, setNewImage] = useState<string | null>(null); // picked file (replaces)
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/platform");
    if (!res.ok) return;
    const { setting } = await res.json();
    setPromptPayId(setting.promptPayId ?? "");
    setBankInfo(setting.bankInfo ?? "");
    setCurrentImage(setting.promptPayImage ?? null);
    setNewImage(null); setRemoveImage(false); setErr(""); setDone("");
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  function pickFile(file: File | undefined) {
    setErr("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("ต้องเป็นรูปภาพ"); return; }
    if (file.size > 2 * 1024 * 1024) { setErr("ไฟล์ใหญ่เกิน 2MB"); return; }
    const r = new FileReader();
    r.onload = () => { setNewImage(r.result as string); setRemoveImage(false); };
    r.readAsDataURL(file);
  }

  async function save() {
    setBusy(true); setErr(""); setDone("");
    const body: Record<string, unknown> = { promptPayId: promptPayId.trim() || null, bankInfo: bankInfo.trim() || null };
    if (newImage) body.promptPayImage = newImage;
    else if (removeImage) body.promptPayImage = null;
    const res = await fetch("/api/admin/platform", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) { setDone("บันทึกแล้ว"); load(); }
    else setErr((await res.json()).error?.message ?? "บันทึกไม่สำเร็จ");
  }

  const shownImage = removeImage ? null : (newImage ?? currentImage);

  return (
    <Modal open={open} onClose={onClose} title="ตั้งค่ารับเงินค่าบริการ (PromptPay)" width="max-w-lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">รูป QR ที่อัปโหลด จะแสดงให้ร้านสแกนจ่ายค่าบริการที่หน้า /billing (ทับ QR อัตโนมัติ). ถ้าไม่อัปโหลดรูป ระบบจะสร้าง QR จาก PromptPay ID ให้</p>

        <div>
          <label className="label">รูป PromptPay QR</label>
          {shownImage ? (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shownImage} alt="PromptPay QR" className="w-40 rounded-lg border border-gray-200" />
              <button onClick={() => { setNewImage(null); setRemoveImage(true); }} className="text-rose-600 text-sm">ลบรูป</button>
            </div>
          ) : <p className="text-sm text-gray-400">ยังไม่มีรูป (ใช้ QR สร้างจาก ID)</p>}
          <input type="file" accept="image/*" onChange={(e) => pickFile(e.target.files?.[0])} className="mt-2 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-100 file:px-3 file:py-2 file:text-brand-700" />
        </div>

        <div><label className="label">PromptPay ID (เบอร์/เลขผู้เสียภาษี - ใช้สร้าง QR เมื่อไม่มีรูป)</label>
          <input className="input" value={promptPayId} onChange={(e) => setPromptPayId(e.target.value)} placeholder="0812345678" /></div>
        <div><label className="label">ข้อมูลบัญชี (แสดงใต้ QR)</label>
          <textarea className="input" rows={2} value={bankInfo} onChange={(e) => setBankInfo(e.target.value)} placeholder="ธ.กสิกรไทย 123-4-56789-0 บจก. ..." /></div>

        {err && <p className="text-sm text-rose-600">{err}</p>}
        {done && <p className="text-sm text-emerald-600">{done}</p>}
        <button onClick={save} disabled={busy} className="btn-primary w-full py-3">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} บันทึก
        </button>
      </div>
    </Modal>
  );
}

function AdminHelp({ onClose }: { onClose: () => void }) {
  const items: [string, string][] = [
    ["ภาพรวม", "คุณคือเจ้าของแพลตฟอร์ม — ดูและจัดการทุกร้าน (tenant) ที่สมัครใช้ระบบ"],
    ["ตัวเลข (บนสุด)", "MRR = รายได้ค่าบริการต่อเดือน · จำนวนร้านทั้งหมด/ใช้งาน/ทดลอง/ระงับ"],
    ["อนุมัติการโอน", "ถ้ามีร้านโอน/PromptPay จ่ายค่าบริการ จะขึ้นแถบเหลือง 'รออนุมัติ' → กด 'ดูสลิป' ตรวจ → 'อนุมัติ' (เปิดใช้งานร้าน +30 วัน + ออกใบเสร็จ) หรือ 'ปฏิเสธ'"],
    ["ดูผู้ใช้ของร้าน", "คลิกตัวเลขในคอลัมน์ 'ผู้ใช้' → เห็นพนักงานทั้งหมด (ชื่อ/username/บทบาท/สาขา/สถานะ)"],
    ["จัดการร้าน", "เปลี่ยนแผน (dropdown TRIAL/BASIC/PRO) · 'เปิด' = เปิดใช้งาน · 'ระงับ' = ปิดใช้งาน · '+30 วัน' = ต่ออายุ"],
    ["รับโอนเอง", "ถ้าลูกค้าโอนมาตรงโดยไม่ผ่านระบบ → กด 'เปิด' + '+30 วัน' ให้ร้านนั้นเอง"],
    ["ตั้งค่ารับเงิน (PromptPay)", "กดปุ่ม 'ตั้งค่ารับเงิน' บนสุด → อัปโหลดรูป QR PromptPay ของคุณ / ใส่ PromptPay ID / ข้อมูลบัญชี — เปลี่ยนได้ทันทีไม่ต้อง redeploy. รูปที่อัปโหลดจะโชว์ให้ร้านสแกนที่ /billing"],
    ["บัตรเครดิต (อัตโนมัติ)", "ถ้าอยากให้ตัดบัตรต่ออายุอัตโนมัติ: ตั้ง env PLATFORM_OMISE_* บน host แล้ว redeploy (ไม่งั้นใช้โอน+สลิปได้)"],
    ["ความปลอดภัย", "เปลี่ยน PIN superadmin หลัง login ครั้งแรก (ที่ ตั้งค่า > ผู้ใช้ ของบัญชีนี้)"],
  ];
  return (
    <div className="card p-5 mb-6 border-brand-200 bg-brand-50/40">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 font-bold text-gray-800"><HelpCircle className="h-5 w-5 text-brand-600" /> วิธีใช้ (เจ้าของระบบ)</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm">ปิด</button>
      </div>
      <ol className="space-y-2">
        {items.map(([h, d], i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white text-xs font-bold">{i + 1}</span>
            <p className="text-sm text-gray-600 pt-0.5"><b className="text-gray-800">{h}</b> — {d}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DeleteModal({ open, tenants, confirm, setConfirm, busy, err, onClose, onConfirm }: {
  open: boolean; tenants: T[]; confirm: string; setConfirm: (v: string) => void;
  busy: boolean; err: string; onClose: () => void; onConfirm: () => void;
}) {
  if (!open) return null;
  const active = tenants.filter((t) => t.status === "ACTIVE");
  const withOrders = tenants.filter((t) => t.status !== "ACTIVE" && t.orders > 0);
  return (
    <Modal open={open} onClose={onClose} title={`ลบร้านถาวร (${tenants.length})`} width="max-w-lg">
      <div className="space-y-3">
        <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3">
          ลบถาวร <b>กู้คืนไม่ได้</b> — ลบร้านพร้อมข้อมูลทั้งหมด (สาขา, เมนู, ออเดอร์, พนักงาน, สมาชิก, ใบเสร็จ). ร้านสถานะ ACTIVE จะถูกข้าม
        </div>
        <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
          {tenants.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
              <div><span className="font-medium text-gray-800">{t.name}</span> <span className="text-[11px] text-gray-400">{t.slug}</span></div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className={`rounded-full px-2 py-0.5 ${STATUS[t.status]}`}>{t.status}</span>
                <span className="text-gray-500">{t.orders} ออเดอร์</span>
              </div>
            </div>
          ))}
        </div>
        {active.length > 0 && <p className="text-xs text-amber-600">{active.length} ร้าน ACTIVE จะถูกข้าม (ระงับก่อนถึงจะลบได้)</p>}
        {withOrders.length > 0 && <p className="text-xs text-amber-600">ระวัง: {withOrders.length} ร้านมีออเดอร์จริง (อาจไม่ใช่ร้านทดสอบ)</p>}
        <div>
          <label className="label">พิมพ์ <b>DELETE</b> เพื่อยืนยัน</label>
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" autoFocus />
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onClose} className="btn-ghost">ยกเลิก</button>
          <button onClick={onConfirm} disabled={busy || confirm !== "DELETE"} className="btn-danger">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} ลบถาวร
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Card({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs text-gray-500">{Icon && <Icon className="h-4 w-4" />} {label}</div>
      <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
    </div>
  );
}

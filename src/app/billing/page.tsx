"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Check, Loader2, Store, ArrowRight, LogOut, ShieldCheck, X, QrCode, Upload } from "lucide-react";
import { baht, fmtDateTime } from "@/lib/format";

interface Tenant { name: string; plan: string; status: string; trialEndsAt: string | null; currentPeriodEnd: string | null; }
interface Plan { name: string; price: number; maxBranches: number; maxUsers: number; }
interface Inv { id: number; plan: string; amount: number; status: string; periodEnd: string; createdAt: string; }
interface SavedCard { brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null; }
interface Payment { live: boolean; publicKey: string | null; savedCard: SavedCard | null; }
interface Transfer { enabled: boolean; promptPayId: string | null; bankInfo: string | null; qr: Record<string, string>; image: string | null; }
interface Pending { id: number; plan: string; amount: number; createdAt: string; }

// Omise.js (loaded only in live mode) - tokenizes the card in the browser so the
// raw PAN never reaches our server.
declare global {
  interface Window {
    Omise?: {
      setPublicKey: (k: string) => void;
      createToken: (type: "card", data: Record<string, string>, cb: (status: number, res: { id?: string; message?: string }) => void) => void;
    };
  }
}

const STATUS: Record<string, { label: string; color: string }> = {
  TRIAL: { label: "ทดลองใช้", color: "bg-blue-100 text-blue-700" },
  ACTIVE: { label: "ใช้งานอยู่", color: "bg-emerald-100 text-emerald-700" },
  SUSPENDED: { label: "ถูกระงับ", color: "bg-rose-100 text-rose-700" },
  CANCELLED: { label: "ยกเลิก", color: "bg-gray-100 text-gray-600" },
};

export default function BillingPage() {
  const router = useRouter();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [payment, setPayment] = useState<Payment>({ live: false, publicKey: null, savedCard: null });
  const [transfer, setTransfer] = useState<Transfer>({ enabled: false, promptPayId: null, bankInfo: null, qr: {}, image: null });
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState("");
  const [cardModal, setCardModal] = useState<{ mode: "subscribe"; plan: string } | { mode: "change" } | null>(null);
  const [omiseReady, setOmiseReady] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/billing");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { router.push("/dashboard"); return; }
    const d = await res.json();
    setTenant(d.tenant); setPlans(d.plans ?? {}); setInvoices(d.invoices ?? []);
    setPayment(d.payment ?? { live: false, publicKey: null, savedCard: null });
    setTransfer(d.transfer ?? { enabled: false, promptPayId: null, bankInfo: null, qr: {}, image: null });
    setPending(d.pendingPayment ?? null);
  }, [router]);
  useEffect(() => { load(); }, [load]);

  // load Omise.js once when running in live mode
  useEffect(() => {
    if (!payment.live || !payment.publicKey) return;
    if (window.Omise) { window.Omise.setPublicKey(payment.publicKey); setOmiseReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.omise.co/omise.js";
    s.onload = () => { window.Omise?.setPublicKey(payment.publicKey!); setOmiseReady(true); };
    document.body.appendChild(s);
  }, [payment.live, payment.publicKey]);

  // POST a subscribe/renew. token = new card (live); omit to charge saved card / mock.
  async function subscribe(plan: string, token?: string) {
    setBusy(plan);
    const res = await fetch("/api/billing", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, ...(token ? { omiseToken: token } : {}) }),
    });
    if (res.ok) { setCardModal(null); router.push("/dashboard"); router.refresh(); }
    else { alert((await res.json()).error?.message ?? "ไม่สำเร็จ"); setBusy(""); }
  }

  // change the saved card WITHOUT charging or resetting the billing period
  async function updateCard(token: string) {
    setBusy("change");
    const res = await fetch("/api/billing", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_card", omiseToken: token }),
    });
    if (res.ok) { setCardModal(null); await load(); }
    else { alert((await res.json()).error?.message ?? "ไม่สำเร็จ"); }
    setBusy("");
  }

  // click "สมัคร": live + no saved card -> open card form; otherwise charge directly
  function onSubscribeClick(plan: string) {
    if (payment.live && !payment.savedCard) { setCardModal({ mode: "subscribe", plan }); return; }
    subscribe(plan);
  }

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }

  if (!tenant) return <div className="min-h-screen flex items-center justify-center text-gray-400">กำลังโหลด...</div>;
  const st = STATUS[tenant.status] ?? STATUS.TRIAL;
  const sc = payment.savedCard;

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white"><Store className="h-6 w-6" /></div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">{tenant.name}</h1>
              <p className="text-sm text-gray-500">การสมัครสมาชิก & การชำระเงิน</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {tenant.status === "ACTIVE" && <a href="/dashboard" className="btn-ghost">เข้าใช้งาน <ArrowRight className="h-4 w-4" /></a>}
            <button onClick={logout} className="btn-ghost"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="card p-5 mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">แผนปัจจุบัน</p>
            <p className="text-2xl font-bold text-gray-800">{plans[tenant.plan]?.name ?? tenant.plan}</p>
            <p className="text-xs text-gray-400 mt-1">
              {tenant.status === "TRIAL" && tenant.trialEndsAt && `ทดลองใช้ถึง ${fmtDateTime(tenant.trialEndsAt)}`}
              {tenant.status === "ACTIVE" && tenant.currentPeriodEnd && `ใช้ได้ถึง ${fmtDateTime(tenant.currentPeriodEnd)}`}
              {(tenant.status === "SUSPENDED" || tenant.status === "CANCELLED") && "หมดอายุ - กรุณาเลือกแผนเพื่อใช้งานต่อ"}
            </p>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${st.color}`}>{st.label}</span>
        </div>

        {sc && (
          <div className="card p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-700">{sc.brand ?? "บัตร"} ลงท้าย {sc.last4}</p>
                <p className="text-xs text-gray-400">หมดอายุ {String(sc.expMonth).padStart(2, "0")}/{sc.expYear} - ตัดเงินอัตโนมัติทุกเดือน</p>
              </div>
            </div>
            <button onClick={() => setCardModal({ mode: "change" })} className="text-brand-600 text-sm">เปลี่ยนบัตร</button>
          </div>
        )}

        {pending && (
          <div className="card p-4 mb-6 border-amber-300 bg-amber-50 flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-amber-600 animate-spin" />
            <div className="text-sm text-amber-800">
              <b>ส่งสลิปแล้ว รอแอดมินอนุมัติ</b> — แผน {pending.plan} ยอด {baht(pending.amount)} (ส่งเมื่อ {fmtDateTime(pending.createdAt)})
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {["BASIC", "PRO"].filter((p) => plans[p]).map((key) => {
            const p = plans[key];
            return (
              <div key={key} className={`card p-6 ${tenant.plan === key && tenant.status === "ACTIVE" ? "ring-2 ring-brand-500" : ""}`}>
                <p className="font-bold text-gray-800 text-lg">{p.name}</p>
                <p className="text-3xl font-bold text-brand-600 my-2">{baht(p.price)}<span className="text-sm text-gray-400 font-normal"> / เดือน</span></p>
                <ul className="text-sm text-gray-600 space-y-1 my-4">
                  <li className="flex gap-2"><Check className="h-4 w-4 text-brand-600" /> สูงสุด {p.maxBranches} สาขา</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-brand-600" /> สูงสุด {p.maxUsers} ผู้ใช้</li>
                  <li className="flex gap-2"><Check className="h-4 w-4 text-brand-600" /> ทุกฟีเจอร์ POS</li>
                </ul>
                <button onClick={() => onSubscribeClick(key)} disabled={!!busy} className="btn-primary w-full py-3">
                  {busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  {tenant.status === "ACTIVE" && tenant.plan === key ? "ต่ออายุ" : "สมัครแผนนี้"}
                </button>
              </div>
            );
          })}
        </div>

        {payment.live && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mb-6">
            <ShieldCheck className="h-3.5 w-3.5" /> ชำระเงินปลอดภัยผ่าน Omise - ข้อมูลบัตรเข้ารหัสฝั่งเบราว์เซอร์ ไม่ผ่านเซิร์ฟเวอร์เรา
          </p>
        )}

        {transfer.enabled && !pending && (
          <TransferSection transfer={transfer} plans={plans} onDone={load} />
        )}

        {invoices.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 font-bold text-gray-700 border-b border-gray-100">ประวัติการชำระเงิน</div>
            <table className="w-full text-sm">
              <tbody>
                {invoices.map((iv) => (
                  <tr key={iv.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-500">{fmtDateTime(iv.createdAt)}</td>
                    <td className="py-2 text-gray-700">{iv.plan}</td>
                    <td className="py-2">{iv.status === "FAILED"
                      ? <span className="text-rose-600 text-xs">ล้มเหลว</span>
                      : <span className="text-emerald-600 text-xs">สำเร็จ</span>}</td>
                    <td className="px-4 py-2 text-right font-semibold">{baht(iv.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cardModal && (
        <CardModal
          mode={cardModal.mode}
          price={cardModal.mode === "subscribe" ? (plans[cardModal.plan]?.price ?? 0) : 0}
          ready={omiseReady}
          busy={cardModal.mode === "change" ? busy === "change" : busy === cardModal.plan}
          onClose={() => setCardModal(null)}
          onToken={(token) => (cardModal.mode === "change" ? updateCard(token) : subscribe(cardModal.plan, token))}
          setBusy={(b) => setBusy(b ? (cardModal.mode === "change" ? "change" : cardModal.plan) : "")}
        />
      )}
    </div>
  );
}

function TransferSection({ transfer, plans, onDone }: { transfer: Transfer; plans: Record<string, Plan>; onDone: () => void }) {
  const [plan, setPlan] = useState("BASIC");
  const [slip, setSlip] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  function pickFile(file: File | undefined) {
    setErr("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("กรุณาเลือกไฟล์รูปภาพ"); return; }
    if (file.size > 2 * 1024 * 1024) { setErr("ไฟล์ใหญ่เกิน 2MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setSlip(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!slip) { setErr("แนบสลิปก่อน"); return; }
    setBusy(true); setErr("");
    const res = await fetch("/api/billing/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, slip, ref: ref || undefined }),
    });
    setBusy(false);
    if (res.ok) { setDone(true); onDone(); }
    else setErr((await res.json()).error?.message ?? "ส่งไม่สำเร็จ");
  }

  if (done) return null;

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center gap-2 font-bold text-gray-800 mb-1"><QrCode className="h-5 w-5 text-brand-600" /> ชำระโดยโอน / PromptPay</div>
      <p className="text-sm text-gray-500 mb-4">โอนตามยอดแผนที่เลือก แล้วแนบสลิป — แอดมินตรวจและเปิดใช้งานให้ (ปกติภายในไม่กี่ชั่วโมง)</p>

      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <label className="label">เลือกแผน</label>
          <div className="flex gap-2 mb-3">
            {["BASIC", "PRO"].filter((p) => plans[p]).map((p) => (
              <button key={p} onClick={() => setPlan(p)} className={`flex-1 rounded-lg border py-2 text-sm font-medium ${plan === p ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200"}`}>
                {plans[p].name} {baht(plans[p].price)}
              </button>
            ))}
          </div>
          {transfer.image ? (
            <div className="flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={transfer.image} alt="PromptPay QR" className="w-56 rounded-lg border border-gray-200" />
              <p className="text-xs text-gray-500 mt-1">สแกนแล้วโอน {baht(plans[plan]?.price ?? 0)}</p>
            </div>
          ) : transfer.qr[plan] ? (
            <div className="flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={transfer.qr[plan]} alt="PromptPay QR" className="w-52 h-52" />
              <p className="text-xs text-gray-500 mt-1">สแกนจ่าย {baht(plans[plan]?.price ?? 0)}</p>
            </div>
          ) : null}
          {transfer.promptPayId && <p className="text-center text-sm text-gray-600 mt-2">PromptPay: <b>{transfer.promptPayId}</b></p>}
          {transfer.bankInfo && <p className="text-center text-xs text-gray-500 mt-1 whitespace-pre-line">{transfer.bankInfo}</p>}
        </div>

        <div>
          <label className="label">แนบสลิปการโอน</label>
          <input type="file" accept="image/*" onChange={(e) => pickFile(e.target.files?.[0])} className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-100 file:px-3 file:py-2 file:text-brand-700" />
          {slip && <img src={slip} alt="ตัวอย่างสลิป" className="mt-3 max-h-48 rounded-lg border border-gray-200" />}
          <label className="label mt-3">อ้างอิง / หมายเหตุ (ถ้ามี)</label>
          <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="เช่น เวลาโอน / 4 ตัวท้ายบัญชี" />
          {err && <p className="text-sm text-rose-600 mt-2">{err}</p>}
          <button onClick={submit} disabled={busy || !slip} className="btn-primary w-full py-3 mt-3">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} ส่งสลิปให้แอดมินตรวจ
          </button>
        </div>
      </div>
    </div>
  );
}

function CardModal({ mode, price, ready, busy, onClose, onToken, setBusy }: {
  mode: "subscribe" | "change"; price: number; ready: boolean; busy: boolean;
  onClose: () => void; onToken: (token: string) => void; setBusy: (b: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [exp, setExp] = useState(""); // MM/YY
  const [cvc, setCvc] = useState("");
  const [err, setErr] = useState("");

  function submit() {
    setErr("");
    const [mm, yy] = exp.split("/").map((s) => s.trim());
    if (!window.Omise) { setErr("ระบบชำระเงินยังโหลดไม่เสร็จ"); return; }
    if (!name || number.replace(/\s/g, "").length < 13 || !mm || !yy || cvc.length < 3) { setErr("กรอกข้อมูลบัตรให้ครบ"); return; }
    setBusy(true);
    window.Omise.createToken("card", {
      name,
      number: number.replace(/\s/g, ""),
      expiration_month: mm,
      expiration_year: yy.length === 2 ? "20" + yy : yy,
      security_code: cvc,
    }, (status, res) => {
      if (status === 200 && res.id) onToken(res.id);
      else { setErr(res.message || "บัตรไม่ถูกต้อง"); setBusy(false); }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">{mode === "change" ? "เปลี่ยนบัตร" : "ชำระเงิน"}</h2>
          <button onClick={onClose} className="text-gray-400"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          {mode === "change" ? "บันทึกบัตรใหม่สำหรับตัดเงินรอบถัดไป - ไม่มีการเรียกเก็บเงินตอนนี้" : `ยอด ${baht(price)} / เดือน - ตัดบัตรอัตโนมัติทุกเดือน ยกเลิกได้`}
        </p>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อบนบัตร" className="input w-full" />
          <input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" placeholder="หมายเลขบัตร" className="input w-full" />
          <div className="grid grid-cols-2 gap-3">
            <input value={exp} onChange={(e) => setExp(e.target.value)} placeholder="MM/YY" className="input w-full" />
            <input value={cvc} onChange={(e) => setCvc(e.target.value)} inputMode="numeric" placeholder="CVC" className="input w-full" />
          </div>
        </div>
        {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
        <button onClick={submit} disabled={busy || !ready} className="btn-primary w-full py-3 mt-4">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          {!ready ? "กำลังโหลด..." : mode === "change" ? "บันทึกบัตร" : `จ่าย ${baht(price)}`}
        </button>
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400 mt-3">
          <ShieldCheck className="h-3 w-3" /> เข้ารหัสโดย Omise - เราไม่เก็บเลขบัตร
        </p>
      </div>
    </div>
  );
}

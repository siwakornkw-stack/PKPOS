"use client";

import { useEffect, useState, useCallback } from "react";
import { Settings, Users2, ShieldCheck, ScrollText, Plus, KeyRound, Power, Building2, Save, Printer, Trash2, Wifi } from "lucide-react";
import { PageHeader, Badge, Modal } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { useCan } from "@/components/SessionProvider";
import { PERMISSIONS } from "@/lib/permissions";

interface UserRow { id: number; username: string; fullName: string; roleName: string; roleCode: string; branchId: number | null; branch: string; isActive: boolean; }
interface RoleRow { code: string; name: string; permissions: string[] }
interface BranchRow { id: number; name: string }
interface AuditRow { id: number; action: string; entity: string | null; entityId: string | null; createdAt: string; user: { fullName: string; username: string } | null; }

const PERM_LABELS: Record<string, string> = {
  "dashboard.view": "แดชบอร์ด", "pos.access": "ขายหน้าร้าน", "order.void": "ยกเลิก/คืนเงิน",
  "discount.override": "ปรับส่วนลด", "menu.manage": "จัดการเมนู", "promotion.manage": "โปรโมชัน",
  "inventory.manage": "คลังสินค้า", "purchase.manage": "สั่งซื้อ", "shift.close": "ปิดกะ",
  "user.manage": "จัดการผู้ใช้", "audit.view": "ดู Audit", "report.export": "ออกรายงาน",
  "kitchen.view": "ครัว", "table.view": "ผังโต๊ะ", "customer.manage": "ลูกค้า", "settings.manage": "ตั้งค่า",
};
const ALL_PERMS = Object.keys(PERM_LABELS);

export default function SettingsPage() {
  const canManage = useCan(PERMISSIONS.SETTINGS_MANAGE);
  const canUsers = useCan(PERMISSIONS.USER_MANAGE);
  const canAudit = useCan(PERMISSIONS.AUDIT_VIEW);
  const [tab, setTab] = useState<"users" | "business" | "printers" | "audit">(canManage ? "users" : "audit");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [adding, setAdding] = useState(false);

  const loadUsers = useCallback(async () => {
    const d = await (await fetch("/api/users")).json();
    setUsers(d.users ?? []); setRoles(d.roles ?? []); setBranches(d.branches ?? []);
  }, []);

  useEffect(() => {
    if (canManage) loadUsers();
    if (canAudit) fetch("/api/audit").then((r) => r.json()).then((d) => setLogs(d.logs ?? []));
  }, [canManage, canAudit, loadUsers]);

  async function patchUser(id: number, body: Record<string, unknown>) {
    await fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    loadUsers();
  }
  async function resetPin(id: number) {
    const pin = prompt("ตั้ง PIN ใหม่ (4-20 ตัว):");
    if (!pin) return;
    await patchUser(id, { pin });
    alert("รีเซ็ต PIN แล้ว");
  }

  return (
    <div className="p-6">
      <PageHeader title="ตั้งค่าระบบ" subtitle="ผู้ใช้ สิทธิ์การใช้งาน และบันทึกการตรวจสอบ" icon={Settings} />

      <div className="flex gap-2 mb-5">
        {canManage && <TabBtn active={tab === "users"} onClick={() => setTab("users")} icon={Users2}>ผู้ใช้ & สิทธิ์</TabBtn>}
        {canManage && <TabBtn active={tab === "business"} onClick={() => setTab("business")} icon={Building2}>ตั้งค่าธุรกิจ</TabBtn>}
        {canManage && <TabBtn active={tab === "printers"} onClick={() => setTab("printers")} icon={Printer}>เครื่องพิมพ์</TabBtn>}
        {canAudit && <TabBtn active={tab === "audit"} onClick={() => setTab("audit")} icon={ScrollText}>Audit Log</TabBtn>}
      </div>

      {tab === "users" && canManage && (
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="px-4 py-3 font-bold text-gray-700 border-b border-gray-100 flex items-center justify-between">
              <span className="flex items-center gap-2"><Users2 className="h-4 w-4" /> ผู้ใช้งาน</span>
              {canUsers && <button onClick={() => setAdding(true)} className="btn-primary py-1.5"><Plus className="h-4 w-4" /> เพิ่มผู้ใช้</button>}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="text-left px-4 py-2">ชื่อผู้ใช้</th><th className="text-left py-2">ชื่อ-สกุล</th><th className="text-left py-2">บทบาท</th><th className="text-left py-2">สาขา</th><th className="text-center py-2">สถานะ</th><th className="py-2"></th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-700">{u.username}</td>
                    <td className="py-2 text-gray-600">{u.fullName}</td>
                    <td className="py-2">
                      {canUsers ? (
                        <select value={u.roleCode} onChange={(e) => patchUser(u.id, { roleCode: e.target.value })} className="rounded border border-gray-200 px-2 py-1 text-xs">
                          {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                        </select>
                      ) : <Badge className="bg-brand-100 text-brand-700">{u.roleName}</Badge>}
                    </td>
                    <td className="py-2 text-gray-500">{u.branch}</td>
                    <td className="py-2 text-center">{u.isActive ? <Badge className="bg-emerald-100 text-emerald-700">ใช้งาน</Badge> : <Badge className="bg-gray-100 text-gray-500">ปิด</Badge>}</td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      {canUsers && (
                        <>
                          <button onClick={() => resetPin(u.id)} title="รีเซ็ต PIN" className="text-gray-400 hover:text-brand-600 mr-3"><KeyRound className="h-4 w-4 inline" /></button>
                          <button onClick={() => patchUser(u.id, { isActive: !u.isActive })} title="เปิด/ปิดการใช้งาน" className="text-gray-400 hover:text-rose-600"><Power className="h-4 w-4 inline" /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 font-bold text-gray-700 border-b border-gray-100 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> ตารางสิทธิ์ (Role & Permission Matrix)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50"><tr><th className="text-left px-3 py-2 sticky left-0 bg-gray-50">สิทธิ์</th>{roles.map((r) => <th key={r.code} className="px-2 py-2 text-center whitespace-nowrap">{r.code}</th>)}</tr></thead>
                <tbody>
                  {ALL_PERMS.map((perm) => (
                    <tr key={perm} className="border-b border-gray-50">
                      <td className="px-3 py-1.5 text-gray-600 sticky left-0 bg-white whitespace-nowrap">{PERM_LABELS[perm]}</td>
                      {roles.map((r) => {
                        const ok = r.permissions.includes("*") || r.permissions.includes(perm);
                        return <td key={r.code} className="px-2 py-1.5 text-center">{ok ? <span className="text-emerald-600 font-bold">●</span> : <span className="text-gray-200">○</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "business" && canManage && <BusinessSettings />}
      {tab === "printers" && canManage && <Printers />}

      {tab === "audit" && canAudit && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 font-bold text-gray-700 border-b border-gray-100 flex items-center gap-2"><ScrollText className="h-4 w-4" /> บันทึกการตรวจสอบ (Audit Log)</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="text-left px-4 py-2">เวลา</th><th className="text-left py-2">ผู้ใช้</th><th className="text-left py-2">การกระทำ</th><th className="text-left py-2">รายการ</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-gray-50">
                  <td className="px-4 py-1.5 text-gray-400 whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                  <td className="py-1.5 text-gray-600">{l.user?.fullName ?? "-"}</td>
                  <td className="py-1.5"><Badge className="bg-gray-100 text-gray-700">{l.action}</Badge></td>
                  <td className="py-1.5 text-gray-400">{l.entity}{l.entityId ? ` #${l.entityId}` : ""}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={4} className="text-center text-gray-400 py-8">ยังไม่มีบันทึก</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <AddUserModal open={adding} roles={roles} branches={branches} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); loadUsers(); }} />
    </div>
  );
}

function AddUserModal({ open, roles, branches, onClose, onSaved }: { open: boolean; roles: RoleRow[]; branches: BranchRow[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ username: "", fullName: "", roleCode: "", branchId: 0, pin: "" });
  const [err, setErr] = useState("");
  useEffect(() => {
    if (open) setForm((f) => ({ ...f, roleCode: roles[0]?.code ?? "", branchId: branches[0]?.id ?? 0 }));
  }, [open, roles, branches]);

  async function save() {
    setErr("");
    const res = await fetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, branchId: form.branchId || null }),
    });
    if (res.ok) { setForm({ username: "", fullName: "", roleCode: roles[0]?.code ?? "", branchId: branches[0]?.id ?? 0, pin: "" }); onSaved(); }
    else setErr((await res.json()).error?.message ?? "เพิ่มผู้ใช้ไม่สำเร็จ");
  }

  return (
    <Modal open={open} onClose={onClose} title="เพิ่มผู้ใช้ใหม่">
      <div className="space-y-3">
        <div><label className="label">ชื่อผู้ใช้ (username)</label><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
        <div><label className="label">ชื่อ-สกุล</label><input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">บทบาท</label>
            <select className="input" value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })}>
              {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </div>
          <div><label className="label">สาขา</label>
            <select className="input" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: Number(e.target.value) })}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">PIN เริ่มต้น (4-20 ตัว)</label><input className="input" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} /></div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button onClick={save} className="btn-primary w-full">บันทึก</button>
      </div>
    </Modal>
  );
}

function BusinessSettings() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/branch-settings").then((r) => r.json()).then((d) => {
      const b = d.branch;
      setForm({
        name: b.name ?? "", address: b.address ?? "", phone: b.phone ?? "", taxId: b.taxId ?? "",
        taxRate: String(Number(((b.taxRate ?? 0) * 100).toFixed(4))),
        serviceRate: String(Number(((b.serviceRate ?? 0) * 100).toFixed(4))),
        receiptHeader: b.receiptHeader ?? "", receiptFooter: b.receiptFooter ?? "", promptPayId: b.promptPayId ?? "",
        paymentProvider: b.paymentProvider ?? "MOCK", omiseSecretKey: "", omisePublicKey: b.omisePublicKey ?? "",
        hasOmiseSecretKey: b.hasOmiseSecretKey ? "1" : "",
      });
    });
  }, []);

  async function save() {
    setBusy(true); setSaved(false);
    const res = await fetch("/api/branch-settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, address: form.address, phone: form.phone, taxId: form.taxId,
        taxRate: (Number(form.taxRate) || 0) / 100,
        serviceRate: (Number(form.serviceRate) || 0) / 100,
        receiptHeader: form.receiptHeader, receiptFooter: form.receiptFooter, promptPayId: form.promptPayId,
        paymentProvider: form.paymentProvider, omiseSecretKey: form.omiseSecretKey, omisePublicKey: form.omisePublicKey,
      }),
    });
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    setBusy(false);
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="card p-6 max-w-2xl space-y-4">
      <div className="flex items-center gap-2 font-bold text-gray-700"><Building2 className="h-4 w-4" /> ข้อมูลร้าน / สาขา</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label">ชื่อร้าน/สาขา</label><input className="input" value={form.name ?? ""} onChange={set("name")} /></div>
        <div className="col-span-2"><label className="label">ที่อยู่</label><input className="input" value={form.address ?? ""} onChange={set("address")} /></div>
        <div><label className="label">โทรศัพท์</label><input className="input" value={form.phone ?? ""} onChange={set("phone")} /></div>
        <div><label className="label">เลขผู้เสียภาษี</label><input className="input" value={form.taxId ?? ""} onChange={set("taxId")} /></div>
      </div>

      <div className="flex items-center gap-2 font-bold text-gray-700 pt-2 border-t border-gray-100"><Settings className="h-4 w-4" /> ภาษี & ค่าบริการ</div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">VAT (%)</label><input type="number" className="input" value={form.taxRate ?? ""} onChange={set("taxRate")} /></div>
        <div><label className="label">Service charge (%) - dine-in</label><input type="number" className="input" value={form.serviceRate ?? ""} onChange={set("serviceRate")} /></div>
      </div>

      <div className="flex items-center gap-2 font-bold text-gray-700 pt-2 border-t border-gray-100"><ScrollText className="h-4 w-4" /> ใบเสร็จ & การชำระเงิน</div>
      <div className="grid grid-cols-1 gap-3">
        <div><label className="label">ข้อความหัวใบเสร็จ</label><input className="input" value={form.receiptHeader ?? ""} onChange={set("receiptHeader")} placeholder="เช่น ขอบคุณที่อุดหนุน" /></div>
        <div><label className="label">ข้อความท้ายใบเสร็จ</label><input className="input" value={form.receiptFooter ?? ""} onChange={set("receiptFooter")} /></div>
        <div><label className="label">PromptPay ID (เบอร์โทร/เลขบัตร ปชช.)</label><input className="input" value={form.promptPayId ?? ""} onChange={set("promptPayId")} placeholder="0812345678" /></div>
      </div>

      <div className="flex items-center gap-2 font-bold text-gray-700 pt-2 border-t border-gray-100"><KeyRound className="h-4 w-4" /> รับชำระบัตร (payment gateway)</div>
      <div className="grid grid-cols-1 gap-3">
        <div><label className="label">ผู้ให้บริการ</label>
          <select className="input" value={form.paymentProvider ?? "MOCK"} onChange={(e) => setForm({ ...form, paymentProvider: e.target.value })}>
            <option value="MOCK">ทดสอบ (Mock - อนุมัติอัตโนมัติ)</option>
            <option value="OMISE">Omise</option>
          </select>
        </div>
        {form.paymentProvider === "OMISE" && (
          <>
            <div><label className="label">Omise Secret Key</label><input className="input" type="password" value={form.omiseSecretKey ?? ""} onChange={set("omiseSecretKey")} placeholder={form.hasOmiseSecretKey ? "บันทึกไว้แล้ว - กรอกใหม่เพื่อเปลี่ยน" : "skey_..."} /></div>
            <div><label className="label">Omise Public Key</label><input className="input" value={form.omisePublicKey ?? ""} onChange={set("omisePublicKey")} placeholder="pkey_..." /></div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={save} disabled={busy} className="btn-primary"><Save className="h-4 w-4" /> บันทึก</button>
        {saved && <span className="text-sm text-emerald-600">บันทึกแล้ว</span>}
      </div>
    </div>
  );
}

interface PrinterRow { id: number; name: string; host: string; port: number; type: string; station: string | null; isActive: boolean; }

function Printers() {
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [adding, setAdding] = useState(false);
  const load = useCallback(async () => {
    const d = await (await fetch("/api/printers")).json();
    setPrinters(d.printers ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function patch(id: number, body: Record<string, unknown>) {
    const res = await fetch(`/api/printers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (body.test) { alert(res.ok ? "ส่งทดสอบพิมพ์แล้ว" : (await res.json()).error?.message ?? "ทดสอบไม่สำเร็จ"); return; }
    load();
  }
  async function del(id: number) {
    if (!confirm("ลบเครื่องพิมพ์นี้?")) return;
    await fetch(`/api/printers/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="card overflow-hidden max-w-3xl">
      <div className="px-4 py-3 font-bold text-gray-700 border-b border-gray-100 flex items-center justify-between">
        <span className="flex items-center gap-2"><Printer className="h-4 w-4" /> เครื่องพิมพ์ (ESC/POS network)</span>
        <button onClick={() => setAdding(true)} className="btn-primary py-1.5"><Plus className="h-4 w-4" /> เพิ่มเครื่องพิมพ์</button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500"><tr><th className="text-left px-4 py-2">ชื่อ</th><th className="text-left py-2">IP : Port</th><th className="text-left py-2">ประเภท</th><th className="text-left py-2">จุด</th><th className="text-center py-2">ใช้งาน</th><th className="py-2"></th></tr></thead>
        <tbody>
          {printers.map((p) => (
            <tr key={p.id} className="border-b border-gray-50">
              <td className="px-4 py-2 font-medium text-gray-700">{p.name}</td>
              <td className="py-2 text-gray-500 font-mono text-xs">{p.host}:{p.port}</td>
              <td className="py-2"><Badge className={p.type === "RECEIPT" ? "bg-brand-100 text-brand-700" : "bg-blue-100 text-blue-700"}>{p.type === "RECEIPT" ? "ใบเสร็จ" : "ครัว"}</Badge></td>
              <td className="py-2 text-gray-500">{p.station ?? "-"}</td>
              <td className="py-2 text-center">
                <button onClick={() => patch(p.id, { isActive: !p.isActive })}>{p.isActive ? <Badge className="bg-emerald-100 text-emerald-700">เปิด</Badge> : <Badge className="bg-gray-100 text-gray-500">ปิด</Badge>}</button>
              </td>
              <td className="py-2 pr-4 text-right whitespace-nowrap">
                <button onClick={() => patch(p.id, { test: true })} title="ทดสอบพิมพ์" className="text-gray-400 hover:text-brand-600 mr-3"><Wifi className="h-4 w-4 inline" /></button>
                <button onClick={() => del(p.id)} title="ลบ" className="text-gray-400 hover:text-rose-600"><Trash2 className="h-4 w-4 inline" /></button>
              </td>
            </tr>
          ))}
          {printers.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-8">ยังไม่มีเครื่องพิมพ์ - เพิ่มเครื่องพิมพ์ network ESC/POS</td></tr>}
        </tbody>
      </table>
      <AddPrinterModal open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
    </div>
  );
}

function AddPrinterModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", host: "", port: "9100", type: "RECEIPT", station: "" });
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    const res = await fetch("/api/printers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, host: form.host, port: Number(form.port) || 9100, type: form.type, station: form.station || undefined }),
    });
    if (res.ok) { setForm({ name: "", host: "", port: "9100", type: "RECEIPT", station: "" }); onSaved(); }
    else setErr((await res.json()).error?.message ?? "เพิ่มไม่สำเร็จ");
  }
  return (
    <Modal open={open} onClose={onClose} title="เพิ่มเครื่องพิมพ์">
      <div className="space-y-3">
        <div><label className="label">ชื่อ</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="เครื่องพิมพ์แคชเชียร์" /></div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><label className="label">IP / hostname</label><input className="input" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="192.168.1.50" /></div>
          <div><label className="label">Port</label><input className="input" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">ประเภท</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="RECEIPT">ใบเสร็จ / แคชเชียร์</option>
              <option value="KITCHEN">ครัว</option>
            </select>
          </div>
          {form.type === "KITCHEN" && <div><label className="label">จุดครัว (ถ้ามี)</label><input className="input" value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} placeholder="ครัวร้อน" /></div>}
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <button onClick={save} className="btn-primary w-full">บันทึก</button>
      </div>
    </Modal>
  );
}

function TabBtn({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`btn ${active ? "bg-brand-600 text-white" : "bg-white text-gray-600 border border-gray-200"}`}>
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
}

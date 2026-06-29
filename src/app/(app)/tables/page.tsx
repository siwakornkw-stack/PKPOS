"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Grid3x3, Users, RefreshCw, PauseCircle, QrCode } from "lucide-react";
import { PageHeader, Modal } from "@/components/ui";
import { baht, fmtTime } from "@/lib/format";
import { TABLE_STATUS } from "@/lib/constants";

interface TableInfo {
  id: number; code: string; zone: string | null; seats: number; status: string; qrToken: string | null;
  order: { id: number; docNo: string; guestCount: number; itemCount: number; netAmount: number; subtotal: number; createdAt: string } | null;
}
interface HeldOrder { id: number; docNo: string; holdName: string | null; netAmount: number; }

export default function TablesPage() {
  const router = useRouter();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [held, setHeld] = useState<HeldOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);

  const load = useCallback(async () => {
    const [d, h] = await Promise.all([
      (await fetch("/api/tables")).json(),
      (await fetch("/api/orders?status=HELD")).json(),
    ]);
    setTables(d.tables ?? []);
    setHeld(h.orders ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  // group by zone
  const zones = [...new Set(tables.map((t) => t.zone ?? "อื่นๆ"))];

  function open(t: TableInfo) {
    router.push(t.order ? `/pos?order=${t.order.id}` : `/pos?table=${t.id}`);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="ผังโต๊ะ" subtitle="แตะที่โต๊ะเพื่อรับออเดอร์หรือดูบิล" icon={Grid3x3}
        actions={
          <>
            <button onClick={() => setQrOpen(true)} className="btn-ghost"><QrCode className="h-4 w-4" /> QR สั่งอาหาร</button>
            <button onClick={load} className="btn-ghost"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> รีเฟรช</button>
          </>
        }
      />
      <TableQRModal open={qrOpen} onClose={() => setQrOpen(false)} tables={tables} />

      {held.length > 0 && (
        <div className="card p-3 mb-5">
          <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><PauseCircle className="h-3.5 w-3.5" /> บิลที่พักไว้</p>
          <div className="flex flex-wrap gap-2">
            {held.map((h) => (
              <button key={h.id} onClick={() => router.push(`/pos?order=${h.id}`)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100">
                {h.holdName || h.docNo} · {baht(h.netAmount)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-5 text-xs">
        {Object.entries(TABLE_STATUS).map(([k, v]) => (
          <span key={k} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${v.color}`}>
            ● {v.label}
          </span>
        ))}
      </div>

      {/* placeholder to keep JSX structure */}
      {zones.map((zone) => (
        <div key={zone} className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">{zone}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {tables.filter((t) => (t.zone ?? "อื่นๆ") === zone).map((t) => {
              const st = TABLE_STATUS[t.status] ?? TABLE_STATUS.AVAILABLE;
              return (
                <button
                  key={t.id} onClick={() => open(t)}
                  className={`rounded-xl border-2 p-3 text-left transition hover:shadow-md ${st.color}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold">{t.code}</span>
                    <span className="flex items-center gap-1 text-xs opacity-70"><Users className="h-3 w-3" />{t.seats}</span>
                  </div>
                  <p className="text-xs mt-0.5">{st.label}</p>
                  {t.order && (
                    <div className="mt-2 pt-2 border-t border-current/20 text-xs space-y-0.5">
                      <p>{t.order.itemCount} รายการ</p>
                      <p className="font-semibold">{baht(t.order.netAmount)}</p>
                      <p className="opacity-60">{fmtTime(t.order.createdAt)}</p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TableQRModal({ open, onClose, tables }: { open: boolean; onClose: () => void; tables: TableInfo[] }) {
  const [picked, setPicked] = useState<TableInfo | null>(null);
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!open) { setPicked(null); setQr(""); }
  }, [open]);
  useEffect(() => {
    if (!picked?.qrToken) return;
    const u = `${location.origin}/order/${picked.qrToken}`;
    setUrl(u);
    QRCode.toDataURL(u, { width: 240, margin: 1 }).then(setQr);
  }, [picked]);

  return (
    <Modal open={open} onClose={onClose} title="QR สั่งอาหารด้วยตัวเอง">
      {!picked ? (
        <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto">
          {tables.map((t) => (
            <button key={t.id} onClick={() => setPicked(t)} disabled={!t.qrToken} className="rounded-lg border border-gray-200 py-3 font-bold text-gray-700 hover:border-brand-400 disabled:opacity-30">
              {t.code}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p className="font-semibold text-gray-700">โต๊ะ {picked.code}</p>
          {qr && <img src={qr} alt="QR" className="w-56 h-56" />}
          <p className="text-xs text-gray-400 break-all text-center">{url}</p>
          <p className="text-xs text-gray-500">ลูกค้าสแกนเพื่อดูเมนูและสั่งเอง</p>
          <button onClick={() => setPicked(null)} className="btn-ghost mt-1">เลือกโต๊ะอื่น</button>
        </div>
      )}
    </Modal>
  );
}

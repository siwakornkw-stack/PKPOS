"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Capture the buyer's details for a full tax invoice (ใบกำกับภาษีเต็มรูป), then reload
// so the printed invoice shows them. Hidden when printing (no-print).
export function BuyerForm({ orderId, initial }: {
  orderId: number;
  initial: { buyerName: string | null; buyerTaxId: string | null; buyerAddress: string | null };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.buyerName ?? "");
  const [taxId, setTaxId] = useState(initial.buyerTaxId ?? "");
  const [address, setAddress] = useState(initial.buyerAddress ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/orders/${orderId}/buyer`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyerName: name, buyerTaxId: taxId, buyerAddress: address }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert("บันทึกไม่สำเร็จ");
  }

  return (
    <div className="no-print card p-4 mb-3">
      <p className="text-sm font-semibold text-gray-700 mb-2">ข้อมูลผู้ซื้อ (ใบกำกับภาษีเต็มรูป)</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อผู้ซื้อ / บริษัท" />
        <input className="input" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="เลขประจำตัวผู้เสียภาษี" />
        <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ที่อยู่" />
      </div>
      <button onClick={save} disabled={busy} className="btn-primary mt-2">บันทึกข้อมูลผู้ซื้อ</button>
    </div>
  );
}

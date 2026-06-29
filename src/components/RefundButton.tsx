"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";

export function RefundButton({ orderId }: { orderId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function refund() {
    const reason = prompt("เหตุผลการคืนเงิน (ถ้ามี):");
    if (reason === null) return; // cancelled
    if (!confirm("ยืนยันคืนเงินบิลนี้? สต็อกจะถูกคืนและแต้มสมาชิกจะถูกหัก")) return;
    setBusy(true);
    const res = await fetch(`/api/orders/${orderId}/refund`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (res.ok) router.refresh();
    else alert((await res.json()).error?.message ?? "คืนเงินไม่สำเร็จ");
    setBusy(false);
  }

  return (
    <button onClick={refund} disabled={busy} className="btn-danger no-print">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} คืนเงิน
    </button>
  );
}

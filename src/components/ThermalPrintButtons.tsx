"use client";

import { useState } from "react";
import { Printer, ChefHat, Loader2, ReceiptText } from "lucide-react";

export function ThermalPrintButtons({ orderId }: { orderId: number }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function print(target: "receipt" | "kitchen" | "prebill") {
    setBusy(target);
    const res = await fetch("/api/print", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, target }),
    });
    const d = await res.json().catch(() => null);
    if (res.ok) alert(`ส่งไปเครื่องพิมพ์แล้ว (${d.bytes} bytes)`);
    else alert(d?.error?.message ?? "พิมพ์ไม่สำเร็จ");
    setBusy(null);
  }

  return (
    <div className="flex gap-2 no-print">
      <button onClick={() => print("prebill")} disabled={!!busy} className="btn-ghost">
        {busy === "prebill" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />} เช็คบิล
      </button>
      <button onClick={() => print("receipt")} disabled={!!busy} className="btn-ghost">
        {busy === "receipt" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} เครื่องพิมพ์ใบเสร็จ
      </button>
      <button onClick={() => print("kitchen")} disabled={!!busy} className="btn-ghost">
        {busy === "kitchen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChefHat className="h-4 w-4" />} ตั๋วครัว
      </button>
    </div>
  );
}

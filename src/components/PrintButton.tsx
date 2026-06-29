"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-primary no-print">
      <Printer className="h-4 w-4" /> พิมพ์ใบเสร็จ
    </button>
  );
}

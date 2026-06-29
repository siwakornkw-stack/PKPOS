"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-gray-800">เกิดข้อผิดพลาด</h2>
        <p className="text-sm text-gray-500">ระบบทำงานผิดพลาด ลองใหม่อีกครั้ง</p>
      </div>
      <button onClick={reset} className="btn-primary">
        <RotateCcw className="h-4 w-4" /> ลองใหม่
      </button>
    </div>
  );
}

import Link from "next/link";
import { Store } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-100 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
        <Store className="h-7 w-7" />
      </div>
      <h1 className="text-3xl font-bold text-gray-800">404</h1>
      <p className="text-gray-500">ไม่พบหน้าที่ต้องการ</p>
      <Link href="/dashboard" className="btn-primary">กลับหน้าหลัก</Link>
    </div>
  );
}

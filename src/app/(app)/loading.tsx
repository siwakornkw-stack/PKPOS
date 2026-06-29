import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center text-gray-400">
      <Loader2 className="h-6 w-6 animate-spin mr-2" /> กำลังโหลด...
    </div>
  );
}

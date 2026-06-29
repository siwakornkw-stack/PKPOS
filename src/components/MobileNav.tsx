"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Store } from "lucide-react";
import { hasPermission } from "@/lib/permissions";
import { useLang } from "@/lib/i18n";
import { useSession } from "./SessionProvider";
import { NAV } from "./Sidebar";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const user = useSession();
  const { t } = useLang();
  const items = NAV.filter((n) => n.perms.some((p) => hasPermission(user.permissions, p)));

  return (
    <div className="md:hidden">
      <button onClick={() => setOpen(true)} className="p-2 -ml-1 text-gray-600" aria-label="เมนู">
        <Menu className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="relative w-64 bg-brand-800 text-white flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 h-16 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15"><Store className="h-5 w-5" /></div>
                <p className="font-bold">PkPos</p>
              </div>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <nav className="flex-1 overflow-y-auto py-3">
              {items.map((n) => {
                const active = pathname === n.href || pathname.startsWith(n.href + "/");
                const Icon = n.icon;
                return (
                  <Link
                    key={n.href} href={n.href} onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-5 py-3 text-sm font-medium ${active ? "bg-white/15 text-white" : "text-brand-100"}`}
                  >
                    <Icon className="h-5 w-5" /> {t(n.tkey)}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Wifi, Printer, LogOut, UserCircle2 } from "lucide-react";
import { useSession } from "./SessionProvider";
import { useLang } from "@/lib/i18n";
import { MobileNav } from "./MobileNav";
import { NotificationBell } from "./NotificationBell";
import { fmtTime } from "@/lib/format";

export function Topbar() {
  const router = useRouter();
  const user = useSession();
  const { lang, setLang, t } = useLang();
  const [now, setNow] = useState<string>("");
  const [online, setOnline] = useState(true);
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    const tick = () => setNow(fmtTime(new Date()));
    tick();
    const id = setInterval(tick, 1000 * 30);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("/api/branches").then((r) => r.json()).then((d) => { if (d.canSwitch) setBranches(d.branches ?? []); });
  }, []);

  async function switchBranch(branchId: number) {
    await fetch("/api/branch/switch", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branchId }),
    });
    router.refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <MobileNav />
        {branches.length > 1 ? (
          <select
            value={user.branchId ?? ""}
            onChange={(e) => switchBranch(Number(e.target.value))}
            className="font-semibold text-gray-700 rounded-lg border border-gray-200 px-2 py-1 text-sm"
          >
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        ) : (
          <span className="font-semibold text-gray-700">{user.branchName ?? "สาขาหลัก"}</span>
        )}
        <span className="text-gray-300">|</span>
        <span>{now}</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Online + printer status indicators (UX guideline) */}
        <div className="hidden sm:flex items-center gap-3 text-xs">
          <span className={`flex items-center gap-1 ${online ? "text-emerald-600" : "text-rose-600"}`}>
            <Wifi className="h-4 w-4" /> {online ? t("topbar.online") : t("topbar.offline")}
          </span>
          <span className="flex items-center gap-1 text-emerald-600">
            <Printer className="h-4 w-4" /> {t("topbar.printerReady")}
          </span>
        </div>

        <button
          onClick={() => setLang(lang === "th" ? "en" : "th")}
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          title="Language"
        >
          {lang === "th" ? "EN" : "TH"}
        </button>

        <NotificationBell />

        <div className="flex items-center gap-2">
          <UserCircle2 className="h-7 w-7 text-gray-400" />
          <div className="text-right leading-tight">
            <p className="text-sm font-semibold text-gray-700">{user.fullName}</p>
            <p className="text-[11px] text-gray-400">{user.roleName}</p>
          </div>
        </div>

        <button onClick={logout} className="btn-ghost px-3 py-1.5" title={t("common.logout")}>
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

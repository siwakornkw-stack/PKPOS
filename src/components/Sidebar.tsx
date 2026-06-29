"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Grid3x3, ChefHat, BookOpen,
  Boxes, Users, BarChart3, Settings, Store, Clock, CalendarClock, Truck, Tag, ClipboardList,
  Ticket, MonitorSmartphone, HelpCircle, Timer,
} from "lucide-react";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { useLang } from "@/lib/i18n";
import { useSession } from "./SessionProvider";

export const NAV = [
  { href: "/dashboard", tkey: "nav.dashboard", icon: LayoutDashboard, perms: [PERMISSIONS.DASHBOARD_VIEW] },
  { href: "/pos", tkey: "nav.pos", icon: ShoppingCart, perms: [PERMISSIONS.POS_ACCESS] },
  { href: "/tables", tkey: "nav.tables", icon: Grid3x3, perms: [PERMISSIONS.TABLE_VIEW] },
  { href: "/kitchen", tkey: "nav.kitchen", icon: ChefHat, perms: [PERMISSIONS.KITCHEN_VIEW] },
  { href: "/bookings", tkey: "nav.bookings", icon: CalendarClock, perms: [PERMISSIONS.CUSTOMER_MANAGE] },
  { href: "/shift", tkey: "nav.shift", icon: Clock, perms: [PERMISSIONS.POS_ACCESS] },
  { href: "/attendance", tkey: "nav.attendance", icon: Timer, perms: [PERMISSIONS.DASHBOARD_VIEW] },
  { href: "/menu", tkey: "nav.menu", icon: BookOpen, perms: [PERMISSIONS.MENU_MANAGE] },
  { href: "/promotions", tkey: "nav.promotions", icon: Tag, perms: [PERMISSIONS.PROMOTION_MANAGE] },
  { href: "/vouchers", tkey: "nav.vouchers", icon: Ticket, perms: [PERMISSIONS.PROMOTION_MANAGE] },
  { href: "/display", tkey: "nav.display", icon: MonitorSmartphone, perms: [PERMISSIONS.POS_ACCESS] },
  { href: "/inventory", tkey: "nav.inventory", icon: Boxes, perms: [PERMISSIONS.INVENTORY_MANAGE] },
  { href: "/stock-count", tkey: "nav.stockCount", icon: ClipboardList, perms: [PERMISSIONS.INVENTORY_MANAGE] },
  { href: "/purchasing", tkey: "nav.purchasing", icon: Truck, perms: [PERMISSIONS.PURCHASE_MANAGE] },
  { href: "/customers", tkey: "nav.customers", icon: Users, perms: [PERMISSIONS.CUSTOMER_MANAGE] },
  { href: "/reports", tkey: "nav.reports", icon: BarChart3, perms: [PERMISSIONS.REPORT_EXPORT] },
  { href: "/settings", tkey: "nav.settings", icon: Settings, perms: [PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.AUDIT_VIEW] },
  { href: "/help", tkey: "nav.help", icon: HelpCircle, perms: [PERMISSIONS.DASHBOARD_VIEW] },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useSession();
  const { t } = useLang();

  const items = NAV.filter((n) => n.perms.some((p) => hasPermission(user.permissions, p)));

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-brand-800 text-white">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-white/10">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
          <Store className="h-5 w-5" />
        </div>
        <div>
          <p className="font-bold leading-tight">PkPos</p>
          <p className="text-[11px] text-brand-200">ร้านอาหาร</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {items.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-white/15 border-r-4 border-accent-500 text-white"
                  : "text-brand-100 hover:bg-white/10"
              }`}
            >
              <Icon className="h-5 w-5" />
              {t(n.tkey)}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-3 border-t border-white/10 text-[11px] text-brand-200">
        v0.1
      </div>
    </aside>
  );
}

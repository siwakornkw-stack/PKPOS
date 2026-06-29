"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "th" | "en";

// Shell/common strings. Page-level strings extend this dict by adding keys.
const DICT: Record<string, { th: string; en: string }> = {
  "nav.dashboard": { th: "แดชบอร์ด", en: "Dashboard" },
  "nav.pos": { th: "ขายหน้าร้าน", en: "POS Sales" },
  "nav.tables": { th: "ผังโต๊ะ", en: "Table Map" },
  "nav.kitchen": { th: "ครัว (KDS)", en: "Kitchen (KDS)" },
  "nav.bookings": { th: "จองโต๊ะ", en: "Bookings" },
  "nav.shift": { th: "กะการขาย", en: "Shift" },
  "nav.attendance": { th: "ลงเวลางาน", en: "Attendance" },
  "nav.menu": { th: "เมนู & ราคา", en: "Menu & Price" },
  "nav.promotions": { th: "โปรโมชัน", en: "Promotions" },
  "nav.vouchers": { th: "บัตรกำนัล", en: "Vouchers" },
  "nav.display": { th: "จอลูกค้า", en: "Customer Display" },
  "nav.inventory": { th: "คลังสินค้า", en: "Inventory" },
  "nav.stockCount": { th: "นับสต็อก", en: "Stock Count" },
  "nav.purchasing": { th: "จัดซื้อ (PO)", en: "Purchasing" },
  "nav.customers": { th: "ลูกค้า/สมาชิก", en: "Customers" },
  "nav.reports": { th: "รายงาน", en: "Reports" },
  "nav.settings": { th: "ตั้งค่า/ผู้ใช้", en: "Settings" },
  "nav.help": { th: "วิธีใช้", en: "User Guide" },
  "topbar.online": { th: "ออนไลน์", en: "Online" },
  "topbar.offline": { th: "ออฟไลน์", en: "Offline" },
  "topbar.printerReady": { th: "พร้อมพิมพ์", en: "Printer ready" },
  "common.logout": { th: "ออกจากระบบ", en: "Log out" },
};

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string }>({
  lang: "th",
  setLang: () => {},
  t: (k) => k,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("th");

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "th") setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("lang", l);
  };
  const t = (k: string) => DICT[k]?.[lang] ?? k;

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}

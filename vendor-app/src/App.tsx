import { useEffect, useState, type ReactNode } from "react";
import { ShoppingCart, List, BarChart3, Settings as SettingsIcon } from "lucide-react";
import Sale from "./screens/Sale";
import Menu from "./screens/Menu";
import Summary from "./screens/Summary";
import SettingsScreen from "./screens/Settings";
import { initAds, showBanner, hideBanner } from "./lib/ads";

type Tab = "sale" | "menu" | "summary" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("sale");

  useEffect(() => {
    initAds();
  }, []);

  // Keep the banner off the Sale screen so it can never cover the cart/checkout (mis-tap on payment).
  const bannerOn = tab !== "sale";
  useEffect(() => {
    if (bannerOn) showBanner();
    else hideBanner();
  }, [bannerOn]);

  return (
    // ponytail: reserve a constant 60px for the adaptive banner so it sits below the nav instead
    // of covering it. Switch to the plugin's SizeChanged event if banner height varies per device.
    <div className={`flex flex-col h-screen bg-slate-100 text-slate-900 ${bannerOn ? "pb-[60px]" : ""}`}>
      <main className="flex-1 overflow-hidden">
        {tab === "sale" && <Sale />}
        {tab === "menu" && <Menu />}
        {tab === "summary" && <Summary />}
        {tab === "settings" && <SettingsScreen />}
      </main>
      <nav className="grid grid-cols-4 border-t bg-white shadow-[0_-1px_4px_rgba(15,23,42,0.05)]">
        <TabBtn active={tab === "sale"} onClick={() => setTab("sale")} icon={<ShoppingCart size={20} />} label="ขาย" />
        <TabBtn active={tab === "menu"} onClick={() => setTab("menu")} icon={<List size={20} />} label="เมนู" />
        <TabBtn active={tab === "summary"} onClick={() => setTab("summary")} icon={<BarChart3 size={20} />} label="สรุป" />
        <TabBtn active={tab === "settings"} onClick={() => setTab("settings")} icon={<SettingsIcon size={20} />} label="ตั้งค่า" />
      </nav>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-2 text-xs transition ${active ? "text-emerald-600 font-medium" : "text-slate-400"}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

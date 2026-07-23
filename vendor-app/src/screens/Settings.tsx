import { useEffect, useState } from "react";
import { Users, Tag, ChevronRight } from "lucide-react";
import { getSetting, setSetting } from "../db";
import { isValidPromptPay } from "../lib/promptpay";
import { DEFAULT_BAHT_PER_POINT } from "../lib/points";
import Customers from "./Customers";
import Promos from "./Promos";

type Sub = "none" | "customers" | "promos";

export default function Settings() {
  const [sub, setSub] = useState<Sub>("none");
  const [shopName, setShopName] = useState("");
  const [promptPay, setPromptPay] = useState("");
  const [pointRate, setPointRate] = useState(String(DEFAULT_BAHT_PER_POINT));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSetting<string>("shopName").then((n) => setShopName(n || ""));
    getSetting<string>("promptPayId").then((p) => setPromptPay(p || ""));
    getSetting<number>("bahtPerPoint").then((r) => r && setPointRate(String(r)));
  }, []);

  if (sub === "customers") return <Customers onBack={() => setSub("none")} />;
  if (sub === "promos") return <Promos onBack={() => setSub("none")} />;

  const ppOk = promptPay.trim() === "" || isValidPromptPay(promptPay);
  const rate = parseFloat(pointRate) || 0;
  const rateOk = rate > 0;

  async function save() {
    if (!ppOk || !rateOk) return;
    await setSetting("shopName", shopName.trim());
    await setSetting("promptPayId", promptPay.trim());
    await setSetting("bahtPerPoint", rate);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 bg-white border-b sticky top-0 z-10">
        <h1 className="font-semibold text-lg">ตั้งค่า</h1>
      </div>
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y overflow-hidden">
          <NavRow icon={<Users size={18} />} label="สมาชิก & แต้มสะสม" onClick={() => setSub("customers")} />
          <NavRow icon={<Tag size={18} />} label="โปรโมชัน" onClick={() => setSub("promos")} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <label className="block text-sm text-slate-500 mb-1">ชื่อร้าน (ขึ้นหัวใบเสร็จ)</label>
          <input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="ร้านค้า"
            className="w-full border rounded-xl px-3 py-3"
          />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <label className="block text-sm text-slate-500 mb-1">พร้อมเพย์ (เบอร์มือถือ / เลขบัตรประชาชน)</label>
          <input
            value={promptPay}
            onChange={(e) => setPromptPay(e.target.value)}
            inputMode="numeric"
            placeholder="0812345678"
            className={`w-full border rounded-xl px-3 py-3 ${ppOk ? "" : "border-red-400"}`}
          />
          <p className="text-xs text-slate-400 mt-1">ใช้สร้าง QR รับเงินตอนคิดเงิน เว้นว่างถ้าไม่ใช้</p>
          {!ppOk && <p className="text-xs text-red-500 mt-1">รูปแบบไม่ถูกต้อง (เบอร์ 10 หลัก หรือเลขบัตร 13 หลัก)</p>}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <label className="block text-sm text-slate-500 mb-1">ได้ 1 แต้ม ทุกๆ กี่บาท</label>
          <input
            value={pointRate}
            onChange={(e) => setPointRate(e.target.value)}
            inputMode="decimal"
            placeholder={String(DEFAULT_BAHT_PER_POINT)}
            className={`w-full border rounded-xl px-3 py-3 ${rateOk ? "" : "border-red-400"}`}
          />
          <p className="text-xs text-slate-400 mt-1">ลูกค้าใช้คืนได้ 1 แต้ม = 1 บาท</p>
          {!rateOk && <p className="text-xs text-red-500 mt-1">ต้องมากกว่า 0</p>}
        </div>

        <button
          onClick={save}
          disabled={!ppOk || !rateOk}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold shadow-sm active:scale-[.98] transition disabled:opacity-40"
        >
          บันทึก
        </button>
        {saved && <div className="text-emerald-600 text-sm text-center">บันทึกแล้ว</div>}
        <div className="text-center text-xs text-slate-400 pt-2">PkPos · v0.1.0</div>
      </div>
    </div>
  );
}

function NavRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50">
      <span className="text-emerald-600">{icon}</span>
      <span className="flex-1 font-medium">{label}</span>
      <ChevronRight size={18} className="text-slate-300" />
    </button>
  );
}

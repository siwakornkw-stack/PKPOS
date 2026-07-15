import { useEffect, useState } from "react";
import { getSetting, setSetting } from "../db";
import { isValidPromptPay } from "../lib/promptpay";

export default function Settings() {
  const [shopName, setShopName] = useState("");
  const [promptPay, setPromptPay] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSetting<string>("shopName").then((n) => setShopName(n || ""));
    getSetting<string>("promptPayId").then((p) => setPromptPay(p || ""));
  }, []);

  const ppOk = promptPay.trim() === "" || isValidPromptPay(promptPay);

  async function save() {
    if (!ppOk) return;
    await setSetting("shopName", shopName.trim());
    await setSetting("promptPayId", promptPay.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 bg-white border-b sticky top-0">
        <h1 className="font-semibold text-lg">ตั้งค่า</h1>
      </div>
      <div className="p-4 space-y-4">
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

        <button
          onClick={save}
          disabled={!ppOk}
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

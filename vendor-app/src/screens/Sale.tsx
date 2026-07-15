import { useEffect, useMemo, useState } from "react";
import { Plus, Minus, Trash2, X, Check, Share2, ShoppingCart, Clock } from "lucide-react";
import * as QRCode from "qrcode";
import type { Item, OrderLine, Order, Hold } from "../types";
import { listItems, saveOrder, getSetting, listHolds, saveHold, deleteHold } from "../db";
import { ensureSeed } from "../seed";
import { baht } from "../lib/format";
import { cartTotal, changeDue, applyDiscount, pctToBaht } from "../lib/totals";
import { promptPayPayload } from "../lib/promptpay";
import { shareReceipt } from "../lib/receipt";

export default function Sale() {
  const [items, setItems] = useState<Item[]>([]);
  const [cat, setCat] = useState("ทั้งหมด");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [holdsOpen, setHoldsOpen] = useState(false);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [done, setDone] = useState<Order | null>(null);
  const [shopName, setShopName] = useState("ร้านค้า");
  const [promptPayId, setPromptPayId] = useState("");

  function refreshHolds() {
    listHolds().then((h) => setHolds(h.sort((a, b) => b.ts - a.ts)));
  }
  useEffect(() => {
    ensureSeed().then(listItems).then(setItems);
    getSetting<string>("shopName").then((n) => n && setShopName(n));
    getSetting<string>("promptPayId").then((p) => setPromptPayId(p || ""));
    refreshHolds();
  }, []);

  const cats = useMemo(() => ["ทั้งหมด", ...Array.from(new Set(items.map((i) => i.category)))], [items]);
  const shown = items.filter((i) => i.active && (cat === "ทั้งหมด" || i.category === cat));
  const subtotal = cartTotal(lines);
  const total = applyDiscount(subtotal, discount);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  function add(it: Item) {
    setLines((prev) => {
      const f = prev.find((l) => l.itemId === it.id);
      if (f) return prev.map((l) => (l.itemId === it.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { itemId: it.id, name: it.name, price: it.price, qty: 1 }];
    });
  }
  function bump(id: string, d: number) {
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.itemId !== id) return [l];
        const q = l.qty + d;
        return q <= 0 ? [] : [{ ...l, qty: q }];
      })
    );
  }

  // Off-menu / open-price line: unique itemId so each add is its own cart line (never merged).
  function addCustom(name: string, price: number) {
    setLines((prev) => [...prev, { itemId: crypto.randomUUID(), name: name || "รายการอื่น", price, qty: 1 }]);
    setCustomOpen(false);
  }

  function resetCart() {
    setLines([]);
    setDiscount(0);
  }

  // Park the current cart so another customer can be served, then recall it later.
  function park() {
    if (lines.length === 0) return;
    saveHold({ id: crypto.randomUUID(), ts: Date.now(), lines, discount }).then(refreshHolds);
    resetCart();
    setCartOpen(false);
  }
  function recall(h: Hold) {
    setLines(h.lines);
    setDiscount(h.discount);
    deleteHold(h.id).then(refreshHolds);
    setHoldsOpen(false);
  }

  async function confirmPay(received: number, method: "cash" | "qr") {
    const order: Order = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      lines,
      subtotal,
      discount,
      total,
      method,
      received,
      change: changeDue(received, total),
    };
    await saveOrder(order);
    resetCart();
    setPayOpen(false);
    setCartOpen(false);
    setDone(order);
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 p-2 bg-white border-b">
          <div className="flex gap-2 overflow-x-auto flex-1">
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
                  cat === c ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 text-slate-600"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          {holds.length > 0 && (
            <button
              onClick={() => setHoldsOpen(true)}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-sm font-medium"
            >
              <Clock size={14} /> พัก {holds.length}
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2.5 content-start">
          {shown.map((it) => (
            <button
              key={it.id}
              onClick={() => add(it)}
              className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3 text-left active:scale-95 transition"
            >
              <div className="font-medium leading-tight text-slate-800">{it.name}</div>
              <div className="text-emerald-600 font-semibold mt-1">{baht(it.price)}</div>
            </button>
          ))}
          {shown.length === 0 && <div className="col-span-full text-center text-slate-400 py-10">ยังไม่มีเมนู</div>}
        </div>

        {/* Mobile cart bar: menu is full-width on phones, so the cart lives here instead of a fixed sidebar. */}
        {lines.length > 0 && (
          <div className="sm:hidden flex items-center gap-2 p-2 bg-white border-t">
            <button
              onClick={() => setCartOpen(true)}
              className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700"
            >
              <ShoppingCart size={18} className="text-emerald-600" />
              <span className="text-sm font-medium">{count} รายการ</span>
              <span className="ml-auto font-semibold">{baht(total)}</span>
            </button>
            <button
              onClick={() => setPayOpen(true)}
              className="px-5 py-3 rounded-xl bg-emerald-600 text-white font-semibold shadow-sm active:scale-95 transition"
            >
              คิดเงิน
            </button>
          </div>
        )}
      </div>

      {/* Desktop / tablet cart sidebar */}
      <div className="hidden sm:flex w-64 flex-col bg-white border-l">
        <div className="flex items-center justify-between p-3 border-b">
          <span className="font-semibold">ตะกร้า</span>
          <button onClick={() => setCustomOpen(true)} className="flex items-center gap-1 text-emerald-600 text-sm">
            <Plus size={14} /> รายการอื่น
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <CartList lines={lines} bump={bump} />
        </div>
        <CartFooter
          subtotal={subtotal}
          discount={discount}
          total={total}
          disabled={lines.length === 0}
          onDiscount={() => setDiscountOpen(true)}
          onPark={park}
          onPay={() => setPayOpen(true)}
        />
      </div>

      {/* Mobile cart sheet: review / edit quantities before checkout */}
      {cartOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-10 sm:hidden" onClick={() => setCartOpen(false)}>
          <div className="bg-white w-full rounded-t-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-semibold text-lg">ตะกร้า</span>
              <div className="flex items-center gap-4">
                <button onClick={() => setCustomOpen(true)} className="flex items-center gap-1 text-emerald-600 text-sm">
                  <Plus size={14} /> รายการอื่น
                </button>
                <button onClick={() => setCartOpen(false)}>
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CartList lines={lines} bump={bump} />
            </div>
            <CartFooter
              subtotal={subtotal}
              discount={discount}
              total={total}
              disabled={lines.length === 0}
              onDiscount={() => setDiscountOpen(true)}
              onPark={park}
              onPay={() => {
                setCartOpen(false);
                setPayOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {discountOpen && (
        <DiscountModal
          subtotal={subtotal}
          current={discount}
          onClose={() => setDiscountOpen(false)}
          onApply={(d) => {
            setDiscount(d);
            setDiscountOpen(false);
          }}
        />
      )}
      {holdsOpen && (
        <HoldsModal
          holds={holds}
          onClose={() => setHoldsOpen(false)}
          onRecall={recall}
          onDelete={(id) => deleteHold(id).then(refreshHolds)}
        />
      )}
      {customOpen && <CustomModal onClose={() => setCustomOpen(false)} onAdd={addCustom} />}
      {payOpen && (
        <PayModal
          subtotal={subtotal}
          discount={discount}
          total={total}
          promptPayId={promptPayId}
          onClose={() => setPayOpen(false)}
          onConfirm={confirmPay}
        />
      )}
      {done && <DoneModal order={done} shopName={shopName} onClose={() => setDone(null)} />}
    </div>
  );
}

// Shared cart line list — used by both the desktop sidebar and the mobile sheet.
function CartList({ lines, bump }: { lines: OrderLine[]; bump: (id: string, d: number) => void }) {
  if (lines.length === 0) return <div className="text-slate-400 text-center py-10 text-sm">แตะเมนูเพื่อเพิ่ม</div>;
  return (
    <>
      {lines.map((l) => (
        <div key={l.itemId} className="px-3 py-2 border-b">
          <div className="flex justify-between text-sm">
            <span className="truncate">{l.name}</span>
            <span>{baht(l.price * l.qty)}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => bump(l.itemId, -1)} className="p-1.5 rounded-lg bg-slate-100">
              <Minus size={14} />
            </button>
            <span className="w-6 text-center text-sm">{l.qty}</span>
            <button onClick={() => bump(l.itemId, 1)} className="p-1.5 rounded-lg bg-slate-100">
              <Plus size={14} />
            </button>
            <button onClick={() => bump(l.itemId, -l.qty)} className="p-1.5 rounded-lg bg-red-50 text-red-500 ml-auto">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

// Shared cart footer: discount breakdown, discount/park actions, and the checkout button.
function CartFooter({
  subtotal,
  discount,
  total,
  disabled,
  onDiscount,
  onPark,
  onPay,
}: {
  subtotal: number;
  discount: number;
  total: number;
  disabled: boolean;
  onDiscount: () => void;
  onPark: () => void;
  onPay: () => void;
}) {
  return (
    <div className="p-3 border-t space-y-2">
      {discount > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm text-slate-500">
            <span>ยอดรวม</span>
            <span>{baht(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-rose-500">
            <span>ส่วนลด</span>
            <span>-{baht(discount)}</span>
          </div>
        </div>
      )}
      <div className="flex justify-between font-semibold text-lg">
        <span>รวม</span>
        <span>{baht(total)}</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onDiscount}
          disabled={disabled}
          className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium disabled:opacity-40"
        >
          ส่วนลด
        </button>
        <button
          onClick={onPark}
          disabled={disabled}
          className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium disabled:opacity-40"
        >
          พักบิล
        </button>
      </div>
      <button
        disabled={disabled}
        onClick={onPay}
        className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40 shadow-sm active:scale-[.98] transition"
      >
        คิดเงิน
      </button>
    </div>
  );
}

function DiscountModal({
  subtotal,
  current,
  onClose,
  onApply,
}: {
  subtotal: number;
  current: number;
  onClose: () => void;
  onApply: (discount: number) => void;
}) {
  const [mode, setMode] = useState<"baht" | "pct">("baht");
  const [val, setVal] = useState(current > 0 ? String(current) : "");
  const num = parseFloat(val) || 0;
  const raw = mode === "baht" ? num : pctToBaht(subtotal, num);
  const disc = Math.min(raw, subtotal);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-20" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-lg">ส่วนลด</h2>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setMode("baht")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${mode === "baht" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            บาท
          </button>
          <button
            onClick={() => setMode("pct")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${mode === "pct" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            %
          </button>
        </div>
        <input
          autoFocus
          inputMode="decimal"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="0"
          className="w-full border rounded-xl px-3 py-3 text-2xl text-right mb-3"
        />
        <div className="flex justify-between text-sm text-slate-500 mb-4">
          <span>ส่วนลด {baht(disc)}</span>
          <span>เหลือ {baht(subtotal - disc)}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onApply(0)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold">
            ล้าง
          </button>
          <button onClick={() => onApply(disc)} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold">
            ใช้
          </button>
        </div>
      </div>
    </div>
  );
}

function HoldsModal({
  holds,
  onClose,
  onRecall,
  onDelete,
}: {
  holds: Hold[];
  onClose: () => void;
  onRecall: (h: Hold) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-20" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="font-semibold text-lg">บิลที่พักไว้</h2>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y">
          {holds.map((h) => {
            const t = applyDiscount(cartTotal(h.lines), h.discount);
            const qty = h.lines.reduce((s, l) => s + l.qty, 0);
            return (
              <div key={h.id} className="flex items-center">
                <button onClick={() => onRecall(h)} className="flex-1 flex items-center justify-between px-4 py-3 text-left active:bg-slate-50">
                  <div className="text-sm text-slate-500">
                    {new Date(h.ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                    <span className="text-slate-400"> · {qty} ชิ้น</span>
                  </div>
                  <span className="font-medium">{baht(t)}</span>
                </button>
                <button onClick={() => onDelete(h.id)} className="p-3 text-red-500">
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
          {holds.length === 0 && <div className="text-center text-slate-400 py-10">ไม่มีบิลที่พัก</div>}
        </div>
      </div>
    </div>
  );
}

function DoneModal({ order, shopName, onClose }: { order: Order; shopName: string; onClose: () => void }) {
  const isQr = order.method === "qr";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-20" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
          <Check className="text-emerald-600" size={36} />
        </div>
        <div className="text-lg font-semibold mt-3">รับเงินแล้ว</div>
        {isQr ? (
          <>
            <div className="text-3xl font-bold text-emerald-600 my-2">{baht(order.total)}</div>
            <div className="text-sm text-slate-500 mb-4">ชำระผ่าน QR พร้อมเพย์</div>
          </>
        ) : (
          <>
            <div className="text-3xl font-bold text-emerald-600 my-2">ทอน {baht(order.change)}</div>
            <div className="text-sm text-slate-500 mb-4">
              รับมา {baht(order.received)} · รวม {baht(order.total)}
            </div>
          </>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => shareReceipt(order, shopName)}
            className="flex-1 py-3 rounded-xl border border-emerald-600 text-emerald-600 font-semibold flex items-center justify-center gap-1"
          >
            <Share2 size={18} /> แชร์ใบเสร็จ
          </button>
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold">
            รายการใหม่
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomModal({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, price: number) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const p = parseFloat(price) || 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-20" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-lg">รายการนอกเมนู</h2>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <label className="block text-sm text-slate-500 mb-1">ชื่อ (ไม่ใส่ก็ได้)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="รายการอื่น"
          className="w-full border rounded-xl px-3 py-2 mb-3"
        />
        <label className="block text-sm text-slate-500 mb-1">ราคา</label>
        <input
          autoFocus
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0"
          className="w-full border rounded-xl px-3 py-3 text-2xl text-right mb-4"
        />
        <button
          disabled={p <= 0}
          onClick={() => onAdd(name.trim(), p)}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40"
        >
          เพิ่มลงตะกร้า
        </button>
      </div>
    </div>
  );
}

function PayModal({
  subtotal,
  discount,
  total,
  promptPayId,
  onClose,
  onConfirm,
}: {
  subtotal: number;
  discount: number;
  total: number;
  promptPayId: string;
  onClose: () => void;
  onConfirm: (received: number, method: "cash" | "qr") => void;
}) {
  const [tab, setTab] = useState<"cash" | "qr">("cash");
  const [recv, setRecv] = useState("");
  const [qr, setQr] = useState("");
  const received = parseFloat(recv) || 0;
  const change = changeDue(received, total);
  const ok = received >= total;
  const quick = Array.from(new Set([total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500])).filter(
    (q) => q >= total
  );

  useEffect(() => {
    if (tab === "qr" && promptPayId) {
      QRCode.toDataURL(promptPayPayload(promptPayId, total), { width: 224, margin: 1 })
        .then(setQr)
        .catch(() => setQr(""));
    }
  }, [tab, promptPayId, total]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-20" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-lg">คิดเงิน</h2>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm text-slate-500 mb-1">
            <span>ยอดรวม {baht(subtotal)}</span>
            <span>ส่วนลด -{baht(discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg mb-3">
          <span>ยอดสุทธิ</span>
          <span className="font-bold text-emerald-600">{baht(total)}</span>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab("cash")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === "cash" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            เงินสด
          </button>
          <button
            onClick={() => setTab("qr")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === "qr" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            QR พร้อมเพย์
          </button>
        </div>

        {tab === "cash" ? (
          <>
            <label className="block text-sm text-slate-500 mb-1">รับเงินมา</label>
            <input
              autoFocus
              inputMode="decimal"
              value={recv}
              onChange={(e) => setRecv(e.target.value)}
              placeholder="0"
              className="w-full border rounded-xl px-3 py-3 text-2xl text-right mb-2"
            />
            <div className="flex gap-2 mb-3">
              {quick.map((q) => (
                <button key={q} onClick={() => setRecv(String(q))} className="flex-1 py-2 rounded-lg bg-slate-100 text-sm">
                  {baht(q)}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-lg mb-4">
              <span>เงินทอน</span>
              <span className={`font-bold ${ok ? "text-slate-900" : "text-slate-300"}`}>{baht(change)}</span>
            </div>
            <button
              disabled={!ok}
              onClick={() => onConfirm(received, "cash")}
              className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40"
            >
              ยืนยัน
            </button>
          </>
        ) : promptPayId ? (
          <div className="flex flex-col items-center">
            {qr ? (
              <img src={qr} alt="PromptPay QR" className="w-56 h-56" />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center text-slate-400 text-sm">กำลังสร้าง QR...</div>
            )}
            <div className="text-sm text-slate-500 mt-2 mb-4">สแกนเพื่อจ่าย {baht(total)}</div>
            <button onClick={() => onConfirm(total, "qr")} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold">
              ยืนยันรับเงินแล้ว
            </button>
          </div>
        ) : (
          <div className="text-center text-slate-500 py-8 text-sm">
            ยังไม่ได้ตั้งค่าพร้อมเพย์
            <br />
            ไปที่ "ตั้งค่า" เพื่อใส่เบอร์ / เลขบัตร
          </div>
        )}
      </div>
    </div>
  );
}

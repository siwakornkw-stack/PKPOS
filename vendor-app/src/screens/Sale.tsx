import { useEffect, useMemo, useState } from "react";
import { Plus, Minus, Trash2, X, Check, Share2, ShoppingCart, Clock, User, Tag, Search } from "lucide-react";
import * as QRCode from "qrcode";
import type { Item, OrderLine, Order, Hold, Customer, Promo, OptionGroup, OptionChoice } from "../types";
import {
  listItems,
  putItem,
  saveOrder,
  getSetting,
  listHolds,
  saveHold,
  deleteHold,
  listCustomers,
  putCustomer,
  listPromos,
  openShift,
} from "../db";
import { ensureSeed } from "../seed";
import { baht } from "../lib/format";
import { cartTotal, changeDue, applyDiscount, pctToBaht, round2 } from "../lib/totals";
import { promptPayPayload } from "../lib/promptpay";
import { shareReceipt } from "../lib/receipt";
import { unitPrice, optionsValid, lineSig, lineKey, optionsLabel } from "../lib/options";
import { remaining, cartQty, applyStock } from "../lib/stock";
import { promoDiscount, eligiblePromos } from "../lib/promo";
import { earnPoints, redeemValue, tierFor, DEFAULT_BAHT_PER_POINT } from "../lib/points";

export default function Sale() {
  const [items, setItems] = useState<Item[]>([]);
  const [cat, setCat] = useState("ทั้งหมด");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [discount, setDiscount] = useState(0); // manual baht off, mutually exclusive with `promo`
  const [promo, setPromo] = useState<Promo | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pointsUsed, setPointsUsed] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [holdsOpen, setHoldsOpen] = useState(false);
  const [picking, setPicking] = useState<Item | null>(null);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [done, setDone] = useState<{ order: Order; earned: number } | null>(null);
  const [shopName, setShopName] = useState("ร้านค้า");
  const [promptPayId, setPromptPayId] = useState("");
  const [bahtPerPoint, setBahtPerPoint] = useState(DEFAULT_BAHT_PER_POINT);

  function refreshHolds() {
    listHolds().then((h) => setHolds(h.sort((a, b) => b.ts - a.ts)));
  }
  function refreshItems() {
    listItems().then(setItems);
  }
  useEffect(() => {
    ensureSeed().then(listItems).then(setItems);
    getSetting<string>("shopName").then((n) => n && setShopName(n));
    getSetting<string>("promptPayId").then((p) => setPromptPayId(p || ""));
    getSetting<number>("bahtPerPoint").then((r) => r && setBahtPerPoint(r));
    listPromos().then(setPromos);
    refreshHolds();
  }, []);

  const cats = useMemo(() => ["ทั้งหมด", ...Array.from(new Set(items.map((i) => i.category)))], [items]);
  const shown = items.filter((i) => i.active && (cat === "ทั้งหมด" || i.category === cat));

  const subtotal = cartTotal(lines);
  // A promo replaces the manual discount rather than stacking with it, so the bill only ever
  // has one "ส่วนลด" source. Points are separate: they are the customer's own money.
  const billDiscount = promo ? promoDiscount(promo, subtotal) : Math.min(discount, subtotal);
  const pointsDiscount = redeemValue(pointsUsed, customer?.points ?? 0, subtotal - billDiscount);
  const total = applyDiscount(subtotal, billDiscount + pointsDiscount);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const tier = tierFor(customer?.spent ?? 0);
  const willEarn = customer ? Math.floor(earnPoints(total, bahtPerPoint) * tier.multiplier) : 0;

  // A promo that no longer clears its minimum spend (the cart shrank) must not keep discounting.
  useEffect(() => {
    if (promo && promoDiscount(promo, subtotal) === 0) setPromo(null);
  }, [promo, subtotal]);

  function addLine(it: Item, chosen: OptionChoice[]) {
    const price = unitPrice(it.price, chosen);
    const id = lineSig(
      it.id,
      chosen.map((c) => c.id)
    );
    setLines((prev) => {
      const f = prev.find((l) => lineKey(l) === id);
      if (f) return prev.map((l) => (lineKey(l) === id ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...prev,
        {
          lineId: id,
          itemId: it.id,
          name: it.name,
          price,
          qty: 1,
          category: it.category,
          opts: chosen.map((c) => ({ name: c.name, price: c.price })),
        },
      ];
    });
  }

  function tap(it: Item) {
    if (remaining(it, cartQty(lines, it.id)) <= 0) return;
    if (it.options?.length) setPicking(it);
    else addLine(it, []);
  }

  function bump(key: string, d: number) {
    setLines((prev) =>
      prev.flatMap((l) => {
        if (lineKey(l) !== key) return [l];
        const q = l.qty + d;
        if (q <= 0) return [];
        // Never let + push a tracked item past what is on the shelf.
        const item = items.find((i) => i.id === l.itemId);
        if (d > 0 && item && remaining(item, cartQty(prev, l.itemId)) <= 0) return [l];
        return [{ ...l, qty: q }];
      })
    );
  }

  // Off-menu / open-price line: unique lineId so each add is its own cart line (never merged).
  function addCustom(name: string, price: number) {
    const id = crypto.randomUUID();
    setLines((prev) => [...prev, { lineId: id, itemId: id, name: name || "รายการอื่น", price, qty: 1 }]);
    setCustomOpen(false);
  }

  function resetCart() {
    setLines([]);
    setDiscount(0);
    setPromo(null);
    setCustomer(null);
    setPointsUsed(0);
  }

  // Park the current cart so another customer can be served, then recall it later.
  // Only the manual discount travels with a hold; promo/member are re-picked on recall.
  function park() {
    if (lines.length === 0) return;
    saveHold({ id: crypto.randomUUID(), ts: Date.now(), lines, discount: billDiscount }).then(refreshHolds);
    resetCart();
    setCartOpen(false);
  }
  function recall(h: Hold) {
    setLines(h.lines);
    setDiscount(h.discount);
    setPromo(null);
    deleteHold(h.id).then(refreshHolds);
    setHoldsOpen(false);
  }

  async function confirmPay(received: number, method: "cash" | "qr") {
    const shift = await openShift();
    const order: Order = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      lines,
      subtotal,
      discount: round2(billDiscount + pointsDiscount),
      total,
      method,
      received,
      change: changeDue(received, total),
      customerId: customer?.id,
      pointsUsed: pointsDiscount || undefined,
      pointsEarned: willEarn || undefined,
      promoId: promo?.id,
      shiftId: shift?.id,
    };
    await saveOrder(order);

    for (const changed of applyStock(items, lines)) await putItem(changed);
    if (customer) {
      await putCustomer({
        ...customer,
        points: round2(customer.points - pointsDiscount + willEarn),
        spent: round2(customer.spent + total),
      });
    }

    const earned = willEarn;
    resetCart();
    refreshItems();
    setPayOpen(false);
    setCartOpen(false);
    setDone({ order, earned });
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
          {shown.map((it) => {
            const left = remaining(it, cartQty(lines, it.id));
            const out = left <= 0;
            return (
              <button
                key={it.id}
                onClick={() => tap(it)}
                disabled={out}
                className={`relative rounded-2xl bg-white border border-slate-100 shadow-sm p-3 text-left transition ${
                  out ? "opacity-50" : "active:scale-95"
                }`}
              >
                <div className="font-medium leading-tight text-slate-800">{it.name}</div>
                <div className="text-emerald-600 font-semibold mt-1">{baht(it.price)}</div>
                {it.options?.length ? <div className="text-xs text-slate-400 mt-0.5">มีตัวเลือก</div> : null}
                {it.stock !== undefined && (
                  <div className={`absolute top-2 right-2 text-xs font-medium ${out ? "text-red-500" : "text-slate-400"}`}>
                    {out ? "หมด" : `เหลือ ${left}`}
                  </div>
                )}
              </button>
            );
          })}
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
      <div className="hidden sm:flex w-72 flex-col bg-white border-l">
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
          billDiscount={billDiscount}
          pointsDiscount={pointsDiscount}
          promo={promo}
          customer={customer}
          total={total}
          disabled={lines.length === 0}
          onDiscount={() => setDiscountOpen(true)}
          onMember={() => setMemberOpen(true)}
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
              billDiscount={billDiscount}
              pointsDiscount={pointsDiscount}
              promo={promo}
              customer={customer}
              total={total}
              disabled={lines.length === 0}
              onDiscount={() => setDiscountOpen(true)}
              onMember={() => setMemberOpen(true)}
              onPark={park}
              onPay={() => {
                setCartOpen(false);
                setPayOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {picking && (
        <OptionsSheet
          item={picking}
          onClose={() => setPicking(null)}
          onAdd={(chosen) => {
            addLine(picking, chosen);
            setPicking(null);
          }}
        />
      )}
      {discountOpen && (
        <DiscountModal
          subtotal={subtotal}
          current={discount}
          promo={promo}
          promos={promos}
          onClose={() => setDiscountOpen(false)}
          onApply={(d, p) => {
            setDiscount(d);
            setPromo(p);
            setDiscountOpen(false);
          }}
        />
      )}
      {memberOpen && (
        <MemberSheet
          customer={customer}
          pointsUsed={pointsUsed}
          maxRedeem={subtotal - billDiscount}
          bahtPerPoint={bahtPerPoint}
          onClose={() => setMemberOpen(false)}
          onPick={(c, pts) => {
            setCustomer(c);
            setPointsUsed(pts);
            setMemberOpen(false);
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
          billDiscount={billDiscount}
          pointsDiscount={pointsDiscount}
          total={total}
          willEarn={willEarn}
          promptPayId={promptPayId}
          onClose={() => setPayOpen(false)}
          onConfirm={confirmPay}
        />
      )}
      {done && <DoneModal order={done.order} earned={done.earned} shopName={shopName} onClose={() => setDone(null)} />}
    </div>
  );
}

// Shared cart line list — used by both the desktop sidebar and the mobile sheet.
function CartList({ lines, bump }: { lines: OrderLine[]; bump: (key: string, d: number) => void }) {
  if (lines.length === 0) return <div className="text-slate-400 text-center py-10 text-sm">แตะเมนูเพื่อเพิ่ม</div>;
  return (
    <>
      {lines.map((l) => {
        const key = lineKey(l);
        const opts = optionsLabel(l);
        return (
          <div key={key} className="px-3 py-2 border-b">
            <div className="flex justify-between text-sm">
              <span className="truncate">{l.name}</span>
              <span>{baht(l.price * l.qty)}</span>
            </div>
            {opts && <div className="text-xs text-slate-400 truncate">{opts}</div>}
            <div className="flex items-center gap-2 mt-1">
              <button onClick={() => bump(key, -1)} className="p-1.5 rounded-lg bg-slate-100">
                <Minus size={14} />
              </button>
              <span className="w-6 text-center text-sm">{l.qty}</span>
              <button onClick={() => bump(key, 1)} className="p-1.5 rounded-lg bg-slate-100">
                <Plus size={14} />
              </button>
              <button onClick={() => bump(key, -l.qty)} className="p-1.5 rounded-lg bg-red-50 text-red-500 ml-auto">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

// Shared cart footer: discount breakdown, member/discount/park actions, and the checkout button.
function CartFooter({
  subtotal,
  billDiscount,
  pointsDiscount,
  promo,
  customer,
  total,
  disabled,
  onDiscount,
  onMember,
  onPark,
  onPay,
}: {
  subtotal: number;
  billDiscount: number;
  pointsDiscount: number;
  promo: Promo | null;
  customer: Customer | null;
  total: number;
  disabled: boolean;
  onDiscount: () => void;
  onMember: () => void;
  onPark: () => void;
  onPay: () => void;
}) {
  const anyDiscount = billDiscount > 0 || pointsDiscount > 0;
  return (
    <div className="p-3 border-t space-y-2">
      {customer && (
        <div className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1.5">
          <User size={14} />
          <span className="truncate">{customer.name}</span>
          <span className="ml-auto shrink-0">{customer.points} แต้ม</span>
        </div>
      )}
      {anyDiscount && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm text-slate-500">
            <span>ยอดรวม</span>
            <span>{baht(subtotal)}</span>
          </div>
          {billDiscount > 0 && (
            <div className="flex justify-between text-sm text-rose-500">
              <span className="truncate">{promo ? promo.name : "ส่วนลด"}</span>
              <span className="shrink-0">-{baht(billDiscount)}</span>
            </div>
          )}
          {pointsDiscount > 0 && (
            <div className="flex justify-between text-sm text-rose-500">
              <span>ใช้แต้ม</span>
              <span>-{baht(pointsDiscount)}</span>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-between font-semibold text-lg">
        <span>รวม</span>
        <span>{baht(total)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={onMember}
          disabled={disabled}
          className="py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium disabled:opacity-40"
        >
          สมาชิก
        </button>
        <button
          onClick={onDiscount}
          disabled={disabled}
          className="py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium disabled:opacity-40"
        >
          ส่วนลด
        </button>
        <button
          onClick={onPark}
          disabled={disabled}
          className="py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium disabled:opacity-40"
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

function OptionsSheet({ item, onClose, onAdd }: { item: Item; onClose: () => void; onAdd: (c: OptionChoice[]) => void }) {
  const groups = item.options ?? [];
  const [picked, setPicked] = useState<string[]>([]);
  const chosen = groups.flatMap((g) => g.choices.filter((c) => picked.includes(c.id)));
  const ok = optionsValid(groups, picked);
  const price = unitPrice(item.price, chosen);

  function toggle(g: OptionGroup, c: OptionChoice) {
    setPicked((prev) => {
      if (g.multi) return prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id];
      // Single-choice group: swap out whatever else in this group was picked.
      const others = prev.filter((x) => !g.choices.some((ch) => ch.id === x));
      return prev.includes(c.id) ? others : [...others, c.id];
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-20" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <h2 className="font-semibold text-lg">{item.name}</h2>
            <div className="text-sm text-slate-500">{baht(item.price)}</div>
          </div>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.id} className="border-b">
              <div className="px-4 pt-3 pb-1 text-sm font-medium text-slate-600">
                {g.name}
                {g.required && <span className="text-rose-500 ml-1">*</span>}
                <span className="text-slate-400 font-normal ml-1">{g.multi ? "เลือกได้หลายอย่าง" : "เลือก 1"}</span>
              </div>
              {g.choices.map((c) => {
                const on = picked.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(g, c)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
                  >
                    <div
                      className={`w-5 h-5 shrink-0 flex items-center justify-center border-2 ${
                        g.multi ? "rounded-md" : "rounded-full"
                      } ${on ? "bg-emerald-600 border-emerald-600" : "border-slate-300"}`}
                    >
                      {on && <Check size={14} className="text-white" />}
                    </div>
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.price !== 0 && (
                      <span className="text-sm text-slate-500 shrink-0">
                        {c.price > 0 ? "+" : ""}
                        {baht(c.price)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="p-4 border-t">
          <button
            disabled={!ok}
            onClick={() => onAdd(chosen)}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40"
          >
            เพิ่มลงตะกร้า · {baht(price)}
          </button>
          {!ok && <div className="text-xs text-rose-500 text-center mt-2">เลือกรายการที่มี * ให้ครบ</div>}
        </div>
      </div>
    </div>
  );
}

function DiscountModal({
  subtotal,
  current,
  promo,
  promos,
  onClose,
  onApply,
}: {
  subtotal: number;
  current: number;
  promo: Promo | null;
  promos: Promo[];
  onClose: () => void;
  onApply: (discount: number, promo: Promo | null) => void;
}) {
  const [tab, setTab] = useState<"manual" | "promo">(promo ? "promo" : "manual");
  const [mode, setMode] = useState<"baht" | "pct">("baht");
  const [val, setVal] = useState(current > 0 ? String(current) : "");
  const num = parseFloat(val) || 0;
  const raw = mode === "baht" ? num : pctToBaht(subtotal, num);
  const disc = Math.min(raw, subtotal);
  const usable = eligiblePromos(promos, subtotal);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-20" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-lg">ส่วนลด</h2>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setTab("manual")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === "manual" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            กรอกเอง
          </button>
          <button
            onClick={() => setTab("promo")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${tab === "promo" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            โปรโมชัน {usable.length > 0 && `(${usable.length})`}
          </button>
        </div>

        {tab === "manual" ? (
          <>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setMode("baht")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${mode === "baht" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                บาท
              </button>
              <button
                onClick={() => setMode("pct")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${mode === "pct" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
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
              <button onClick={() => onApply(0, null)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold">
                ล้าง
              </button>
              <button onClick={() => onApply(disc, null)} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold">
                ใช้
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="divide-y border rounded-xl overflow-hidden mb-3">
              {usable.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onApply(0, p)}
                  className={`w-full flex items-center gap-2 px-3 py-3 text-left active:bg-slate-50 ${
                    promo?.id === p.id ? "bg-emerald-50" : ""
                  }`}
                >
                  <Tag size={16} className="text-emerald-600 shrink-0" />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-rose-500 font-medium shrink-0">-{baht(promoDiscount(p, subtotal))}</span>
                </button>
              ))}
              {usable.length === 0 && (
                <div className="text-center text-slate-400 py-8 text-sm">
                  ไม่มีโปรที่ใช้ได้กับยอดนี้
                  <br />
                  เพิ่มโปรได้ที่ "ตั้งค่า &gt; โปรโมชัน"
                </div>
              )}
            </div>
            <button onClick={() => onApply(0, null)} className="w-full py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold">
              ไม่ใช้โปร
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function MemberSheet({
  customer,
  pointsUsed,
  maxRedeem,
  bahtPerPoint,
  onClose,
  onPick,
}: {
  customer: Customer | null;
  pointsUsed: number;
  maxRedeem: number;
  bahtPerPoint: number;
  onClose: () => void;
  onPick: (c: Customer | null, points: number) => void;
}) {
  const [all, setAll] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Customer | null>(customer);
  const [pts, setPts] = useState(pointsUsed ? String(pointsUsed) : "");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    listCustomers().then(setAll);
  }, []);

  const found = all
    .filter((c) => c.name.includes(q) || c.phone.includes(q))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 20);
  const redeem = sel ? redeemValue(parseInt(pts) || 0, sel.points, maxRedeem) : 0;

  async function create() {
    if (!name.trim()) return;
    const c: Customer = {
      id: crypto.randomUUID(),
      name: name.trim(),
      phone: phone.trim(),
      points: 0,
      spent: 0,
      ts: Date.now(),
    };
    await putCustomer(c);
    onPick(c, 0);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-20" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="font-semibold text-lg">สมาชิก</h2>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {adding ? (
          <div className="p-4">
            <label className="block text-sm text-slate-500 mb-1">ชื่อ</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-xl px-3 py-2 mb-3" />
            <label className="block text-sm text-slate-500 mb-1">เบอร์โทร</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className="w-full border rounded-xl px-3 py-2 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setAdding(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold">
                ยกเลิก
              </button>
              <button
                disabled={!name.trim()}
                onClick={create}
                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40"
              >
                เพิ่ม
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3 border-b flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-slate-100 rounded-xl px-3">
                <Search size={16} className="text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ค้นชื่อ / เบอร์"
                  className="flex-1 bg-transparent py-2.5 outline-none text-sm"
                />
              </div>
              <button onClick={() => setAdding(true)} className="px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-sm">
                เพิ่ม
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y">
              {found.map((c) => {
                const t = tierFor(c.spent);
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSel(c);
                      setPts("");
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 ${
                      sel?.id === c.id ? "bg-emerald-50" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-slate-500">
                        {c.phone || "ไม่มีเบอร์"} · {t.name}
                      </div>
                    </div>
                    <div className="text-sm text-emerald-600 font-medium shrink-0">{c.points} แต้ม</div>
                  </button>
                );
              })}
              {found.length === 0 && <div className="text-center text-slate-400 py-10 text-sm">ไม่พบสมาชิก</div>}
            </div>

            {sel && (
              <div className="p-4 border-t space-y-3">
                <div className="text-sm text-slate-600">
                  {sel.name} มี <span className="font-semibold text-emerald-600">{sel.points}</span> แต้ม (1 แต้ม = 1 บาท,
                  ได้ 1 แต้มทุก {bahtPerPoint} บาท)
                </div>
                <div className="flex items-center gap-2">
                  <input
                    inputMode="numeric"
                    value={pts}
                    onChange={(e) => setPts(e.target.value)}
                    placeholder="ใช้แต้ม 0"
                    className="flex-1 border rounded-xl px-3 py-2.5 text-right"
                  />
                  <button
                    onClick={() => setPts(String(Math.floor(Math.min(sel.points, maxRedeem))))}
                    className="px-3 py-2.5 rounded-xl bg-slate-100 text-sm"
                  >
                    ใช้เต็ม
                  </button>
                </div>
                {redeem > 0 && <div className="text-sm text-rose-500">ลด {baht(redeem)}</div>}
                <div className="flex gap-2">
                  <button onClick={() => onPick(null, 0)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold">
                    ไม่ใช้สมาชิก
                  </button>
                  <button
                    onClick={() => onPick(sel, parseInt(pts) || 0)}
                    className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold"
                  >
                    ใช้
                  </button>
                </div>
              </div>
            )}
          </>
        )}
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

function DoneModal({
  order,
  earned,
  shopName,
  onClose,
}: {
  order: Order;
  earned: number;
  shopName: string;
  onClose: () => void;
}) {
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
            <div className="text-sm text-slate-500 mb-2">ชำระผ่าน QR พร้อมเพย์</div>
          </>
        ) : (
          <>
            <div className="text-3xl font-bold text-emerald-600 my-2">ทอน {baht(order.change)}</div>
            <div className="text-sm text-slate-500 mb-2">
              รับมา {baht(order.received)} · รวม {baht(order.total)}
            </div>
          </>
        )}
        {earned > 0 && <div className="text-sm text-emerald-600 mb-2">ลูกค้าได้ {earned} แต้ม</div>}
        <div className="flex gap-2 mt-2">
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
  billDiscount,
  pointsDiscount,
  total,
  willEarn,
  promptPayId,
  onClose,
  onConfirm,
}: {
  subtotal: number;
  billDiscount: number;
  pointsDiscount: number;
  total: number;
  willEarn: number;
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
        {(billDiscount > 0 || pointsDiscount > 0) && (
          <div className="flex justify-between text-sm text-slate-500 mb-1">
            <span>ยอดรวม {baht(subtotal)}</span>
            <span>ส่วนลด -{baht(billDiscount + pointsDiscount)}</span>
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
            <div className="flex justify-between text-lg mb-1">
              <span>เงินทอน</span>
              <span className={`font-bold ${ok ? "text-slate-900" : "text-slate-300"}`}>{baht(change)}</span>
            </div>
            {willEarn > 0 && <div className="text-sm text-emerald-600 mb-3">ลูกค้าจะได้ {willEarn} แต้ม</div>}
            <button
              disabled={!ok}
              onClick={() => onConfirm(received, "cash")}
              className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-40 mt-3"
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

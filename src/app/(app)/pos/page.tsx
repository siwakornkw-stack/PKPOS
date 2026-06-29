"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search, Plus, Minus, Trash2, Send, CreditCard, Ban, UserPlus, X, Loader2, Check, Tag,
  SplitSquareHorizontal, Merge, ArrowLeftRight, PauseCircle, ScanLine, Gift,
} from "lucide-react";
import { baht, round2 } from "@/lib/format";
import { ORDER_TYPES, PAYMENT_METHODS, ORDER_ITEM_STATUS } from "@/lib/constants";
import { computeTotals } from "@/lib/totals";
import { queueOrder, queueCount, syncQueue } from "@/lib/offline";
import { Modal, Badge } from "@/components/ui";
import { useCan } from "@/components/SessionProvider";
import { PERMISSIONS } from "@/lib/permissions";

interface Opt { id: number; name: string; priceDelta: number; }
interface OptGroup { id: number; name: string; minSelect: number; maxSelect: number; required: boolean; options: Opt[]; }
interface MenuItem { id: number; name: string; price: number; code: string; isAvailable: boolean; isOpenPrice?: boolean; categoryId: number; prices?: { channel: string; price: number }[]; optionGroups?: { group: OptGroup }[]; }
interface Category { id: number; name: string; items: MenuItem[]; }
interface OrderItemOption { name: string; priceDelta: number; }
interface OrderItem { id: number; name: string; qty: number; unitPrice: number; discount: number; lineAmount: number; status: string; options?: OrderItemOption[]; }
interface Order { id: number; docNo: string; status: string; orderType: string; tableId: number | null; guestCount: number; discount: number; pointsDiscount?: number; netAmount: number; items: OrderItem[]; table?: { code: string } | null; }
interface ChosenOpt { optionId: number; name: string; priceDelta: number; }
interface CartLine { lineKey: string; menuItemId: number; name: string; unitPrice: number; qty: number; options: ChosenOpt[]; isOpenPrice?: boolean; }

function channelPrice(m: MenuItem, orderType: string): number {
  return m.prices?.find((p) => p.channel === orderType)?.price ?? m.price;
}

function POSInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const canVoid = useCan(PERMISSIONS.ORDER_VOID);

  const [categories, setCategories] = useState<Category[]>([]);
  const [rates, setRates] = useState({ taxRate: 0.07, serviceRate: 0.1 });
  const [activeCat, setActiveCat] = useState<number | "all">("all");
  const [search, setSearch] = useState("");

  const [order, setOrder] = useState<Order | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [scan, setScan] = useState("");
  const [orderType, setOrderType] = useState("DINE_IN");
  const [waiveSvc, setWaiveSvc] = useState(false); // ยกเว้น service charge for this bill
  const [guestCount, setGuestCount] = useState(2);
  const [member, setMember] = useState<{ id: number; name: string } | null>(null);

  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [rewardOpen, setRewardOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [optItem, setOptItem] = useState<MenuItem | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const tableId = sp.get("table") ? Number(sp.get("table")) : null;
  const orderIdParam = sp.get("order") ? Number(sp.get("order")) : null;

  // load menu once
  useEffect(() => {
    fetch("/api/menu").then((r) => r.json()).then((d) => {
      setCategories(d.categories ?? []);
      if (d.config) setRates(d.config);
    });
  }, []);

  // offline order queue: flush on mount + whenever we come back online
  useEffect(() => {
    const flush = async () => {
      const { synced, pending } = await syncQueue();
      setPendingSync(pending);
      if (synced > 0) flash(`sync ออเดอร์ออฟไลน์ ${synced} รายการแล้ว`);
    };
    queueCount().then(setPendingSync);
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load existing order for the table / order param
  useEffect(() => {
    async function load() {
      if (orderIdParam) {
        const d = await (await fetch(`/api/orders/${orderIdParam}`)).json();
        if (d.order) applyOrder(d.order);
      } else if (tableId) {
        setOrderType("DINE_IN");
        const d = await (await fetch(`/api/orders?tableId=${tableId}&status=DRAFT,SENT,SERVED`)).json();
        if (d.orders?.[0]) applyOrder(d.orders[0]);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, orderIdParam]);

  function applyOrder(o: Order) {
    setOrder(o);
    setOrderType(o.orderType);
    setGuestCount(o.guestCount);
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function tileClick(m: MenuItem) {
    if (m.optionGroups && m.optionGroups.length > 0) setOptItem(m);
    else addToCart(m, []);
  }
  function addToCart(m: MenuItem, options: ChosenOpt[]) {
    let base = channelPrice(m, orderType);
    if (m.isOpenPrice) {
      const input = window.prompt(`ใส่ราคา ${m.name} (บาท)`, "");
      const p = Number(input);
      if (!input || !(p > 0)) return; // cancelled or invalid
      base = p;
    }
    const unitPrice = base + options.reduce((s, o) => s + o.priceDelta, 0);
    // open-price lines never merge (each entry is its own price)
    const lineKey = m.isOpenPrice
      ? `${m.id}|open|${unitPrice}|${Date.now()}`
      : `${m.id}|${options.map((o) => o.optionId).sort((a, b) => a - b).join(",")}`;
    setCart((c) => {
      if (!m.isOpenPrice) {
        const i = c.findIndex((l) => l.lineKey === lineKey);
        if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
      }
      return [...c, { lineKey, menuItemId: m.id, name: m.name, unitPrice, qty: 1, options, isOpenPrice: m.isOpenPrice }];
    });
  }
  async function scanBarcode(code: string) {
    const c = code.trim();
    setScan("");
    if (!c) return;
    const res = await fetch(`/api/menu/barcode?code=${encodeURIComponent(c)}`);
    const d = await res.json();
    if (!res.ok) { flash(d.error?.message ?? "ไม่พบสินค้าจากบาร์โค้ด"); return; }
    tileClick(d.item as MenuItem);
    flash(`เพิ่ม ${d.item.name}`);
  }
  function setQty(lineKey: string, delta: number) {
    setCart((c) => c.map((l) => l.lineKey === lineKey ? { ...l, qty: Math.max(1, l.qty + delta) } : l).filter((l) => l.qty > 0));
  }
  function removeLine(lineKey: string) {
    setCart((c) => c.filter((l) => l.lineKey !== lineKey));
  }

  const existingItems = (order?.items ?? []).filter((i) => i.status !== "VOID");
  const allLines = [
    ...existingItems.map((i) => ({ qty: i.qty, unitPrice: i.unitPrice, discount: i.discount })),
    ...cart.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice })),
  ];
  const discount = order?.discount ?? 0;
  const effRates = waiveSvc ? { ...rates, serviceRate: 0 } : rates;
  const totals = computeTotals(allLines, orderType, discount, effRates, order?.pointsDiscount ?? 0);

  const filteredItems = useMemo(() => {
    let items = categories.flatMap((c) => c.items);
    if (activeCat !== "all") items = categories.find((c) => c.id === activeCat)?.items ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
    }
    return items;
  }, [categories, activeCat, search]);

  async function sendKitchen() {
    if (cart.length === 0) return order;
    setBusy(true);
    try {
      const items = cart.map((l) => ({ menuItemId: l.menuItemId, qty: l.qty, options: l.options.map((o) => o.optionId), ...(l.isOpenPrice ? { unitPrice: l.unitPrice } : {}) }));

      // adding to an existing (already-synced) order requires connectivity
      if (order) {
        const res = await fetch(`/api/orders/${order.id}/items`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
        });
        const d = await res.json();
        if (!res.ok) { flash(d.error?.message ?? "ส่งครัวไม่สำเร็จ"); return null; }
        applyOrder(d.order); setCart([]); flash("ส่งครัวเรียบร้อย");
        return d.order;
      }

      // new order: works offline (queued + replayed via idempotencyKey)
      const idempotencyKey = crypto.randomUUID();
      const payload = { items, orderType, tableId, guestCount, memberId: member?.id ?? null, send: true, idempotencyKey };

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await queueOrder(idempotencyKey, payload);
        setCart([]); setPendingSync(await queueCount());
        flash("ออฟไลน์: บันทึกออเดอร์ไว้ จะ sync เมื่อกลับมาออนไลน์");
        return null;
      }
      try {
        const res = await fetch("/api/orders", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (!res.ok) { flash(d.error?.message ?? "ส่งครัวไม่สำเร็จ"); return null; }
        applyOrder(d.order); setCart([]); flash("ส่งครัวเรียบร้อย");
        return d.order;
      } catch {
        await queueOrder(idempotencyKey, payload);
        setCart([]); setPendingSync(await queueCount());
        flash("เครือข่ายล่ม: บันทึกออฟไลน์ไว้แล้ว");
        return null;
      }
    } finally { setBusy(false); }
  }

  async function pay(method: string, received: number, payments?: { method: string; amount: number }[]) {
    // flush any unsent cart first and use the resulting order (handles a brand-new cart
    // that was never sent to the kitchen - previously this returned silently and did nothing)
    let active = order;
    if (cart.length > 0) {
      const flushed = await sendKitchen();
      if (flushed) active = flushed;
    }
    if (!active) { flash("กรุณาส่งครัวก่อน (ออเดอร์ออฟไลน์ยังชำระไม่ได้)"); return; }
    setBusy(true);
    try {
      // card: authorize via payment gateway (mock in dev) before recording (single-method only)
      if (method === "CARD" && !payments) {
        const ch = await fetch("/api/payments/charge", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: received, ref: active.docNo }),
        });
        const cd = await ch.json().catch(() => null);
        if (!ch.ok) { flash(cd?.error?.message ?? "ชำระบัตรไม่สำเร็จ"); return; }
      }

      const res = await fetch(`/api/orders/${active.id}/pay`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, received, ...(payments ? { payments } : {}), ...(waiveSvc ? { noServiceCharge: true } : {}) }),
      });
      const d = await res.json();
      if (!res.ok) { flash(d.error?.message ?? "ชำระเงินไม่สำเร็จ"); return; }
      setPayOpen(false);
      if (method === "CASH") fetch("/api/cashdrawer", { method: "POST" }).catch(() => {}); // kick drawer
      flash(`ชำระเงินสำเร็จ เลขที่ ${d.payment.docNo}`);
      window.open(`/receipt/${active.id}`, "_blank");
      setTimeout(() => router.push("/tables"), 900);
    } finally { setBusy(false); }
  }

  async function applyPromo(promotionId: number | null) {
    if (!order) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/promo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promotionId }),
      });
      const d = await res.json();
      if (!res.ok) { flash(d.error?.message ?? "ใช้โปรไม่สำเร็จ"); return; }
      const fresh = await (await fetch(`/api/orders/${order.id}`)).json();
      if (fresh.order) applyOrder(fresh.order);
      setPromoOpen(false);
      flash(promotionId ? "ใช้โปรโมชันแล้ว" : "ยกเลิกโปรโมชัน");
    } finally { setBusy(false); }
  }

  async function reloadOrder() {
    if (!order) return;
    const d = await (await fetch(`/api/orders/${order.id}`)).json();
    if (d.order) applyOrder(d.order);
  }

  async function redeemPoints() {
    if (!order || !member) return;
    const input = window.prompt(`ใช้แต้มของ ${member.name} (1 แต้ม = 1 บาท) กี่แต้ม?`, "");
    const pts = Number(input);
    if (!input || !(pts > 0)) return;
    setBusy(true);
    const res = await fetch(`/api/orders/${order.id}/redeem`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: Math.floor(pts) }),
    });
    const d = await res.json();
    setBusy(false);
    if (res.ok) { await reloadOrder(); flash(`ใช้ ${d.redeemed} แต้ม (-${baht(d.redeemed)})`); }
    else flash(d.error?.message ?? "ใช้แต้มไม่สำเร็จ");
  }

  async function redeemReward(rewardId: number) {
    if (!order) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/reward`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rewardId }),
      });
      const d = await res.json();
      if (!res.ok) { flash(d.error?.message ?? "แลกของรางวัลไม่สำเร็จ"); return; }
      setRewardOpen(false);
      await reloadOrder();
      flash(d.freeItem ? `แลก ${d.reward}: ฟรี ${d.freeItem}` : `แลก ${d.reward} แล้ว`);
    } finally { setBusy(false); }
  }

  async function doSplit(itemIds: number[]) {
    if (!order) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/split`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds }),
      });
      const d = await res.json();
      if (!res.ok) { flash(d.error?.message ?? "แยกบิลไม่สำเร็จ"); return; }
      setSplitOpen(false);
      await reloadOrder();
      flash(`แยกเป็นบิลใหม่ ${d.newDocNo}`);
    } finally { setBusy(false); }
  }

  async function doMerge(fromOrderId: number) {
    if (!order) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/merge`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromOrderId }),
      });
      const d = await res.json();
      if (!res.ok) { flash(d.error?.message ?? "รวมบิลไม่สำเร็จ"); return; }
      setMergeOpen(false);
      await reloadOrder();
      flash("รวมบิลแล้ว");
    } finally { setBusy(false); }
  }

  async function doMove(tableId: number) {
    if (!order) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/move`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tableId }),
      });
      const d = await res.json();
      if (!res.ok) { flash(d.error?.message ?? "ย้ายโต๊ะไม่สำเร็จ"); return; }
      setMoveOpen(false);
      flash("ย้ายโต๊ะแล้ว");
      setTimeout(() => router.push("/tables"), 600);
    } finally { setBusy(false); }
  }

  async function parkOrder() {
    if (!order) return;
    const name = prompt("ตั้งชื่อบิลที่พัก (เช่น ชื่อลูกค้า):");
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/hold`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
      });
      if (res.ok) { flash("พักบิลแล้ว"); setTimeout(() => router.push("/tables"), 600); }
      else flash("พักบิลไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  async function applyVoucher(code: string) {
    if (!order) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/voucher`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
      });
      const d = await res.json();
      if (!res.ok) { flash(d.error?.message ?? "ใช้โค้ดไม่สำเร็จ"); return; }
      await reloadOrder();
      setPromoOpen(false);
      flash(`ใช้โค้ดแล้ว ลด ${baht(d.discount)}`);
    } finally { setBusy(false); }
  }

  async function voidOrder() {
    if (!order || !confirm(`ยืนยันยกเลิกออเดอร์ ${order.docNo}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (res.ok) { flash("ยกเลิกออเดอร์แล้ว"); setTimeout(() => router.push("/tables"), 700); }
      else flash("ยกเลิกไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex h-full">
      {/* Left: menu */}
      <div className="flex-1 flex flex-col min-w-0 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input className="input pl-9" placeholder="ค้นหาเมนู..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="relative w-48">
            <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              className="input pl-9" placeholder="สแกนบาร์โค้ด" value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") scanBarcode(scan); }}
            />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
          <CatTab active={activeCat === "all"} onClick={() => setActiveCat("all")}>ทั้งหมด</CatTab>
          {categories.map((c) => (
            <CatTab key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)}>{c.name}</CatTab>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredItems.map((m) => (
              <button
                key={m.id}
                disabled={!m.isAvailable}
                onClick={() => tileClick(m)}
                className="card p-3 text-left hover:border-brand-400 hover:shadow-md transition disabled:opacity-40 disabled:line-through"
              >
                <div className="h-16 rounded-lg bg-gradient-to-br from-brand-100 to-emerald-50 mb-2 flex items-center justify-center text-brand-600 font-bold text-lg">
                  {m.name.charAt(0)}
                </div>
                <p className="text-sm font-medium text-gray-700 line-clamp-2 leading-tight">{m.name}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm font-bold text-brand-600">{baht(channelPrice(m, orderType))}</p>
                  {m.optionGroups && m.optionGroups.length > 0 && <span className="text-[10px] text-accent-500">ตัวเลือก</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: order panel */}
      <div className="w-[380px] shrink-0 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800">
              {order ? order.docNo : tableId ? `โต๊ะ ${tableId}` : "ออเดอร์ใหม่"}
            </h2>
            <div className="flex items-center gap-2">
              {pendingSync > 0 && <Badge className="bg-amber-100 text-amber-700">ออฟไลน์ {pendingSync} รอ sync</Badge>}
              {order && <Badge className="bg-brand-100 text-brand-700">{order.status}</Badge>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {ORDER_TYPES.map((t) => (
              <button
                key={t.value}
                disabled={!!order}
                onClick={() => setOrderType(t.value)}
                className={`rounded-lg py-1.5 text-xs font-medium border transition ${
                  orderType === t.value ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200"
                } disabled:opacity-60`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">ลูกค้า:</span>
            {!order && (
              <input
                type="number" value={guestCount} min={1}
                onChange={(e) => setGuestCount(Number(e.target.value))}
                className="w-14 rounded border border-gray-200 px-2 py-1 text-center"
              />
            )}
            {order && <span>{order.guestCount} คน</span>}
            <span className="text-gray-300">|</span>
            {member ? (
              <span className="flex items-center gap-1 text-brand-600">
                {member.name}
                <button onClick={() => setMember(null)}><X className="h-3 w-3" /></button>
              </span>
            ) : (
              <button onClick={() => setMemberOpen(true)} className="flex items-center gap-1 text-brand-600 text-xs">
                <UserPlus className="h-3.5 w-3.5" /> ใส่สมาชิก
              </button>
            )}
          </div>
        </div>

        {/* items list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {existingItems.length === 0 && cart.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-10">เลือกเมนูเพื่อเริ่มออเดอร์</p>
          )}

          {existingItems.map((i) => (
            <div key={`o${i.id}`} className="flex items-start gap-2 text-sm">
              <span className="w-6 text-center text-gray-500">{i.qty}</span>
              <div className="flex-1">
                <span className="text-gray-700">{i.name}</span>
                {i.options && i.options.length > 0 && (
                  <p className="text-[11px] text-gray-400">{i.options.map((o) => o.name).join(", ")}</p>
                )}
              </div>
              <Badge className={ORDER_ITEM_STATUS[i.status]?.color}>{ORDER_ITEM_STATUS[i.status]?.label}</Badge>
              <span className="w-16 text-right text-gray-600">{baht(i.lineAmount)}</span>
            </div>
          ))}

          {cart.length > 0 && existingItems.length > 0 && (
            <div className="text-xs font-semibold text-accent-600 pt-2">+ รายการใหม่ (ยังไม่ส่งครัว)</div>
          )}

          {cart.map((l) => (
            <div key={`c${l.lineKey}`} className="flex items-start gap-2 text-sm bg-accent-50 rounded-lg p-1.5">
              <div className="flex items-center gap-1">
                <button onClick={() => setQty(l.lineKey, -1)} className="h-6 w-6 rounded bg-white border flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                <span className="w-6 text-center">{l.qty}</span>
                <button onClick={() => setQty(l.lineKey, 1)} className="h-6 w-6 rounded bg-white border flex items-center justify-center"><Plus className="h-3 w-3" /></button>
              </div>
              <div className="flex-1">
                <span className="text-gray-700">{l.name}</span>
                {l.options.length > 0 && <p className="text-[11px] text-gray-500">{l.options.map((o) => o.name).join(", ")}</p>}
              </div>
              <span className="w-16 text-right text-gray-600">{baht(l.qty * l.unitPrice)}</span>
              <button onClick={() => removeLine(l.lineKey)} className="text-rose-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>

        {/* totals + actions */}
        <div className="border-t border-gray-200 p-4 space-y-1.5">
          <Row label="ยอดรวม" value={baht(totals.subtotal)} />
          <div className="flex justify-between items-center text-sm">
            <button
              onClick={() => setPromoOpen(true)}
              disabled={!order}
              className="flex items-center gap-1 text-accent-600 disabled:text-gray-300"
            >
              <Tag className="h-3.5 w-3.5" /> {discount > 0 ? "เปลี่ยนโปรโมชัน" : "ใช้โปรโมชัน"}
            </button>
            {discount > 0 && <span className="text-rose-500">-{baht(discount)}</span>}
          </div>
          {member && order && (
            <div className="flex justify-between items-center text-sm">
              <button onClick={redeemPoints} disabled={busy} className="flex items-center gap-1 text-accent-600 disabled:text-gray-300">
                <Tag className="h-3.5 w-3.5" /> ใช้แต้มสมาชิก
              </button>
              {(order.pointsDiscount ?? 0) > 0 && <span className="text-rose-500">-{baht(order.pointsDiscount ?? 0)}</span>}
            </div>
          )}
          {member && order && (
            <div className="flex justify-between items-center text-sm">
              <button onClick={() => setRewardOpen(true)} disabled={busy} className="flex items-center gap-1 text-accent-600 disabled:text-gray-300">
                <Gift className="h-3.5 w-3.5" /> แลกของรางวัล
              </button>
            </div>
          )}
          {orderType === "DINE_IN" && (
            <div className="flex justify-between items-center text-sm">
              <label className="flex items-center gap-1 text-gray-600">
                <input type="checkbox" checked={waiveSvc} onChange={(e) => setWaiveSvc(e.target.checked)} />
                Service {Math.round(rates.serviceRate * 100)}% {waiveSvc && <span className="text-rose-500">(ยกเว้น)</span>}
              </label>
              <span>{baht(totals.serviceCharge)}</span>
            </div>
          )}
          <Row label={`VAT ${Math.round(rates.taxRate * 100)}%`} value={baht(totals.taxAmount)} />
          <div className="flex justify-between text-lg font-bold text-gray-800 pt-1">
            <span>สุทธิ</span><span className="text-brand-600">{baht(totals.netAmount)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button onClick={sendKitchen} disabled={busy || cart.length === 0} className="btn-accent py-3">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} ส่งครัว
            </button>
            <button
              onClick={() => setPayOpen(true)}
              disabled={busy || (!order && cart.length === 0)}
              className="btn-primary py-3"
            >
              <CreditCard className="h-4 w-4" /> ชำระเงิน
            </button>
          </div>
          {order && (
            <div className="grid grid-cols-4 gap-2 mt-1">
              <button onClick={() => setSplitOpen(true)} disabled={busy} className="btn-ghost py-2 text-xs">
                <SplitSquareHorizontal className="h-3.5 w-3.5" /> แยก
              </button>
              <button onClick={() => setMergeOpen(true)} disabled={busy} className="btn-ghost py-2 text-xs">
                <Merge className="h-3.5 w-3.5" /> รวม
              </button>
              <button onClick={() => setMoveOpen(true)} disabled={busy} className="btn-ghost py-2 text-xs">
                <ArrowLeftRight className="h-3.5 w-3.5" /> ย้าย
              </button>
              <button onClick={parkOrder} disabled={busy} className="btn-ghost py-2 text-xs">
                <PauseCircle className="h-3.5 w-3.5" /> พัก
              </button>
            </div>
          )}
          {order && canVoid && (
            <button onClick={voidOrder} disabled={busy} className="btn-danger w-full py-2 mt-1 text-xs">
              <Ban className="h-3.5 w-3.5" /> ยกเลิกออเดอร์ (Void)
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-2.5 rounded-full text-sm shadow-lg flex items-center gap-2">
          <Check className="h-4 w-4 text-brand-400" /> {toast}
        </div>
      )}

      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} net={totals.netAmount} busy={busy} onPay={pay} />
      <MemberModal open={memberOpen} onClose={() => setMemberOpen(false)} onPick={(m) => { setMember(m); setMemberOpen(false); }} />
      <PromoModal open={promoOpen} onClose={() => setPromoOpen(false)} subtotal={totals.subtotal} busy={busy} onApply={applyPromo} onVoucher={applyVoucher} />
      <RewardModal open={rewardOpen} onClose={() => setRewardOpen(false)} busy={busy} onRedeem={redeemReward} />
      <SplitModal open={splitOpen} onClose={() => setSplitOpen(false)} items={existingItems} busy={busy} onSplit={doSplit} />
      <OptionModal item={optItem} orderType={orderType} onClose={() => setOptItem(null)} onAdd={(opts) => { if (optItem) addToCart(optItem, opts); setOptItem(null); }} />
      <MoveModal open={moveOpen} onClose={() => setMoveOpen(false)} busy={busy} onMove={doMove} />
      <MergeModal open={mergeOpen} onClose={() => setMergeOpen(false)} currentId={order?.id ?? 0} busy={busy} onMerge={doMerge} />
    </div>
  );
}

function CatTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${active ? "bg-brand-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:border-brand-300"}`}>
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-sm text-gray-500"><span>{label}</span><span>{value}</span></div>;
}

function PaymentModal({ open, onClose, net, busy, onPay }: { open: boolean; onClose: () => void; net: number; busy: boolean; onPay: (method: string, received: number, payments?: { method: string; amount: number }[]) => void; }) {
  const [method, setMethod] = useState("CASH");
  const [received, setReceived] = useState<number>(0);
  const [qr, setQr] = useState<{ configured: boolean; qr?: string } | null>(null);
  const [split, setSplit] = useState(false);
  const [entries, setEntries] = useState<{ method: string; amount: number }[]>([]);
  const [eMethod, setEMethod] = useState("CASH");
  const [eAmount, setEAmount] = useState<number>(0);
  const change = Math.max(0, received - net);
  const quick = [net, 100, 500, 1000].filter((v, i, a) => a.indexOf(v) === i);

  useEffect(() => { if (open) { setMethod("CASH"); setReceived(0); setSplit(false); setEntries([]); setEAmount(0); setEMethod("CASH"); } }, [open]);

  useEffect(() => {
    if (!open || method !== "QR" || split) { setQr(null); return; }
    fetch(`/api/promptpay?amount=${net}`).then((r) => r.json()).then(setQr).catch(() => setQr({ configured: false }));
  }, [open, method, net, split]);

  const paidSoFar = round2(entries.reduce((s, e) => s + e.amount, 0));
  const remaining = round2(Math.max(0, net - paidSoFar));
  const methodLabel = (m: string) => PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m;
  function addEntry() {
    let amt = eAmount > 0 ? eAmount : remaining;
    // non-cash (QR/CARD) must be exact - cap to the remaining balance (server rejects overpay).
    // only cash may exceed (change is given).
    if (eMethod !== "CASH") amt = Math.min(amt, remaining);
    if (amt <= 0) return;
    setEntries((es) => [...es, { method: eMethod, amount: round2(amt) }]);
    setEAmount(0);
  }
  // split the bill equally among N people (last share absorbs the rounding remainder)
  function splitEqually(n: number) {
    if (!(n >= 1) || net <= 0) return;
    const share = round2(net / n);
    setEntries(Array.from({ length: n }, (_, i) => ({ method: "CASH", amount: i === n - 1 ? round2(net - share * (n - 1)) : share })));
  }

  return (
    <Modal open={open} onClose={onClose} title="ชำระเงิน">
      <div className="text-center mb-3">
        <p className="text-sm text-gray-500">ยอดชำระ</p>
        <p className="text-4xl font-bold text-brand-600">{baht(net)}</p>
      </div>
      <div className="flex gap-2 mb-3">
        <button onClick={() => setSplit(false)} className={`flex-1 rounded-lg py-1.5 text-sm font-medium border ${!split ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200"}`}>จ่ายปกติ</button>
        <button onClick={() => setSplit(true)} className={`flex-1 rounded-lg py-1.5 text-sm font-medium border ${split ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200"}`}>แยกจ่าย</button>
      </div>

      {split ? (
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-2 text-sm">
            <span className="text-gray-500">หารเท่า:</span>
            {[2, 3, 4].map((n) => (
              <button key={n} onClick={() => splitEqually(n)} className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50">{n} คน</button>
            ))}
            <input type="number" min={1} placeholder="N" className="input w-16 py-1" onChange={(e) => { const n = Number(e.target.value); if (n >= 1) splitEqually(n); }} />
          </div>
          {entries.map((e, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-gray-50">
              <span className="text-gray-600">{methodLabel(e.method)}</span>
              <span className="flex items-center gap-2"><span className="font-semibold">{baht(e.amount)}</span>
                <button onClick={() => setEntries((es) => es.filter((_, j) => j !== i))} className="text-rose-400"><X className="h-3.5 w-3.5" /></button>
              </span>
            </div>
          ))}
          <div className="flex justify-between text-sm mt-2">
            <span className="text-gray-500">จ่ายแล้ว {baht(paidSoFar)}</span>
            <span className={remaining > 0 ? "text-rose-500" : "text-emerald-600"}>เหลือ {baht(remaining)}</span>
          </div>
          <div className="flex gap-2 mt-2">
            <select value={eMethod} onChange={(e) => setEMethod(e.target.value)} className="input w-auto">
              {PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <input type="number" className="input flex-1 text-right" placeholder={String(remaining)} value={eAmount || ""} onChange={(e) => setEAmount(Number(e.target.value))} />
            <button onClick={addEntry} className="btn-ghost">เพิ่ม</button>
          </div>
          <button
            onClick={() => onPay(entries[0]?.method ?? "CASH", paidSoFar, entries)}
            disabled={busy || paidSoFar < net || entries.length === 0}
            className="btn-primary w-full py-3 mt-3"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} ยืนยันชำระเงิน
          </button>
        </div>
      ) : (
      <>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {PAYMENT_METHODS.map((p) => (
          <button key={p.value} onClick={() => setMethod(p.value)} className={`rounded-lg py-2.5 text-sm font-medium border ${method === p.value ? "bg-brand-600 text-white border-brand-600" : "bg-white text-gray-600 border-gray-200"}`}>
            {p.label}
          </button>
        ))}
      </div>
      {method === "QR" && (
        <div className="mb-4 flex flex-col items-center">
          {qr === null && <p className="text-sm text-gray-400 py-8">กำลังสร้าง QR...</p>}
          {qr && qr.configured && qr.qr && (
            <>
              <img src={qr.qr} alt="PromptPay QR" className="w-52 h-52" />
              <p className="text-xs text-gray-500 mt-1">สแกนจ่ายด้วยแอปธนาคาร (PromptPay)</p>
            </>
          )}
          {qr && !qr.configured && (
            <p className="text-sm text-amber-600 text-center py-6">ยังไม่ได้ตั้งค่า PromptPay ID<br />ไปที่ ตั้งค่า {">"} ตั้งค่าธุรกิจ</p>
          )}
        </div>
      )}
      {method === "CASH" && (
        <div className="mb-4">
          <label className="label">รับเงินมา</label>
          <input type="number" className="input text-right text-lg" value={received || ""} onChange={(e) => setReceived(Number(e.target.value))} autoFocus />
          <div className="flex gap-2 mt-2">
            {quick.map((q) => (
              <button key={q} onClick={() => setReceived(q)} className="flex-1 rounded-lg border border-gray-200 py-1.5 text-sm hover:bg-gray-50">{baht(q)}</button>
            ))}
          </div>
          <div className="flex justify-between mt-3 text-lg font-bold">
            <span className="text-gray-600">เงินทอน</span><span className="text-accent-600">{baht(change)}</span>
          </div>
        </div>
      )}
      <button
        onClick={() => onPay(method, method === "CASH" ? received : net)}
        disabled={busy || (method === "CASH" && received < net)}
        className="btn-primary w-full py-3"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} ยืนยันชำระเงิน
      </button>
      </>
      )}
    </Modal>
  );
}

function MemberModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (m: { id: number; name: string }) => void; }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<{ id: number; name: string; phone: string | null; points: number }[]>([]);
  useEffect(() => {
    if (!open) return;
    fetch(`/api/customers?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((d) => setList(d.members ?? []));
  }, [open, q]);
  return (
    <Modal open={open} onClose={onClose} title="เลือกสมาชิก">
      <input className="input mb-3" placeholder="ค้นหาชื่อ/เบอร์โทร" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {list.map((m) => (
          <button key={m.id} onClick={() => onPick({ id: m.id, name: m.name })} className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 hover:border-brand-400 text-left">
            <div><p className="text-sm font-medium text-gray-700">{m.name}</p><p className="text-xs text-gray-400">{m.phone}</p></div>
            <Badge className="bg-brand-100 text-brand-700">{m.points} แต้ม</Badge>
          </button>
        ))}
        {list.length === 0 && <p className="text-center text-gray-400 text-sm py-6">ไม่พบสมาชิก</p>}
      </div>
    </Modal>
  );
}

function PromoModal({ open, onClose, subtotal, busy, onApply, onVoucher }: { open: boolean; onClose: () => void; subtotal: number; busy: boolean; onApply: (id: number | null) => void; onVoucher: (code: string) => void; }) {
  const [promos, setPromos] = useState<{ id: number; code: string; name: string; type: string; value: number; minSpend: number }[]>([]);
  const [code, setCode] = useState("");
  useEffect(() => {
    if (!open) { setCode(""); return; }
    fetch("/api/promotions").then((r) => r.json()).then((d) => setPromos(d.promotions ?? []));
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="โปรโมชัน / โค้ดส่วนลด">
      <div className="flex gap-2 mb-3">
        <input className="input flex-1" placeholder="กรอกโค้ดส่วนลด/voucher" value={code} onChange={(e) => setCode(e.target.value)} />
        <button onClick={() => onVoucher(code)} disabled={busy || !code} className="btn-primary">ใช้โค้ด</button>
      </div>
      <p className="text-xs text-gray-400 mb-2">หรือเลือกโปรโมชัน:</p>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {promos.map((p) => {
          const ok = subtotal >= p.minSpend;
          return (
            <button
              key={p.id} disabled={!ok || busy} onClick={() => onApply(p.id)}
              className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 hover:border-accent-400 disabled:opacity-40 text-left"
            >
              <div>
                <p className="text-sm font-medium text-gray-700">{p.name}</p>
                <p className="text-xs text-gray-400">
                  {p.type === "PERCENT" ? `ลด ${p.value}%` : `ลด ${baht(p.value)}`}
                  {p.minSpend > 0 && ` - ขั้นต่ำ ${baht(p.minSpend)}`}
                </p>
              </div>
              <Tag className="h-4 w-4 text-accent-500" />
            </button>
          );
        })}
        {promos.length === 0 && <p className="text-center text-gray-400 text-sm py-6">ไม่มีโปรโมชันที่ใช้ได้</p>}
      </div>
      <button onClick={() => onApply(null)} disabled={busy} className="btn-ghost w-full mt-3">ไม่ใช้โปรโมชัน</button>
    </Modal>
  );
}

function RewardModal({ open, onClose, busy, onRedeem }: { open: boolean; onClose: () => void; busy: boolean; onRedeem: (rewardId: number) => void; }) {
  const [rewards, setRewards] = useState<{ id: number; name: string; pointsCost: number; type: string; value: number; isActive: boolean }[]>([]);
  useEffect(() => {
    if (!open) return;
    fetch("/api/rewards").then((r) => r.json()).then((d) => setRewards((d.rewards ?? []).filter((r: { isActive: boolean }) => r.isActive)));
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="แลกของรางวัล (ใช้แต้มสมาชิก)">
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {rewards.map((r) => (
          <button key={r.id} onClick={() => onRedeem(r.id)} disabled={busy}
            className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 hover:border-accent-400 disabled:opacity-40 text-left">
            <div>
              <p className="text-sm font-medium text-gray-700">{r.name}</p>
              <p className="text-xs text-gray-400">{r.type === "FREE_ITEM" ? "ฟรีเมนู" : `ลด ${baht(r.value)}`}</p>
            </div>
            <Badge className="bg-amber-100 text-amber-700">{r.pointsCost} แต้ม</Badge>
          </button>
        ))}
        {rewards.length === 0 && <p className="text-center text-gray-400 text-sm py-6">ยังไม่มีของรางวัล</p>}
      </div>
    </Modal>
  );
}

function SplitModal({ open, onClose, items, busy, onSplit }: { open: boolean; onClose: () => void; items: OrderItem[]; busy: boolean; onSplit: (ids: number[]) => void; }) {
  const [picked, setPicked] = useState<number[]>([]);
  useEffect(() => { if (open) setPicked([]); }, [open]);
  const toggle = (id: number) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  return (
    <Modal open={open} onClose={onClose} title="แยกบิล - เลือกรายการที่จะย้ายออก">
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {items.map((i) => (
          <label key={i.id} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 cursor-pointer">
            <input type="checkbox" checked={picked.includes(i.id)} onChange={() => toggle(i.id)} />
            <span className="w-6 text-center text-gray-500">{i.qty}</span>
            <span className="flex-1 text-sm text-gray-700">{i.name}</span>
            <span className="text-sm text-gray-500">{baht(i.lineAmount)}</span>
          </label>
        ))}
      </div>
      <button onClick={() => onSplit(picked)} disabled={busy || picked.length === 0} className="btn-primary w-full mt-3">
        แยกออกเป็นบิลใหม่ ({picked.length})
      </button>
    </Modal>
  );
}

function MergeModal({ open, onClose, currentId, busy, onMerge }: { open: boolean; onClose: () => void; currentId: number; busy: boolean; onMerge: (id: number) => void; }) {
  const [orders, setOrders] = useState<{ id: number; docNo: string; netAmount: number; table?: { code: string } | null }[]>([]);
  useEffect(() => {
    if (!open) return;
    fetch("/api/orders?status=DRAFT,SENT,SERVED").then((r) => r.json()).then((d) => setOrders((d.orders ?? []).filter((o: { id: number }) => o.id !== currentId)));
  }, [open, currentId]);
  return (
    <Modal open={open} onClose={onClose} title="รวมบิล - เลือกบิลที่จะรวมเข้ามา">
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {orders.map((o) => (
          <button key={o.id} onClick={() => onMerge(o.id)} disabled={busy} className="w-full flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 hover:border-brand-400 text-left">
            <span className="text-sm text-gray-700">{o.table ? `โต๊ะ ${o.table.code}` : o.docNo}</span>
            <span className="text-sm font-semibold">{baht(o.netAmount)}</span>
          </button>
        ))}
        {orders.length === 0 && <p className="text-center text-gray-400 text-sm py-6">ไม่มีบิลอื่นที่เปิดอยู่</p>}
      </div>
    </Modal>
  );
}

function MoveModal({ open, onClose, busy, onMove }: { open: boolean; onClose: () => void; busy: boolean; onMove: (tableId: number) => void; }) {
  const [tables, setTables] = useState<{ id: number; code: string; zone: string | null; status: string }[]>([]);
  useEffect(() => {
    if (!open) return;
    fetch("/api/tables").then((r) => r.json()).then((d) => setTables((d.tables ?? []).filter((t: { status: string }) => t.status === "AVAILABLE")));
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="ย้ายไปโต๊ะ">
      <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
        {tables.map((t) => (
          <button key={t.id} onClick={() => onMove(t.id)} disabled={busy} className="rounded-lg border border-gray-200 py-3 text-center hover:border-brand-400">
            <p className="font-bold text-gray-700">{t.code}</p>
            <p className="text-[11px] text-gray-400">{t.zone}</p>
          </button>
        ))}
        {tables.length === 0 && <p className="col-span-3 text-center text-gray-400 text-sm py-6">ไม่มีโต๊ะว่าง</p>}
      </div>
    </Modal>
  );
}

function OptionModal({ item, orderType, onClose, onAdd }: { item: MenuItem | null; orderType: string; onClose: () => void; onAdd: (opts: ChosenOpt[]) => void; }) {
  const [sel, setSel] = useState<Record<number, number[]>>({}); // groupId -> optionIds
  useEffect(() => { setSel({}); }, [item]);
  if (!item) return null;
  const groups = (item.optionGroups ?? []).map((g) => g.group);

  function toggle(g: OptGroup, optId: number) {
    setSel((s) => {
      const cur = s[g.id] ?? [];
      if (g.maxSelect <= 1) return { ...s, [g.id]: cur[0] === optId ? [] : [optId] };
      if (cur.includes(optId)) return { ...s, [g.id]: cur.filter((x) => x !== optId) };
      if (cur.length >= g.maxSelect) return s; // max reached
      return { ...s, [g.id]: [...cur, optId] };
    });
  }

  const chosen: ChosenOpt[] = groups.flatMap((g) =>
    (sel[g.id] ?? []).map((id) => {
      const o = g.options.find((x) => x.id === id)!;
      return { optionId: o.id, name: o.name, priceDelta: o.priceDelta };
    })
  );
  const unmet = groups.filter((g) => g.required && (sel[g.id] ?? []).length < Math.max(1, g.minSelect));
  const total = channelPrice(item, orderType) + chosen.reduce((s, o) => s + o.priceDelta, 0);

  return (
    <Modal open={!!item} onClose={onClose} title={item.name}>
      <div className="space-y-4 max-h-[60vh] overflow-y-auto">
        {groups.map((g) => (
          <div key={g.id}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-semibold text-gray-700">{g.name} {g.required && <span className="text-rose-500">*</span>}</p>
              <span className="text-[11px] text-gray-400">{g.maxSelect <= 1 ? "เลือก 1" : `เลือกได้ ${g.maxSelect}`}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {g.options.map((o) => {
                const active = (sel[g.id] ?? []).includes(o.id);
                return (
                  <button key={o.id} onClick={() => toggle(g, o.id)} className={`rounded-lg border px-3 py-2 text-sm text-left ${active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600"}`}>
                    {o.name}{o.priceDelta ? <span className="text-xs text-gray-400"> +{baht(o.priceDelta)}</span> : ""}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => onAdd(chosen)} disabled={unmet.length > 0} className="btn-primary w-full mt-4">
        เพิ่มลงออเดอร์ - {baht(total)}
      </button>
      {unmet.length > 0 && <p className="text-xs text-rose-500 mt-1 text-center">กรุณาเลือก: {unmet.map((g) => g.name).join(", ")}</p>}
    </Modal>
  );
}

export default function POSPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">กำลังโหลด...</div>}>
      <POSInner />
    </Suspense>
  );
}

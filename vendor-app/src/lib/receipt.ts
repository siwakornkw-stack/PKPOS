import { Share } from "@capacitor/share";
import type { Order } from "../types";
import { baht } from "./format";
import { optionsLabel } from "./options";

export function receiptText(order: Order, shopName: string): string {
  const when = new Date(order.ts).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  const lines = order.lines.flatMap((l) => {
    const row = `${l.name} x${l.qty}  ${baht(l.price * l.qty)}`;
    const opts = optionsLabel(l);
    return opts ? [row, `  + ${opts}`] : [row];
  });

  // Only show a subtotal/discount breakdown when a discount was applied.
  const discountRows = order.discount
    ? [`ยอดรวม  ${baht(order.subtotal ?? order.total + order.discount)}`, `ส่วนลด  -${baht(order.discount)}`]
    : [];

  const paymentRows =
    order.method === "qr"
      ? ["ชำระผ่าน QR พร้อมเพย์"]
      : [`รับเงิน  ${baht(order.received)}`, `ทอน  ${baht(order.change)}`];

  const pointRows = [
    ...(order.pointsUsed ? [`ใช้แต้ม  ${order.pointsUsed}`] : []),
    ...(order.pointsEarned ? [`ได้แต้ม  ${order.pointsEarned}`] : []),
  ];

  return [
    shopName,
    when,
    "--------------------",
    ...lines,
    "--------------------",
    ...discountRows,
    `รวม  ${baht(order.total)}`,
    ...paymentRows,
    ...pointRows,
    "ขอบคุณที่ใช้บริการ",
  ].join("\n");
}

// Opens the OS share sheet (LINE, print, save...). Web falls back to navigator.share via the plugin.
export async function shareReceipt(order: Order, shopName: string): Promise<void> {
  await Share.share({ title: "ใบเสร็จ", text: receiptText(order, shopName) });
}

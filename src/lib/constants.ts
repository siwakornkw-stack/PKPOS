// Business config. In a multi-branch deploy these move to a settings table.
export const TAX_RATE = 0.07; // 7% VAT
export const SERVICE_CHARGE_RATE = 0.1; // 10% (dine-in)

export const ORDER_TYPES = [
  { value: "DINE_IN", label: "ทานที่ร้าน" },
  { value: "TAKEAWAY", label: "กลับบ้าน" },
  { value: "DELIVERY", label: "เดลิเวอรี" },
] as const;

export const PAYMENT_METHODS = [
  { value: "CASH", label: "เงินสด" },
  { value: "QR", label: "QR พร้อมเพย์" },
  { value: "CARD", label: "บัตรเครดิต" },
] as const;

export const TABLE_STATUS: Record<
  string,
  { label: string; color: string }
> = {
  AVAILABLE: { label: "ว่าง", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  OCCUPIED: { label: "มีลูกค้า", color: "bg-orange-100 text-orange-700 border-orange-300" },
  RESERVED: { label: "จองแล้ว", color: "bg-blue-100 text-blue-700 border-blue-300" },
  BILL: { label: "รอชำระ", color: "bg-rose-100 text-rose-700 border-rose-300" },
};

export const ORDER_ITEM_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "รอครัว", color: "bg-gray-100 text-gray-600" },
  COOKING: { label: "กำลังทำ", color: "bg-amber-100 text-amber-700" },
  DONE: { label: "ทำเสร็จ", color: "bg-blue-100 text-blue-700" },
  SERVED: { label: "เสิร์ฟแล้ว", color: "bg-emerald-100 text-emerald-700" },
  VOID: { label: "ยกเลิก", color: "bg-rose-100 text-rose-700" },
};

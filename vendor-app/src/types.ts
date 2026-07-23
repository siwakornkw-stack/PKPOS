// A single pickable choice inside an OptionGroup. `price` is a delta added to the item's base price.
export interface OptionChoice {
  id: string;
  name: string;
  price: number;
}

// e.g. "ระดับความเผ็ด" (single, required) or "เพิ่มท็อปปิ้ง" (multi, optional).
export interface OptionGroup {
  id: string;
  name: string;
  multi: boolean;
  required: boolean;
  choices: OptionChoice[];
}

export interface Item {
  id: string;
  name: string;
  price: number;
  category: string;
  active: boolean;
  options?: OptionGroup[];
  // undefined = not tracked (sells forever). A number = remaining pieces, decremented on payment.
  stock?: number;
}

export interface OrderLine {
  // Unique per cart line: the same item with different options must not merge into one line.
  // Optional so orders saved before options existed still parse — use lineKey() to read it.
  lineId?: string;
  itemId: string;
  name: string;
  price: number; // unit price INCLUDING chosen options, so price*qty stays the line total everywhere
  qty: number;
  opts?: { name: string; price: number }[]; // chosen options, denormalized for receipt/display
  category?: string; // denormalized for per-category reports
}

export interface Order {
  id: string;
  ts: number; // epoch ms
  lines: OrderLine[];
  subtotal?: number; // sum of lines before discount (optional: older orders stored only total)
  discount?: number; // baht taken off the subtotal
  total: number; // net amount payable (subtotal - discount)
  method?: "cash" | "qr"; // how it was paid (optional: older orders were all cash)
  received: number;
  change: number;
  customerId?: string;
  pointsEarned?: number;
  pointsUsed?: number; // points spent, already included in `discount`
  promoId?: string;
  shiftId?: string;
  voided?: boolean; // kept in the ledger but excluded from every total
}

// A parked cart: saved mid-sale, recalled later. Not yet a completed order.
export interface Hold {
  id: string;
  ts: number;
  lines: OrderLine[];
  discount: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  points: number;
  spent: number; // lifetime baht
  ts: number; // joined
}

export interface Promo {
  id: string;
  name: string;
  type: "percent" | "amount";
  value: number;
  minSpend: number; // 0 = no minimum
  active: boolean;
}

export interface Shift {
  id: string;
  openTs: number;
  openFloat: number; // cash in the drawer at open
  closeTs?: number;
  countedCash?: number; // what the vendor actually counted at close
}

// Cash added to / removed from the drawer that is not a sale (change float, supplier paid in cash...).
export interface CashMove {
  id: string;
  shiftId: string;
  ts: number;
  amount: number; // positive = in, negative = out
  note: string;
}

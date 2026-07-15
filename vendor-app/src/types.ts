export interface Item {
  id: string;
  name: string;
  price: number;
  category: string;
  active: boolean;
}

export interface OrderLine {
  itemId: string;
  name: string;
  price: number;
  qty: number;
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
}

// A parked cart: saved mid-sale, recalled later. Not yet a completed order.
export interface Hold {
  id: string;
  ts: number;
  lines: OrderLine[];
  discount: number;
}

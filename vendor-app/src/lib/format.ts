// Sign goes outside the symbol: -฿200, not ฿-200. Negatives show up on cash-out moves
// and on a short till at shift close.
export function baht(n: number): string {
  const abs = Math.abs(n).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return (n < 0 ? "-฿" : "฿") + abs;
}

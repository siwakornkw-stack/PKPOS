import { round2 } from "./format";
import { timeWindowActive } from "./timewin";

// Pure pricing resolution shared by the order pipeline and unit tests.

export interface TimePriceLike {
  channel: string | null;
  days: string;
  startMin: number;
  endMin: number;
  price: number;
  priority: number;
  isActive: boolean;
}

// Effective base price for a menu item on a channel at a given time.
// An active time-window price (highest priority wins) overrides the per-channel
// override, which in turn overrides the item's base price.
export function effectiveBasePrice(
  basePrice: number,
  channelPrice: number | undefined,
  timePrices: TimePriceLike[],
  channel: string,
  now: Date
): number {
  const tw = timePrices
    .filter(
      (t) =>
        t.isActive &&
        (t.channel == null || t.channel === channel) &&
        timeWindowActive(now, t.days, t.startMin, t.endMin)
    )
    .sort((a, b) => b.priority - a.priority)[0];
  if (tw) return round2(tw.price);
  return round2(channelPrice ?? basePrice);
}

import type { OptionChoice, OptionGroup, OrderLine } from "../types";
import { round2 } from "./totals";

// The unit price a line is charged at: base item price plus every chosen option's delta.
// Storing this on the line keeps `price * qty` the line total everywhere else in the app.
export function unitPrice(base: number, chosen: OptionChoice[]): number {
  return round2(chosen.reduce((s, c) => s + c.price, base));
}

// Every required group must have at least one choice picked.
export function optionsValid(groups: OptionGroup[], chosenIds: string[]): boolean {
  return groups
    .filter((g) => g.required)
    .every((g) => g.choices.some((c) => chosenIds.includes(c.id)));
}

// Deterministic line id: the same item with the same options merges into one cart line,
// a different option set becomes its own line. Order of picking must not matter, hence sort().
export function lineSig(itemId: string, chosenIds: string[]): string {
  return `${itemId}|${[...chosenIds].sort().join(",")}`;
}

// Cart lines are keyed by lineId; orders saved before options existed only have itemId.
export function lineKey(l: OrderLine): string {
  return l.lineId ?? l.itemId;
}

export function optionsLabel(l: OrderLine): string {
  return (l.opts ?? []).map((o) => o.name).join(", ");
}

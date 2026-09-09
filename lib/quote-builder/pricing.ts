import type { Alternative, QuoteItem } from "./quoteTypes";

export const totalFor = (items: QuoteItem[]) => items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);

/** Verbatim from the original Home.tsx — do not let this drift from the PDF's math. */
export function calculateAlternative(alt: Alternative) {
  const itemSubtotal = totalFor(alt.items);
  const base = alt.usePackagePrice ? alt.packagePrice : itemSubtotal;
  const discount = base * (alt.discountPct / 100);
  const dpp = base - discount;
  const vat = alt.vatMode === "add" ? dpp * 0.11 : alt.vatMode === "included" ? dpp * (11 / 111) : 0;
  const displayTotal = alt.vatMode === "add" ? dpp + vat : dpp;
  return { itemSubtotal, base, discount, dpp, vat, displayTotal };
}

export function grandTotalFor(alternatives: Alternative[]) {
  return alternatives
    .filter((alt) => alt.includeInGrandTotal)
    .reduce((sum, alt) => sum + calculateAlternative(alt).displayTotal, 0);
}

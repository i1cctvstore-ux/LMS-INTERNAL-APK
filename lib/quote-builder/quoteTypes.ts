export type PriceType = "net" | "reseller" | "special";
export type PriceSource = "list" | "manual";
export type VatMode = "included" | "add" | "none";
export type ReviewStatus = "draft" | "in_review" | "confirmed" | "needs_revision" | "sent";

export type Product = {
  id: string;
  name: string;
  sku: string;
  brand: string;
  prices: Record<PriceType, number>;
};

export type QuoteItem = {
  id: string;
  productId: string | null;
  qty: number;
  unitPrice: number;
  source: PriceSource;
  /** kept so a quote row still reads correctly if the product is later deactivated/renamed in the catalog */
  nameSnapshot: string;
  skuSnapshot: string | null;
  brandSnapshot: string | null;
};

export type Alternative = {
  id: string;
  title: string;
  description: string;
  items: QuoteItem[];
  discountPct: number;
  vatMode: VatMode;
  usePackagePrice: boolean;
  packagePrice: number;
  includeInGrandTotal: boolean;
};

export type QuoteNote = { id: string; text: string };

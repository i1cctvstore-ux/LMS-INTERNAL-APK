import { supabase } from "./supabaseClient";
import type {
  ActiveProductPriceRow,
  BranchRow,
  DefaultNoteRow,
  ProductRow,
  QuoteAlternativeRow,
  QuoteItemRow,
  QuoteNoteRow,
  QuoteRow,
  QuoteStatus,
  SyncBatchRow,
  TemplateItemRow,
  TemplateRow,
} from "./database.types";
import type { Alternative, PriceType, Product, QuoteItem, QuoteNote } from "./quoteTypes";

/** Internal price_tier keys stored in the DB for each of the app's 3 exposed tiers.
 *  Adjust here if the branch's real Pricelist columns end up different — this is
 *  the one place that mapping lives. "Modal" is deliberately never listed: it must
 *  never be selectable as a quoting tier. */
export const PRICE_TIER_DB_KEY: Record<PriceType, string> = {
  net: "online",
  reseller: "reseller_dpp",
  special: "reseller_special",
};

function mapProductRow(product: ProductRow, prices: ActiveProductPriceRow[]): Product {
  const byTier: Record<PriceType, number> = { net: 0, reseller: 0, special: 0 };
  for (const tier of Object.keys(PRICE_TIER_DB_KEY) as PriceType[]) {
    const dbKey = PRICE_TIER_DB_KEY[tier];
    const match = prices.find((p) => p.product_id === product.id && p.price_tier === dbKey);
    byTier[tier] = match?.amount ?? 0;
  }
  return { id: product.id, name: product.name, sku: product.sku ?? "", brand: product.brand ?? "", prices: byTier };
}

// ---------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------
export async function getBranch(branchId: string): Promise<BranchRow> {
  const { data, error } = await supabase.from("branches").select("*").eq("id", branchId).single();
  if (error) throw error;
  return data as BranchRow;
}

export async function listBranches(): Promise<BranchRow[]> {
  const { data, error } = await supabase.from("branches").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as BranchRow[];
}

// ---------------------------------------------------------------------
// Catalog (products + active prices), branch-scoped
// ---------------------------------------------------------------------
export async function listCatalog(branchId: string): Promise<Product[]> {
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("*")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("name");
  if (productsError) throw productsError;

  const productRows = (products ?? []) as ProductRow[];
  if (productRows.length === 0) return [];

  const { data: prices, error: pricesError } = await supabase
    .from("active_product_prices")
    .select("*")
    .in(
      "product_id",
      productRows.map((p) => p.id),
    );
  if (pricesError) throw pricesError;

  const priceRows = (prices ?? []) as ActiveProductPriceRow[];
  return productRows.map((product) => mapProductRow(product, priceRows));
}

export async function listSyncBatches(branchId: string): Promise<SyncBatchRow[]> {
  const { data, error } = await supabase
    .from("sync_batches")
    .select("*")
    .eq("branch_id", branchId)
    .order("started_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as SyncBatchRow[];
}

/**
 * Triggers the price-list sync job. Requires a Supabase Edge Function named
 * "sync-price-list" that: reads the branch's Google Sheet (Jakarta) or other
 * source, validates it, and writes products/product_prices/sync_batches
 * using the service role key. That Edge Function is NOT part of this
 * handoff — build it separately per section 6 of the original handoff doc
 * ("Sync harus deterministik: Sheet → normalisasi → validasi → database").
 * This function only calls it and surfaces the result; it does not write
 * to products/product_prices/sync_batches directly (those have no client
 * insert policy on purpose — see 001_quote_builder_schema.sql).
 */
export async function triggerManualSync(branchId: string) {
  const { data, error } = await supabase.functions.invoke("sync-price-list", { body: { branchId } });
  if (error) throw error;
  return data as { batchId: string; productCount: number; status: string };
}

// ---------------------------------------------------------------------
// Quotes — list + full read/write
// ---------------------------------------------------------------------
export type QuoteWithTotal = QuoteRow & { alternatives: Alternative[] };

export async function listQuotesForBranch(branchId: string): Promise<QuoteWithTotal[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select("*, quote_alternatives(*, quote_items(*))")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as Array<QuoteRow & { quote_alternatives: Array<QuoteAlternativeRow & { quote_items: QuoteItemRow[] }> }>).map(
    (row) => ({
      ...row,
      alternatives: row.quote_alternatives
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(mapAlternativeRow),
    }),
  );
}

/** super_admin only — branch filter omitted to see every branch. */
export async function listAllQuotes(): Promise<QuoteWithTotal[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select("*, quote_alternatives(*, quote_items(*))")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Array<QuoteRow & { quote_alternatives: Array<QuoteAlternativeRow & { quote_items: QuoteItemRow[] }> }>).map(
    (row) => ({
      ...row,
      alternatives: row.quote_alternatives.sort((a, b) => a.sort_order - b.sort_order).map(mapAlternativeRow),
    }),
  );
}

function mapAlternativeRow(row: QuoteAlternativeRow & { quote_items: QuoteItemRow[] }): Alternative {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    discountPct: Number(row.discount_pct),
    vatMode: row.vat_mode,
    usePackagePrice: row.use_package_price,
    packagePrice: Number(row.package_price ?? 0),
    includeInGrandTotal: row.include_in_grand_total,
    items: [...row.quote_items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(
        (item): QuoteItem => ({
          id: item.id,
          productId: item.product_id,
          qty: Number(item.qty),
          unitPrice: Number(item.price_source === "manual" ? item.manual_unit_price ?? 0 : item.unit_price_snapshot),
          source: item.price_source,
          nameSnapshot: item.product_name_snapshot,
          skuSnapshot: item.sku_snapshot,
          brandSnapshot: item.brand_snapshot,
        }),
      ),
  };
}

export type QuoteFull = { quote: QuoteRow; alternatives: Alternative[]; notes: QuoteNote[] };

export async function getQuoteFull(quoteId: string): Promise<QuoteFull> {
  const { data: quote, error: quoteError } = await supabase.from("quotes").select("*").eq("id", quoteId).single();
  if (quoteError) throw quoteError;

  const { data: alts, error: altsError } = await supabase
    .from("quote_alternatives")
    .select("*, quote_items(*)")
    .eq("quote_id", quoteId)
    .order("sort_order");
  if (altsError) throw altsError;

  const { data: notes, error: notesError } = await supabase
    .from("quote_notes")
    .select("*")
    .eq("quote_id", quoteId)
    .order("sort_order");
  if (notesError) throw notesError;

  return {
    quote: quote as QuoteRow,
    alternatives: ((alts ?? []) as unknown as Array<QuoteAlternativeRow & { quote_items: QuoteItemRow[] }>).map(mapAlternativeRow),
    notes: ((notes ?? []) as QuoteNoteRow[]).map((n) => ({ id: n.id, text: n.text })),
  };
}

export async function createDraftQuote(input: {
  branchId: string;
  clientName: string;
  projectName: string;
  validUntil: string | null;
  createdBy: string;
}): Promise<QuoteRow> {
  const { data, error } = await supabase
    .from("quotes")
    .insert({
      branch_id: input.branchId,
      client_name: input.clientName,
      project_name: input.projectName,
      valid_until: input.validUntil,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as QuoteRow;
}

function alternativesToRpcJson(alternatives: Alternative[]) {
  return alternatives.map((alt, altIndex) => ({
    sort_order: altIndex,
    title: alt.title,
    description: alt.description || null,
    discount_pct: alt.discountPct,
    vat_mode: alt.vatMode,
    use_package_price: alt.usePackagePrice,
    package_price: alt.usePackagePrice ? alt.packagePrice : null,
    include_in_grand_total: alt.includeInGrandTotal,
    items: alt.items.map((item, itemIndex) => ({
      sort_order: itemIndex,
      product_id: item.productId,
      product_name_snapshot: item.nameSnapshot,
      sku_snapshot: item.skuSnapshot,
      brand_snapshot: item.brandSnapshot,
      qty: item.qty,
      price_source: item.source,
      price_tier_used: null as string | null,
      unit_price_snapshot: item.source === "manual" ? 0 : item.unitPrice,
      manual_unit_price: item.source === "manual" ? item.unitPrice : null,
    })),
  }));
}

export async function saveQuoteFull(
  quoteId: string,
  input: {
    clientName: string;
    projectName: string;
    quoteDate: string;
    validUntil: string | null;
    alternatives: Alternative[];
    notes: QuoteNote[];
  },
) {
  const { error } = await supabase.rpc("save_quote_full", {
    p_quote_id: quoteId,
    p_client_name: input.clientName,
    p_project_name: input.projectName,
    p_quote_date: input.quoteDate,
    p_valid_until: input.validUntil,
    p_alternatives: alternativesToRpcJson(input.alternatives),
    p_notes: input.notes.map((note, index) => ({ sort_order: index, text: note.text })),
  });
  if (error) throw error;
}

export async function updateQuoteStatus(quoteId: string, status: QuoteStatus) {
  const { error } = await supabase.from("quotes").update({ status }).eq("id", quoteId);
  if (error) throw error;
}

export async function softDeleteQuote(quoteId: string) {
  const { error } = await supabase.from("quotes").update({ deleted_at: new Date().toISOString() }).eq("id", quoteId);
  if (error) throw error;
}

export async function restoreQuote(quoteId: string) {
  const { error } = await supabase.from("quotes").update({ deleted_at: null }).eq("id", quoteId);
  if (error) throw error;
}

/**
 * Per the handoff rule: duplicating a quote must re-resolve prices for any
 * item whose price_source is "list" against the CURRENT active catalog
 * (never carry over the old snapshot), while manual overrides are kept as-is
 * so an admin can review them.
 */
export async function duplicateQuote(quoteId: string, createdBy: string): Promise<QuoteRow> {
  const full = await getQuoteFull(quoteId);
  const catalog = await listCatalog(full.quote.branch_id);
  const catalogById = new Map(catalog.map((p) => [p.id, p]));

  const refreshedAlternatives: Alternative[] = full.alternatives.map((alt) => ({
    ...alt,
    id: `new-${alt.id}`,
    items: alt.items.map((item) => {
      if (item.source !== "list" || !item.productId) return { ...item, id: `new-${item.id}` };
      const product = catalogById.get(item.productId);
      return { ...item, id: `new-${item.id}`, unitPrice: product?.prices.reseller ?? item.unitPrice };
    }),
  }));

  const draft = await createDraftQuote({
    branchId: full.quote.branch_id,
    clientName: full.quote.client_name,
    projectName: `${full.quote.project_name} (salinan)`,
    validUntil: full.quote.valid_until,
    createdBy,
  });

  await saveQuoteFull(draft.id, {
    clientName: draft.client_name,
    projectName: draft.project_name,
    quoteDate: draft.quote_date,
    validUntil: draft.valid_until,
    alternatives: refreshedAlternatives,
    notes: full.notes,
  });

  return draft;
}

// ---------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------
export async function listTemplates(branchId: string): Promise<TemplateRow[]> {
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as TemplateRow[];
}

export async function getTemplateItems(templateId: string) {
  const { data, error } = await supabase
    .from("template_items")
    .select("*, products(*)")
    .eq("template_id", templateId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as unknown as Array<TemplateItemRow & { products: ProductRow }>;
}

export async function createTemplate(branchId: string, name: string, createdBy: string): Promise<TemplateRow> {
  const { data, error } = await supabase
    .from("templates")
    .insert({ branch_id: branchId, name, created_by: createdBy })
    .select("*")
    .single();
  if (error) throw error;
  return data as TemplateRow;
}

export async function renameTemplate(templateId: string, name: string) {
  const { error } = await supabase.from("templates").update({ name }).eq("id", templateId);
  if (error) throw error;
}

export async function deleteTemplate(templateId: string) {
  const { error } = await supabase.from("templates").delete().eq("id", templateId);
  if (error) throw error;
}

export async function replaceTemplateItems(templateId: string, items: Array<{ productId: string; qty: number }>) {
  const { error: deleteError } = await supabase.from("template_items").delete().eq("template_id", templateId);
  if (deleteError) throw deleteError;
  if (items.length === 0) return;
  const { error: insertError } = await supabase.from("template_items").insert(
    items.map((item, index) => ({ template_id: templateId, sort_order: index, product_id: item.productId, qty: item.qty })),
  );
  if (insertError) throw insertError;
}

export async function applyTemplateToAlternative(
  alternativeId: string,
  templateId: string,
  priceType: PriceType,
  mode: "append" | "replace",
) {
  const { error } = await supabase.rpc("apply_template_to_alternative", {
    p_alternative_id: alternativeId,
    p_template_id: templateId,
    p_price_tier: PRICE_TIER_DB_KEY[priceType],
    p_mode: mode,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Default notes (global, super_admin managed)
// ---------------------------------------------------------------------
export async function listDefaultNotes(): Promise<QuoteNote[]> {
  const { data, error } = await supabase.from("default_notes").select("*").eq("is_active", true).order("sort_order");
  if (error) throw error;
  return ((data ?? []) as DefaultNoteRow[]).map((n) => ({ id: n.id, text: n.text }));
}

export async function replaceDefaultNotes(notes: QuoteNote[], updatedBy: string) {
  const { error: deactivateError } = await supabase.from("default_notes").update({ is_active: false }).eq("is_active", true);
  if (deactivateError) throw deactivateError;
  if (notes.length === 0) return;
  const { error: insertError } = await supabase.from("default_notes").insert(
    notes.map((note, index) => ({ sort_order: index, text: note.text, updated_by: updatedBy })),
  );
  if (insertError) throw insertError;
}

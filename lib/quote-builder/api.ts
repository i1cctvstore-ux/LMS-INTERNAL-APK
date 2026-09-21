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
/** Identitas kop surat penawaran per cabang (tabel `branch_letterhead`, 1 baris per cabang). Logo = data URL base64. */
export type BranchLetterheadRow = {
  branch_id: string;
  /** Nama toko versi NON-PPN (sekaligus data utama). Kolom `*_ppn` = data khusus kop PPN; kosong = pakai data non-PPN. */
  store_name: string | null;
  store_name_ppn: string | null;
  address_ppn: string | null;
  phone_ppn: string | null;
  email_ppn: string | null;
  logo_ppn_data: string | null;
  logo_non_ppn_data: string | null;
  /** true = gambar logo adalah BANNER kop penuh (sudah memuat nama & kontak): dicetak selebar kop, teks kontak tidak dicetak lagi. */
  logo_ppn_is_banner: boolean;
  logo_non_ppn_is_banner: boolean;
  updated_at: string;
  updated_by: string | null;
};

/** Baris `branches` + nama toko & 2 logo dari `branch_letterhead` (digabung oleh getBranch). */
export type BranchWithLetterhead = BranchRow & {
  store_name?: string | null;
  store_name_ppn?: string | null;
  address_ppn?: string | null;
  phone_ppn?: string | null;
  email_ppn?: string | null;
  logo_ppn_data?: string | null;
  logo_non_ppn_data?: string | null;
  logo_ppn_is_banner?: boolean;
  logo_non_ppn_is_banner?: boolean;
};

/**
 * 2026-09: hasilnya = baris `branches` + identitas kop surat (nama toko & 2
 * logo) dari tabel `branch_letterhead`. Query kop surat sengaja dibuat
 * "boleh gagal" (.catch -> null): kalau migration branch_letterhead belum
 * dijalankan, editor penawaran tetap jalan pakai logo bawaan, bukan error.
 */
export async function getBranch(branchId: string): Promise<BranchWithLetterhead> {
  const [branchResult, letterhead] = await Promise.all([
    supabase.from("branches").select("*").eq("id", branchId).single(),
    getBranchLetterhead(branchId).catch(() => null),
  ]);
  if (branchResult.error) throw branchResult.error;
  return {
    ...(branchResult.data as BranchRow),
    store_name: letterhead?.store_name ?? null,
    store_name_ppn: letterhead?.store_name_ppn ?? null,
    address_ppn: letterhead?.address_ppn ?? null,
    phone_ppn: letterhead?.phone_ppn ?? null,
    email_ppn: letterhead?.email_ppn ?? null,
    logo_ppn_data: letterhead?.logo_ppn_data ?? null,
    logo_non_ppn_data: letterhead?.logo_non_ppn_data ?? null,
    logo_ppn_is_banner: letterhead?.logo_ppn_is_banner ?? false,
    logo_non_ppn_is_banner: letterhead?.logo_non_ppn_is_banner ?? false,
  };
}

export async function getBranchLetterhead(branchId: string): Promise<BranchLetterheadRow | null> {
  const { data, error } = await supabase.from("branch_letterhead").select("*").eq("branch_id", branchId).maybeSingle();
  if (error) throw error;
  return (data as BranchLetterheadRow | null) ?? null;
}

/** Info kontak cabang yang tampil di kop surat -- kolom tabel `branches` (RLS: hanya super_admin yang boleh mengubah). */
export async function saveBranchInfo(
  branchId: string,
  input: { address: string; phone: string; email: string; signerName: string },
) {
  const { error } = await supabase
    .from("branches")
    .update({
      address: input.address.trim() || null,
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      signer_name: input.signerName.trim() || null,
    })
    .eq("id", branchId);
  if (error) throw error;
}

/**
 * Nama toko + logo + (khusus kop PPN) alamat/telepon/email cabang -- tabel
 * `branch_letterhead`, 1 baris per cabang. Field `*Ppn` kosong = kop PPN
 * memakai data non-PPN (kolom di `branches`).
 */
export async function saveBranchLetterhead(
  branchId: string,
  input: {
    storeName: string;
    storeNamePpn: string;
    addressPpn: string;
    phonePpn: string;
    emailPpn: string;
    logoPpnData: string | null;
    logoNonPpnData: string | null;
    logoPpnIsBanner: boolean;
    logoNonPpnIsBanner: boolean;
  },
  updatedBy: string,
) {
  const { error } = await supabase.from("branch_letterhead").upsert(
    {
      branch_id: branchId,
      store_name: input.storeName.trim() || null,
      store_name_ppn: input.storeNamePpn.trim() || null,
      address_ppn: input.addressPpn.trim() || null,
      phone_ppn: input.phonePpn.trim() || null,
      email_ppn: input.emailPpn.trim() || null,
      logo_ppn_data: input.logoPpnData,
      logo_ppn_is_banner: input.logoPpnData ? input.logoPpnIsBanner : false,
      logo_non_ppn_is_banner: input.logoNonPpnData ? input.logoNonPpnIsBanner : false,
      logo_non_ppn_data: input.logoNonPpnData,
      updated_by: updatedBy,
    },
    { onConflict: "branch_id" },
  );
  if (error) throw error;
}

export async function listBranches(): Promise<BranchRow[]> {
  const { data, error } = await supabase.from("branches").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as BranchRow[];
}

// ---------------------------------------------------------------------
// Catalog (products + active prices), branch-scoped
// ---------------------------------------------------------------------
// 2026-09: SEBELUMNYA 2 query -- ambil semua produk, terus ambil harga
// pakai `.in('product_id', [...ratusan UUID...])`. Buat ~800 produk,
// itu ngirim query string RAKSASA dan kerasa lambat banget dimuat.
// Sekarang 1 query lewat RPC `get_active_catalog_for_branch` yang join
// langsung di database.
// 2026-09: RPC sekarang balikin 1 baris per PRODUK (harga digabung
// jadi 1 kolom JSON), bukan lagi 1 baris per kombinasi produk-tier --
// versi lama itu buat ~795 produk x ~4 tier = ~3180 baris, kepotong
// limit default 1000 baris/response Supabase, jadi cuma ~250 produk
// UNIK yang kebaca. Lihat migration fix-catalog-rpc-one-row-per-product.sql.
type CatalogRpcRow = { product_id: string; name: string; sku: string | null; brand: string | null; prices: Record<string, number> | null };

export async function listCatalog(branchId: string): Promise<Product[]> {
  const { data, error } = await supabase.rpc("get_active_catalog_for_branch", { p_branch_id: branchId });
  if (error) throw error;

  const rows = (data ?? []) as CatalogRpcRow[];
  return rows
    .map((row) => {
      const byTier: Record<PriceType, number> = { net: 0, reseller: 0, special: 0 };
      for (const tier of Object.keys(PRICE_TIER_DB_KEY) as PriceType[]) {
        const dbKey = PRICE_TIER_DB_KEY[tier];
        const amount = row.prices?.[dbKey];
        if (amount != null) byTier[tier] = Number(amount);
      }
      return { id: row.product_id, name: row.name, sku: row.sku ?? "", brand: row.brand ?? "", prices: byTier };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
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
 * Triggers the price-list sync job — lewat Next.js API route
 * app/api/quote-builder/sync-price-list/route.ts (bukan Supabase Edge
 * Function — diganti 2026-09 biar deploy-nya cukup commit ke GitHub,
 * gak perlu `supabase functions deploy`/CLI). Route itu yang baca
 * Google Sheet cabang (via Apps Script Web App, lihat
 * sync-price-list.gs) dan nulis products/product_prices/sync_batches
 * pakai service role key (client tidak punya insert policy ke tabel
 * itu — lihat 001_quote_builder_schema.sql).
 */
export async function triggerManualSync(branchId: string) {
  const res = await fetch("/api/quote-builder/sync-price-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branchId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Sync gagal (HTTP ${res.status})`);
  return data as {
    batchId: string;
    productCount: number;
    status: string;
    totalRows: number;
    rowsWithSkuCount: number;
    duplicateSkuCount: number;
    rowsWithoutSkuCount: number;
    duplicateNoSkuCount: number;
  };
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
    // 2026-09: super_admin sekarang juga memakai fungsi ini (daftar per
    // cabang terpilih). RLS membolehkan super_admin melihat baris
    // soft-deleted, jadi filter harus di level app -- lihat catatan di
    // listAllQuotes() di bawah.
    .is("deleted_at", null)
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

/**
 * super_admin only — branch filter omitted to see every branch.
 *
 * 2026-09: super_admin bisa lihat baris yang soft-deleted lewat RLS
 * (sengaja, biar bisa direstore -- lihat komentar policy quotes_select
 * di 001_quote_builder_schema.sql), TAPI daftar aktif "Daftar
 * Penawaran" harus filter itu di level app, bukan di RLS -- exact
 * catatan yang ada di migration itu sendiri. Tanpa filter ini,
 * penawaran yang sudah dihapus (soft-delete) muncul lagi di daftar
 * untuk super_admin.
 */
export async function listAllQuotes(): Promise<QuoteWithTotal[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select("*, quote_alternatives(*, quote_items(*))")
    .is("deleted_at", null)
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
    /** Alamat pelanggan (tercetak di bawah nama pelanggan). undefined = tidak diubah. Ditulis terpisah dari RPC save_quote_full. */
    clientAddress?: string;
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

  if (input.clientAddress !== undefined) {
    const { error: addressError } = await supabase
      .from("quotes")
      .update({ client_address: input.clientAddress.trim() || null })
      .eq("id", quoteId);
    if (addressError) {
      throw new Error(
        /client_address|schema cache|column/i.test(addressError.message)
          ? `${addressError.message} — jalankan migration client_address di Supabase.`
          : addressError.message,
      );
    }
  }
}

/** QuoteRow + alamat pelanggan (kolom `quotes.client_address`, migration 20260921000003). Opsional supaya kode tetap jalan sebelum migration dijalankan. */
export type QuoteWithAddress = QuoteRow & { client_address?: string | null };

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
    clientAddress: (full.quote as QuoteWithAddress).client_address ?? undefined,
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

/** Jumlah item per template (buat kolom "Item" di daftar template). Hasil: { [templateId]: jumlah }. */
export async function getTemplateItemCounts(templateIds: string[]): Promise<Record<string, number>> {
  if (templateIds.length === 0) return {};
  const { data, error } = await supabase.from("template_items").select("template_id").in("template_id", templateIds);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ template_id: string }>) counts[row.template_id] = (counts[row.template_id] ?? 0) + 1;
  return counts;
}

export async function updateTemplate(templateId: string, input: { name: string; description: string }) {
  const { error } = await supabase
    .from("templates")
    .update({ name: input.name.trim(), description: input.description.trim() || null })
    .eq("id", templateId);
  if (error) throw error;
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

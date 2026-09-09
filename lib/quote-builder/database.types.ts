/**
 * Hand-written row types mirroring 001_quote_builder_schema.sql.
 * If you generate real types later via `supabase gen types typescript`,
 * swap this file for the generated one — the shapes should match closely
 * since column names here were taken directly from the migration.
 */

export type UserRole = "super_admin" | "admin" | "kasir" | "gudang" | "teknisi";
export type QuoteStatus = "draft" | "in_review" | "confirmed" | "needs_revision" | "sent";
export type VatMode = "included" | "add" | "none";
export type PriceSource = "list" | "manual";

export type BranchRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  signer_name: string | null;
  logo_path: string | null;
};

export type ProfileRow = {
  id: string;
  role: UserRole;
  branch_id: string | null;
  display_name: string | null;
};

export type ProductRow = {
  id: string;
  branch_id: string;
  sku: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  is_active: boolean;
  source_updated_at: string | null;
};

export type ActiveProductPriceRow = {
  product_id: string;
  price_tier: string;
  amount: number;
  valid_from: string;
};

export type SyncBatchRow = {
  id: string;
  branch_id: string;
  source_type: string;
  status: "running" | "success" | "failed" | "partial";
  source_version: string | null;
  product_count: number | null;
  error_summary: string | null;
  triggered_by: string | null;
  started_at: string;
  finished_at: string | null;
};

export type QuoteRow = {
  id: string;
  branch_id: string;
  internal_code: string | null;
  client_name: string;
  project_name: string;
  quote_date: string;
  valid_until: string | null;
  status: QuoteStatus;
  price_locked_at: string | null;
  deleted_at: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteAlternativeRow = {
  id: string;
  quote_id: string;
  sort_order: number;
  title: string;
  description: string | null;
  discount_pct: number;
  vat_mode: VatMode;
  use_package_price: boolean;
  package_price: number | null;
  include_in_grand_total: boolean;
};

export type QuoteItemRow = {
  id: string;
  alternative_id: string;
  sort_order: number;
  product_id: string | null;
  product_name_snapshot: string;
  sku_snapshot: string | null;
  brand_snapshot: string | null;
  qty: number;
  price_source: PriceSource;
  price_tier_used: string | null;
  unit_price_snapshot: number;
  manual_unit_price: number | null;
};

export type QuoteNoteRow = {
  id: string;
  quote_id: string;
  sort_order: number;
  text: string;
};

export type TemplateRow = {
  id: string;
  branch_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_at: string;
};

export type TemplateItemRow = {
  id: string;
  template_id: string;
  sort_order: number;
  product_id: string;
  qty: number;
};

export type DefaultNoteRow = {
  id: string;
  sort_order: number;
  text: string;
  is_active: boolean;
  updated_by: string | null;
  updated_at: string;
};

// Minimal Database type so `createClient<Database>()` gets some structure.
// Not exhaustive (Row/Insert/Update all collapsed to the same shape) — good
// enough for editor autocomplete without hand-maintaining three variants
// per table. Replace with `supabase gen types typescript` output when the
// project is live for full accuracy (defaults, nullability on insert, etc).
type Table<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      branches: Table<BranchRow>;
      profiles: Table<ProfileRow>;
      products: Table<ProductRow>;
      sync_batches: Table<SyncBatchRow>;
      quotes: Table<QuoteRow>;
      quote_alternatives: Table<QuoteAlternativeRow>;
      quote_items: Table<QuoteItemRow>;
      quote_notes: Table<QuoteNoteRow>;
      templates: Table<TemplateRow>;
      template_items: Table<TemplateItemRow>;
      default_notes: Table<DefaultNoteRow>;
    };
    Views: {
      active_product_prices: { Row: ActiveProductPriceRow; Relationships: [] };
    };
    Functions: {
      save_quote_full: {
        Args: {
          p_quote_id: string;
          p_client_name: string;
          p_project_name: string;
          p_quote_date: string;
          p_valid_until: string | null;
          p_alternatives: unknown;
          p_notes: unknown;
        };
        Returns: void;
      };
      apply_template_to_alternative: {
        Args: {
          p_alternative_id: string;
          p_template_id: string;
          p_price_tier: string;
          p_mode: string;
        };
        Returns: void;
      };
    };
  };
};

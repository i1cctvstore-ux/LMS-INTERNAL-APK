import { createClient } from "@/lib/supabase/client";

// ============================================================
// Types
// ============================================================
export type OpnameStatus = "draft" | "locked";
export type OpnameScope = "ALL" | string[];

export interface OpnameSession {
  id: string;
  branch_id: string;
  branch_nama?: string; // joined, for display
  tanggal: string; // YYYY-MM-DD
  scope: OpnameScope;
  status: OpnameStatus;
  created_by_name: string | null;
  updated_by_name: string | null;
  updated_at: string;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
}

export interface OpnameItem {
  id: string;
  session_id: string;
  product_id: string | null;
  kategori: string;
  nama: string;
  saldo_snapshot: number;
  real: number | null;
}

export interface OpnameItemStatus {
  selisih: number | null;
  checked: boolean;
  skip: boolean;
}

// ============================================================
// Shared helpers (mirror the mockup's computeStatus logic)
// ============================================================
export function computeStatus(item: OpnameItem): OpnameItemStatus {
  if (item.saldo_snapshot === 0) return { selisih: 0, checked: true, skip: true };
  if (item.real === null || item.real === undefined) {
    return { selisih: null, checked: false, skip: false };
  }
  const selisih = item.real - item.saldo_snapshot;
  return { selisih, checked: selisih === 0, skip: false };
}

export function sessionProgress(items: OpnameItem[]) {
  const total = items.length;
  const checked = items.filter((it) => computeStatus(it).checked).length;
  return { checked, total };
}

export function scopeLabel(scope: OpnameScope): string {
  return scope === "ALL" ? "Semua Kategori" : scope.join(", ");
}

// ============================================================
// Reads
// ============================================================

/** branchId = null artinya "semua cabang" (hanya berlaku untuk super_admin — RLS tetap membatasi admin cabang) */
export async function listSessions(branchId: string | null): Promise<OpnameSession[]> {
  const supabase = createClient();
  let query = supabase
    .from("stock_opname_sessions")
    .select(
      "id, branch_id, tanggal, scope, status, created_by_name, updated_by_name, updated_at, confirmed_by_name, confirmed_at, branches(name)"
    )
    .order("tanggal", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...row,
    branch_nama: row.branches?.name,
  }));
}

export async function getSessionDetail(
  sessionId: string
): Promise<{ session: OpnameSession; items: OpnameItem[] }> {
  const supabase = createClient();

  const { data: session, error: sessionErr } = await supabase
    .from("stock_opname_sessions")
    .select(
      "id, branch_id, tanggal, scope, status, created_by_name, updated_by_name, updated_at, confirmed_by_name, confirmed_at, branches(name)"
    )
    .eq("id", sessionId)
    .single();
  if (sessionErr) throw sessionErr;

  const { data: items, error: itemsErr } = await supabase
    .from("stock_opname_items")
    .select("id, session_id, product_id, kategori, nama, saldo_snapshot, real")
    .eq("session_id", sessionId)
    .order("nama", { ascending: true });
  if (itemsErr) throw itemsErr;

  return {
    session: { ...(session as any), branch_nama: (session as any).branches?.name },
    items: items ?? [],
  };
}

/** Daftar kategori master, untuk sheet "Pilih Kategori" saat opname baru & filter kategori di halaman detail. */
export async function listCatalogCategories(): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("service_products")
    .select("kategori")
    .not("kategori", "is", null);
  if (error) throw error;
  const set = new Set<string>((data ?? []).map((r: any) => r.kategori).filter(Boolean));
  return [...set].sort();
}

// ============================================================
// Writes
// ============================================================

/**
 * Membuat sesi baru + membekukan (snapshot) saldo saat ini via RPC
 * `stock_opname_create_session`. Saldo TIDAK berubah lagi setelah ini,
 * walaupun stok live (product_stock) terus disync Zoho/Accurate.
 */
export async function createSession(params: {
  branchId: string;
  scope: OpnameScope;
  userId: string;
  userName: string;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("stock_opname_create_session", {
    p_branch_id: params.branchId,
    p_scope: params.scope === "ALL" ? "ALL" : params.scope,
    p_user_id: params.userId,
    p_user_name: params.userName,
  });
  if (error) throw error;
  return data as string;
}

/** Update kolom "real" untuk satu item. RLS otomatis menolak kalau sesi sudah locked & bukan super_admin. */
export async function updateItemReal(itemId: string, value: number | null): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stock_opname_items")
    .update({ real: value })
    .eq("id", itemId);
  if (error) throw error;
}

/** Konfirmasi sesi (draft -> locked). Bisa dipanggil admin cabang maupun super_admin. */
export async function confirmSession(params: {
  sessionId: string;
  userId: string;
  userName: string;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stock_opname_sessions")
    .update({
      status: "locked",
      confirmed_by: params.userId,
      confirmed_by_name: params.userName,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", params.sessionId);
  if (error) throw error;
}

/**
 * Buka kunci sesi (locked -> draft). HANYA super_admin — RLS akan menolak
 * kalau dipanggil oleh admin biasa (opname_sessions_update policy).
 */
export async function revertSession(params: {
  sessionId: string;
  userId: string;
  userName: string;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stock_opname_sessions")
    .update({
      status: "draft",
      reverted_by: params.userId,
      reverted_by_name: params.userName,
      reverted_at: new Date().toISOString(),
      confirmed_by: null,
      confirmed_by_name: null,
      confirmed_at: null,
    })
    .eq("id", params.sessionId);
  if (error) throw error;
}

import { createClient } from '@/lib/supabase/client'

// =====================================================
// Data layer buat fitur Transfer/Konsinyasi Stok Antar Cabang.
// Pola sama persis kaya lib/stok/api.ts yang sudah ada — client-side
// Supabase call, dilindungi RLS (bukan admin/service-role).
// =====================================================

export type TransferRow = {
  id: string
  fromBranchId: string
  fromBranchName: string
  toBranchId: string
  toBranchName: string
  productId: string
  sku: string
  productName: string
  qty: number
  note: string | null
  createdAt: string
  createdByEmail: string | null
}

// Daftar cabang buat dropdown asal/tujuan — pakai tabel branches yang
// sudah ada, gak perlu tabel baru.
export async function loadBranchesForTransfer(): Promise<{ id: string; name: string }[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('branches').select('id, name').order('name')
  if (error) throw new Error(error.message)
  return (data || []).map((b: any) => ({ id: b.id, name: b.name }))
}

// Cari produk buat dropdown (autocomplete) di form transfer — mirip
// searchProductsForMapping yang sudah ada di lib/stok/api.ts.
export async function searchProductsForTransfer(
  query: string,
): Promise<{ id: string; sku: string; name: string }[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('service_products')
    .select('id, sku, name')
    .or(`sku.ilike.%${query}%,name.ilike.%${query}%`)
    .limit(20)
  if (error) throw new Error(error.message)
  return (data || []).map((p: any) => ({ id: p.id, sku: p.sku || '', name: p.name }))
}

// Catat transfer baru — 1 baris = 1 kali kirim barang dari 1 cabang ke
// 1 cabang lain untuk 1 produk. Kalau mau kirim banyak produk sekaligus,
// panggil fungsi ini berkali-kali (1 per produk) dari sisi UI.
export async function createStockTransfer(params: {
  fromBranchId: string
  toBranchId: string
  productId: string
  qty: number
  note?: string
}): Promise<void> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('stock_transfers').insert({
    from_branch_id: params.fromBranchId,
    to_branch_id: params.toBranchId,
    product_id: params.productId,
    qty: params.qty,
    note: params.note || null,
    created_by: user?.id || null,
  })
  if (error) throw new Error(error.message)
}

// Riwayat transfer, terbaru duluan — buat ditampilin di tabel/list.
export async function loadTransferHistory(limitCount = 100): Promise<TransferRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stock_transfers')
    .select(
      `id, qty, note, created_at,
       from_branch:branches!stock_transfers_from_branch_id_fkey(id, name),
       to_branch:branches!stock_transfers_to_branch_id_fkey(id, name),
       product:service_products(id, sku, name),
       creator:profiles!stock_transfers_created_by_fkey(email)`,
    )
    .order('created_at', { ascending: false })
    .limit(limitCount)
  if (error) throw new Error(error.message)

  return (data || []).map((r: any) => ({
    id: r.id,
    fromBranchId: r.from_branch?.id || '',
    fromBranchName: r.from_branch?.name || '(cabang terhapus)',
    toBranchId: r.to_branch?.id || '',
    toBranchName: r.to_branch?.name || '(cabang terhapus)',
    productId: r.product?.id || '',
    sku: r.product?.sku || '',
    productName: r.product?.name || '(produk terhapus)',
    qty: Number(r.qty) || 0,
    note: r.note,
    createdAt: r.created_at,
    createdByEmail: r.creator?.email || null,
  }))
}

// Saldo "-K" per cabang: Map<branchId, Map<productId, qty>> — dipakai
// buat nyuntikkan kolom tambahan di tabel Stok Cabang yang sudah ada.
export async function loadTransferBalanceMatrix(): Promise<Map<string, Map<string, number>>> {
  const supabase = createClient()
  const rows: { branch_id: string; product_id: string; balance_qty: number }[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('stock_transfer_balance')
      .select('branch_id, product_id, balance_qty')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...((data || []) as any[]))
    if (!data || data.length < PAGE) break
    from += PAGE
  }

  const matrix = new Map<string, Map<string, number>>()
  rows.forEach((r) => {
    if (!matrix.has(r.branch_id)) matrix.set(r.branch_id, new Map())
    matrix.get(r.branch_id)!.set(r.product_id, Number(r.balance_qty) || 0)
  })
  return matrix
}

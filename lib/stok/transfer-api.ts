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

// Saldo "-K" per cabang: Map<branchId, Map<productId, qty>> — GABUNGAN
// dari 2 sumber: (1) stock_transfer_balance = transfer manual antar
// cabang yang dicatat lewat form Transfer Stok, dan (2)
// product_stock_konsi = item konsinyasi "(K)" yang Accurate sendiri
// udah catat terpisah (diisi otomatis lewat sync, bukan input manual).
// Dua-duanya dijumlah jadi 1 angka yang ditampilin di UI.
export async function loadTransferBalanceMatrix(): Promise<Map<string, Map<string, number>>> {
  const supabase = createClient()
  const matrix = new Map<string, Map<string, number>>()

  function addToMatrix(branchId: string, productId: string, qty: number) {
    if (!matrix.has(branchId)) matrix.set(branchId, new Map())
    const branchMap = matrix.get(branchId)!
    branchMap.set(productId, (branchMap.get(productId) || 0) + qty)
  }

  const PAGE = 1000

  // Sumber 1: transfer manual antar cabang.
  {
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('stock_transfer_balance')
        .select('branch_id, product_id, balance_qty')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      ;(data || []).forEach((r: any) => addToMatrix(r.branch_id, r.product_id, Number(r.balance_qty) || 0))
      if (!data || data.length < PAGE) break
      from += PAGE
    }
  }

  // Sumber 2: item konsinyasi "(K)" dari Accurate (lihat
  // lib/stok/accurate-sync.ts — stripKonsiSuffix).
  {
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('product_stock_konsi')
        .select('branch_id, product_id, qty_on_hand')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      ;(data || []).forEach((r: any) => addToMatrix(r.branch_id, r.product_id, Number(r.qty_on_hand) || 0))
      if (!data || data.length < PAGE) break
      from += PAGE
    }
  }

  return matrix
}

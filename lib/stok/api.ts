import { createClient } from '@/lib/supabase/client'

export type StockRow = {
  productId: string
  sku: string
  name: string
  qty: number
  updatedAt: string | null
}

export type SyncLogRow = {
  id: string
  source: 'zoho' | 'accurate'
  triggeredBy: 'manual' | 'cron'
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'success' | 'error'
  itemsUpdated: number
  itemsSkipped: number
  errorMessage: string | null
}

// Ambil stok per cabang, lewat paging (jumlah produk sudah pernah lebih
// dari 1000 — sama seperti perbaikan yang sama di lib/service/api.ts).
export async function loadStockForBranch(branchId: string): Promise<StockRow[]> {
  const supabase = createClient()
  const rows: StockRow[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('product_stock')
      .select('product_id, qty, updated_at, service_products(sku, name)')
      .eq('branch_id', branchId)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    ;(data || []).forEach((r: any) => {
      rows.push({
        productId: r.product_id,
        sku: r.service_products?.sku || '',
        name: r.service_products?.name || '(produk terhapus)',
        qty: Number(r.qty) || 0,
        updatedAt: r.updated_at,
      })
    })
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return rows
}

export async function loadSyncLog(branchId: string, limit = 20): Promise<SyncLogRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stock_sync_log')
    .select('*')
    .eq('branch_id', branchId)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data || []).map((r: any) => ({
    id: r.id,
    source: r.source,
    triggeredBy: r.triggered_by,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    itemsUpdated: r.items_updated,
    itemsSkipped: r.items_skipped,
    errorMessage: r.error_message,
  }))
}

export async function fetchBranchName(branchId: string): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.from('branches').select('name').eq('id', branchId).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.name || ''
}

// Cabang mana yang sudah tersambung ke sistem stok eksternal apa —
// dipakai buat nentuin tombol sync mana yang ditampilkan/di-nonaktifkan.
// Kalau nanti Accurate Online sudah jalan (Jakarta/Purwokerto), tinggal
// tambah entri di sini.
export const BRANCH_STOCK_SOURCE: Record<string, 'zoho' | 'accurate' | null> = {
  solo: 'zoho',
  bali: 'zoho',
  jakarta: 'accurate',
  purwokerto: 'accurate',
}

export function stockSourceForBranch(branchName: string): 'zoho' | 'accurate' | null {
  return BRANCH_STOCK_SOURCE[branchName.trim().toLowerCase()] ?? null
}

export async function triggerZohoSync(branchName: string): Promise<{ results: any[]; message?: string }> {
  const res = await fetch('/api/stok/sync-zoho', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branchName }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.message || 'Gagal menjalankan sinkronisasi.')
  return body
}

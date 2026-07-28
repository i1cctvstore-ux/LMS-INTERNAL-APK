import { createClient } from '@/lib/supabase/client'

export type StockRow = {
  productId: string
  sku: string
  name: string
  qty: number
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
      .select('product_id, qty_on_hand, service_products(sku, name)')
      .eq('branch_id', branchId)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    ;(data || []).forEach((r: any) => {
      rows.push({
        productId: r.product_id,
        sku: r.service_products?.sku || '',
        name: r.service_products?.name || '(produk terhapus)',
        qty: Number(r.qty_on_hand) || 0,
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
// dicocokkan lewat ID cabang (bukan nama, karena nama cabang di tabel
// branches ternyata gak konsisten/rapi — ada yang isinya "solo cctv
// cabang bali" misalnya, jadi rawan salah kalau dicocokin dari nama).
// Dipakai buat nentuin tombol sync mana yang ditampilkan/di-nonaktifkan.
// Kalau nanti Accurate Online sudah jalan (Jakarta/Purwokerto), tinggal
// tambah entri id cabangnya di sini.
export const BRANCH_STOCK_SOURCE: Record<string, 'zoho' | 'accurate' | null> = {
  'ff24cbd3-f11a-4f12-b658-88ff40b1a8e3': 'zoho', // Solo
  '9b4c7834-2e20-4416-8163-2faff97294c0': 'zoho', // Bali
}

export function stockSourceForBranch(branchId: string | null): 'zoho' | 'accurate' | null {
  if (!branchId) return null
  return BRANCH_STOCK_SOURCE[branchId] ?? null
}

export async function triggerZohoSync(branchId: string): Promise<{ results: any[]; message?: string }> {
  const res = await fetch('/api/stok/sync-zoho', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branchId }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.message || 'Gagal menjalankan sinkronisasi.')
  return body
}

// =====================================================
// Stok Supplier — snapshot ketersediaan barang per supplier, di-update
// manual lewat paste massal (bukan API otomatis seperti Zoho/Accurate).
// =====================================================

function normalizeSku(s: string): string {
  return (s || '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
}
function normalizeName(s: string): string {
  return (s || '').trim().toLowerCase()
}

export type SupplierStockResult = {
  productName: string
  productSku: string
  supplierName: string
  qty: number
  updatedAt: string | null
}

// Cari 1 produk (lewat nama atau SKU) lalu tampilkan ketersediaannya di
// semua supplier yang pernah di-upload datanya — sesuai alur "Cari 1
// tipe untuk lihat ketersediaan di tiap supplier" di halaman Cek Stok.
export async function searchSupplierStock(query: string): Promise<SupplierStockResult[]> {
  const q = query.trim()
  if (!q) return []
  const supabase = createClient()

  const { data: products, error: productErr } = await supabase
    .from('service_products')
    .select('id, sku, name')
    .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
    .limit(20)
  if (productErr) throw new Error(productErr.message)
  if (!products || products.length === 0) return []

  const productIds = products.map((p: any) => p.id)
  const { data: stockRows, error: stockErr } = await supabase
    .from('supplier_stock')
    .select('product_id, qty, updated_at, service_suppliers(name), service_products(sku, name)')
    .in('product_id', productIds)
  if (stockErr) throw new Error(stockErr.message)

  return (stockRows || [])
    .map((r: any) => ({
      productName: r.service_products?.name || '',
      productSku: r.service_products?.sku || '',
      supplierName: r.service_suppliers?.name || '',
      qty: Number(r.qty) || 0,
      updatedAt: r.updated_at,
    }))
    .sort((a, b) => b.qty - a.qty)
}

export type PasteResult = { itemsUpdated: number; itemsSkipped: number }

// Upload massal Stok Supplier: kolom SKU, Nama Supplier, Qty — bisa
// banyak supplier sekaligus dalam satu paste. Baris yang SKU atau nama
// supplier-nya belum ada di katalog produk/supplier akan dilewati
// (dihitung di itemsSkipped), TIDAK bikin baris lain ikut gagal.
export async function uploadSupplierStockPaste(
  rows: { sku: string; supplierName: string; qty: number }[],
): Promise<PasteResult> {
  const supabase = createClient()

  const [{ data: products, error: pErr }, { data: suppliers, error: sErr }] = await Promise.all([
    supabase.from('service_products').select('id, sku'),
    supabase.from('service_suppliers').select('id, name'),
  ])
  if (pErr) throw new Error(pErr.message)
  if (sErr) throw new Error(sErr.message)

  const productIdBySku = new Map<string, string>()
  ;(products || []).forEach((p: any) => productIdBySku.set(normalizeSku(p.sku), p.id))
  const supplierIdByName = new Map<string, string>()
  ;(suppliers || []).forEach((s: any) => supplierIdByName.set(normalizeName(s.name), s.id))

  let itemsUpdated = 0
  let itemsSkipped = 0
  const now = new Date().toISOString()
  const upsertRows: { supplier_id: string; product_id: string; qty: number; updated_at: string }[] = []

  rows.forEach((r) => {
    const productId = productIdBySku.get(normalizeSku(r.sku))
    const supplierId = supplierIdByName.get(normalizeName(r.supplierName))
    if (!productId || !supplierId) {
      itemsSkipped += 1
      return
    }
    upsertRows.push({ supplier_id: supplierId, product_id: productId, qty: r.qty, updated_at: now })
    itemsUpdated += 1
  })

  if (upsertRows.length) {
    const CHUNK = 300
    for (let i = 0; i < upsertRows.length; i += CHUNK) {
      const chunk = upsertRows.slice(i, i + CHUNK)
      const { error } = await supabase.from('supplier_stock').upsert(chunk, { onConflict: 'supplier_id,product_id' })
      if (error) throw new Error(error.message)
    }
  }

  const { error: logErr } = await supabase.from('stok_upload_log').insert({
    kind: 'stok_supplier',
    branch_id: null,
    items_updated: itemsUpdated,
    items_skipped: itemsSkipped,
  })
  if (logErr) throw new Error(logErr.message)

  return { itemsUpdated, itemsSkipped }
}

export type SupplierOption = { id: string; name: string }

export async function loadAllSuppliers(): Promise<SupplierOption[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('service_suppliers').select('id, name').order('name')
  if (error) throw new Error(error.message)
  return (data || []).map((s: any) => ({ id: s.id, name: s.name }))
}

// Tambah supplier cepat dari dalam modal Upload Stok Supplier (link
// "+ Supplier belum ada? Tambahkan di Master Data") — tetap nulis ke
// katalog supplier BERSAMA yang sama dipakai modul Servis.
export async function addSupplierQuick(name: string): Promise<SupplierOption> {
  const supabase = createClient()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Nama supplier tidak boleh kosong.')
  const { data, error } = await supabase.from('service_suppliers').insert({ name: trimmed }).select('id, name').single()
  if (error) throw new Error(error.message)
  return { id: data.id, name: data.name }
}

// Upload Stok Supplier lewat FILE (satu supplier per upload, dipilih
// dari dropdown — beda dari uploadSupplierStockPaste yang masih pakai
// kolom Nama Supplier per baris). Sebelum angka lama ditimpa, snapshot
// nilai lamanya disimpan ke stok_upload_log dulu supaya kelihatan di
// Riwayat.
export async function uploadSupplierStockFile(
  supplierId: string,
  rows: { sku: string; qty: number }[],
): Promise<PasteResult> {
  const supabase = createClient()

  const { data: products, error: pErr } = await supabase.from('service_products').select('id, sku')
  if (pErr) throw new Error(pErr.message)
  const productIdBySku = new Map<string, string>()
  ;(products || []).forEach((p: any) => productIdBySku.set(normalizeSku(p.sku), p.id))

  // Snapshot angka LAMA punya supplier ini, sebelum ditimpa.
  const { data: oldRows, error: oldErr } = await supabase
    .from('supplier_stock')
    .select('product_id, qty')
    .eq('supplier_id', supplierId)
  if (oldErr) throw new Error(oldErr.message)

  let itemsUpdated = 0
  let itemsSkipped = 0
  const now = new Date().toISOString()
  const upsertRows: { supplier_id: string; product_id: string; qty: number; updated_at: string }[] = []

  rows.forEach((r) => {
    const productId = productIdBySku.get(normalizeSku(r.sku))
    if (!productId) {
      itemsSkipped += 1
      return
    }
    upsertRows.push({ supplier_id: supplierId, product_id: productId, qty: r.qty, updated_at: now })
    itemsUpdated += 1
  })

  if (upsertRows.length) {
    const CHUNK = 300
    for (let i = 0; i < upsertRows.length; i += CHUNK) {
      const chunk = upsertRows.slice(i, i + CHUNK)
      const { error } = await supabase.from('supplier_stock').upsert(chunk, { onConflict: 'supplier_id,product_id' })
      if (error) throw new Error(error.message)
    }
  }

  const { error: logErr } = await supabase.from('stok_upload_log').insert({
    kind: 'stok_supplier',
    branch_id: null,
    supplier_id: supplierId,
    items_updated: itemsUpdated,
    items_skipped: itemsSkipped,
    snapshot: oldRows || [],
  })
  if (logErr) throw new Error(logErr.message)

  return { itemsUpdated, itemsSkipped }
}
// opname fisik). Cuma nulis ke product_stock cabang yang aktif.
export async function uploadBranchStockCorrection(
  branchId: string,
  rows: { sku: string; qty: number }[],
): Promise<PasteResult> {
  const supabase = createClient()

  const { data: products, error: pErr } = await supabase.from('service_products').select('id, sku')
  if (pErr) throw new Error(pErr.message)
  const productIdBySku = new Map<string, string>()
  ;(products || []).forEach((p: any) => productIdBySku.set(normalizeSku(p.sku), p.id))

  let itemsUpdated = 0
  let itemsSkipped = 0
  const upsertRows: { branch_id: string; product_id: string; qty_on_hand: number }[] = []

  rows.forEach((r) => {
    const productId = productIdBySku.get(normalizeSku(r.sku))
    if (!productId) {
      itemsSkipped += 1
      return
    }
    upsertRows.push({ branch_id: branchId, product_id: productId, qty_on_hand: Math.round(r.qty) })
    itemsUpdated += 1
  })

  if (upsertRows.length) {
    const CHUNK = 300
    for (let i = 0; i < upsertRows.length; i += CHUNK) {
      const chunk = upsertRows.slice(i, i + CHUNK)
      const { error } = await supabase.from('product_stock').upsert(chunk, { onConflict: 'branch_id,product_id' })
      if (error) throw new Error(error.message)
    }
  }

  const { error: logErr } = await supabase.from('stok_upload_log').insert({
    kind: 'stok_cabang',
    branch_id: branchId,
    items_updated: itemsUpdated,
    items_skipped: itemsSkipped,
  })
  if (logErr) throw new Error(logErr.message)

  return { itemsUpdated, itemsSkipped }
}

export type UploadLogRow = {
  id: string
  kind: 'stok_cabang' | 'stok_supplier'
  uploadedAt: string
  itemsUpdated: number
  itemsSkipped: number
}

export async function loadUploadLog(branchId: string, limit = 20): Promise<UploadLogRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stok_upload_log')
    .select('*')
    .or(`kind.eq.stok_supplier,branch_id.eq.${branchId}`)
    .order('uploaded_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data || []).map((r: any) => ({
    id: r.id,
    kind: r.kind,
    uploadedAt: r.uploaded_at,
    itemsUpdated: r.items_updated,
    itemsSkipped: r.items_skipped,
  }))
}

// =====================================================
// Tabel matriks Stok Cabang — semua cabang ditampilkan sekaligus jadi
// kolom, per produk. Angka yang ditampilkan = stok fisik (dari sync
// Zoho/Accurate) DIKURANGI barang yang lagi "ditahan" buat Claim Barang
// yang masih aktif (belum status Selesai) di cabang itu.
//
// Catatan RLS: Admin Cabang biasa (bukan super_admin) cuma bisa baca
// baris product_stock/service_claims di cabangnya sendiri — jadi kalau
// dia buka tabel ini, kolom cabang LAIN otomatis kosong (0), bukan
// error. Super Admin lihat semua kolom terisi penuh.
// =====================================================

export type BranchOption = { id: string; name: string }

export async function loadAllBranches(): Promise<BranchOption[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('branches').select('id, name').eq('active', true).order('name')
  if (error) throw new Error(error.message)
  return (data || []).map((b: any) => ({ id: b.id, name: b.name }))
}

export type MatrixProduct = {
  productId: string
  sku: string
  name: string
  kategori: string
  subjenis: string
}

export type StockMatrixData = {
  products: MatrixProduct[]
  // key: `${branchId}|${productId}` -> qty fisik dari product_stock
  physical: Record<string, number>
  // key: `${branchId}|${normalizedSku}` -> jumlah unit yang lagi ditahan servis
  held: Record<string, number>
}

export async function loadStockMatrix(): Promise<StockMatrixData> {
  const supabase = createClient()
  const PAGE = 1000

  async function fetchAllPaged(table: string, select: string, extra?: (q: any) => any) {
    const rows: any[] = []
    let from = 0
    while (true) {
      let q = supabase.from(table).select(select).range(from, from + PAGE - 1)
      if (extra) q = extra(q)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      rows.push(...(data || []))
      if (!data || data.length < PAGE) break
      from += PAGE
    }
    return rows
  }

  const [productRows, stockRows, claimRows] = await Promise.all([
    fetchAllPaged('service_products', 'id, sku, name, kategori, subjenis'),
    fetchAllPaged('product_stock', 'branch_id, product_id, qty_on_hand'),
    fetchAllPaged('service_claims', 'branch_id, produk_sku, status', (q) => q.neq('status', 'Selesai')),
  ])

  const physical: Record<string, number> = {}
  stockRows.forEach((r) => {
    physical[`${r.branch_id}|${r.product_id}`] = Number(r.qty_on_hand) || 0
  })

  const held: Record<string, number> = {}
  claimRows.forEach((c) => {
    if (!c.produk_sku || !c.branch_id) return
    const key = `${c.branch_id}|${normalizeSku(c.produk_sku)}`
    held[key] = (held[key] || 0) + 1
  })

  const products: MatrixProduct[] = productRows.map((p: any) => ({
    productId: p.id,
    sku: p.sku || '',
    name: p.name,
    kategori: p.kategori || '',
    subjenis: p.subjenis || '',
  }))

  return { products, physical, held }
}

// Dipakai UI buat nyocokin kunci `held` dengan cara normalisasi yang
// sama persis dengan yang dipakai pas nyusun map-nya di atas.
export { normalizeSku }

export async function loadLastSyncFreshness(): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stock_sync_log')
    .select('finished_at')
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.finished_at || null
}

export async function triggerZohoSyncAll(): Promise<{ results: any[]; message?: string }> {
  const res = await fetch('/api/stok/sync-zoho', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.message || 'Gagal menjalankan sinkronisasi.')
  return body
}

// Riwayat sekarang ditampilkan lintas cabang (gak terikat 1 cabang aktif
// lagi) — RLS tetap otomatis batasin Admin Cabang biasa cuma lihat
// baris cabangnya sendiri, Super Admin lihat semua.
export async function loadSyncLogAll(limit = 30): Promise<SyncLogRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stock_sync_log')
    .select('*')
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

export async function loadSupplierUploadLog(limit = 30): Promise<UploadLogRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stok_upload_log')
    .select('*')
    .eq('kind', 'stok_supplier')
    .order('uploaded_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data || []).map((r: any) => ({
    id: r.id,
    kind: r.kind,
    uploadedAt: r.uploaded_at,
    itemsUpdated: r.items_updated,
    itemsSkipped: r.items_skipped,
  }))
}

import { createClient } from '@/lib/supabase/client'

// =====================================================
// Tipe data
// =====================================================

export type StockProduct = {
  id: string
  sku: string
  name: string
  qtyOnHand: number
}

export type StockMovement = {
  id: string
  productId: string
  productName: string
  productSku: string
  qtyDelta: number
  type: 'masuk' | 'keluar_manual' | 'keluar_proyek' | 'koreksi'
  projectId: string | null
  note: string
  createdByName: string | null
  createdAt: string
}

export type SupplierAvailability = {
  supplierId: string
  supplierName: string
  supplierPhone: string
  qty: number
  price: number | null
  checkedAt: string
}

export type SupplierSnapshotHistoryRow = {
  id: string
  productId: string
  productName: string
  productSku: string
  supplierId: string
  supplierName: string
  qty: number
  price: number | null
  checkedAt: string
  createdByName: string | null
}

// =====================================================
// Stok Cabang
// =====================================================

// Daftar semua produk (katalog BERSAMA, semua cabang) + qty_on_hand
// KHUSUS cabang ini (dari tabel product_stock). Produk yang belum pernah
// ada transaksi stok di cabang ini otomatis dianggap qty 0.
export async function loadStockProducts(branchId: string): Promise<StockProduct[]> {
  const supabase = createClient()
  const [{ data: products, error: productsError }, { data: stockRows, error: stockError }] = await Promise.all([
    supabase.from('service_products').select('id, sku, name').order('name'),
    supabase.from('product_stock').select('product_id, qty_on_hand').eq('branch_id', branchId),
  ])
  if (productsError) throw new Error(productsError.message)
  if (stockError) throw new Error(stockError.message)

  const qtyByProduct = new Map<string, number>()
  for (const r of stockRows ?? []) qtyByProduct.set(r.product_id, r.qty_on_hand)

  return (products ?? []).map((r: any) => ({
    id: r.id,
    sku: r.sku || '',
    name: r.name,
    qtyOnHand: qtyByProduct.get(r.id) ?? 0,
  }))
}

// Riwayat stok masuk/keluar cabang ini (opsional difilter per produk).
export async function loadStockMovements(
  branchId: string,
  opts?: { productId?: string; limit?: number },
): Promise<StockMovement[]> {
  const supabase = createClient()
  let query = supabase
    .from('stock_movements')
    .select('*, product:service_products(name, sku), created_by:profiles(name)')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 200)
  if (opts?.productId) query = query.eq('product_id', opts.productId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({
    id: r.id,
    productId: r.product_id,
    productName: r.product?.name ?? '(produk dihapus)',
    productSku: r.product?.sku ?? '',
    qtyDelta: r.qty_delta,
    type: r.type,
    projectId: r.project_id,
    note: r.note || '',
    createdByName: r.created_by?.name ?? null,
    createdAt: r.created_at,
  }))
}

async function adjustQty(branchId: string, productId: string, delta: number): Promise<number> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('adjust_branch_product_stock', {
    p_branch_id: branchId,
    p_product_id: productId,
    p_delta: delta,
  })
  if (error) throw new Error(error.message)
  return data as number
}

// Stok masuk manual (mis. barang baru dibeli/diterima dari supplier).
export async function recordStockIn(
  branchId: string,
  productId: string,
  qty: number,
  note: string,
  userId?: string,
): Promise<void> {
  if (qty <= 0) throw new Error('Jumlah harus lebih dari 0.')
  const supabase = createClient()
  await adjustQty(branchId, productId, qty)
  const { error } = await supabase.from('stock_movements').insert({
    branch_id: branchId,
    product_id: productId,
    qty_delta: qty,
    type: 'masuk',
    note: note || null,
    created_by: userId,
  })
  if (error) throw new Error(error.message)
}

// Stok keluar manual (mis. rusak, hilang, dipakai internal) — beda dari
// keluar karena proyek (lihat recordProjectMaterial di bawah).
export async function recordStockOutManual(
  branchId: string,
  productId: string,
  qty: number,
  note: string,
  userId?: string,
): Promise<void> {
  if (qty <= 0) throw new Error('Jumlah harus lebih dari 0.')
  const supabase = createClient()
  await adjustQty(branchId, productId, -qty)
  const { error } = await supabase.from('stock_movements').insert({
    branch_id: branchId,
    product_id: productId,
    qty_delta: -qty,
    type: 'keluar_manual',
    note: note || null,
    created_by: userId,
  })
  if (error) throw new Error(error.message)
}

// =====================================================
// Integrasi ke Proyek — "Barang Terpakai"
// =====================================================

// Daftar barang yang sudah dicatat terpakai di sebuah proyek. Sengaja
// tidak punya tabel sendiri — cukup baca stock_movements yang
// project_id-nya cocok dan type = 'keluar_proyek'.
export async function loadProjectMaterials(projectId: string): Promise<StockMovement[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*, product:service_products(name, sku), created_by:profiles(name)')
    .eq('project_id', projectId)
    .eq('type', 'keluar_proyek')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({
    id: r.id,
    productId: r.product_id,
    productName: r.product?.name ?? '(produk dihapus)',
    productSku: r.product?.sku ?? '',
    qtyDelta: r.qty_delta,
    type: r.type,
    projectId: r.project_id,
    note: r.note || '',
    createdByName: r.created_by?.name ?? null,
    createdAt: r.created_at,
  }))
}

// Catat barang terpakai di sebuah proyek — otomatis mengurangi
// qty_on_hand produk itu di cabang proyek tsb.
export async function recordProjectMaterial(
  branchId: string,
  projectId: string,
  productId: string,
  qty: number,
  userId?: string,
): Promise<void> {
  if (qty <= 0) throw new Error('Jumlah harus lebih dari 0.')
  const supabase = createClient()
  await adjustQty(branchId, productId, -qty)
  const { error } = await supabase.from('stock_movements').insert({
    branch_id: branchId,
    product_id: productId,
    qty_delta: -qty,
    type: 'keluar_proyek',
    project_id: projectId,
    created_by: userId,
  })
  if (error) throw new Error(error.message)
}

// Batalkan satu entri "barang terpakai" — stok yang tadi dipotong
// dikembalikan lagi ke qty_on_hand.
export async function removeProjectMaterial(movementId: string): Promise<void> {
  const supabase = createClient()
  const { data: row, error: fetchError } = await supabase
    .from('stock_movements')
    .select('branch_id, product_id, qty_delta')
    .eq('id', movementId)
    .single()
  if (fetchError || !row) throw new Error(fetchError?.message || 'Data tidak ditemukan.')

  await adjustQty(row.branch_id, row.product_id, -row.qty_delta) // qty_delta negatif -> ini menambah balik

  const { error } = await supabase.from('stock_movements').delete().eq('id', movementId)
  if (error) throw new Error(error.message)
}

// =====================================================
// Stok Supplier
// =====================================================

// Ketersediaan TERKINI di tiap supplier buat 1 produk — snapshot paling
// baru per supplier (bukan seluruh riwayat).
export async function loadSupplierAvailability(
  branchId: string,
  productId: string,
): Promise<SupplierAvailability[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stock_supplier_snapshots')
    .select('supplier_id, qty, price, checked_at, supplier:service_suppliers(name, phone)')
    .eq('branch_id', branchId)
    .eq('product_id', productId)
    .order('checked_at', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  // Ambil snapshot PALING BARU per supplier saja.
  const seen = new Set<string>()
  const latest: SupplierAvailability[] = []
  for (const r of (data ?? []) as any[]) {
    if (seen.has(r.supplier_id)) continue
    seen.add(r.supplier_id)
    latest.push({
      supplierId: r.supplier_id,
      supplierName: r.supplier?.name ?? '(supplier dihapus)',
      supplierPhone: r.supplier?.phone ?? '',
      qty: r.qty,
      price: r.price,
      checkedAt: r.checked_at,
    })
  }
  return latest.sort((a, b) => b.qty - a.qty)
}

// Riwayat lengkap upload Stok Supplier (opsional difilter per produk).
export async function loadSupplierSnapshotHistory(
  branchId: string,
  opts?: { productId?: string; limit?: number },
): Promise<SupplierSnapshotHistoryRow[]> {
  const supabase = createClient()
  let query = supabase
    .from('stock_supplier_snapshots')
    .select(
      '*, product:service_products(name, sku), supplier:service_suppliers(name), created_by:profiles(name)',
    )
    .eq('branch_id', branchId)
    .order('checked_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 200)
  if (opts?.productId) query = query.eq('product_id', opts.productId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({
    id: r.id,
    productId: r.product_id,
    productName: r.product?.name ?? '(produk dihapus)',
    productSku: r.product?.sku ?? '',
    supplierId: r.supplier_id,
    supplierName: r.supplier?.name ?? '(supplier dihapus)',
    qty: r.qty,
    price: r.price,
    checkedAt: r.checked_at,
    createdByName: r.created_by?.name ?? null,
  }))
}

export type SupplierUploadRow = { sku: string; qty: number; price?: number }

// "Upload Stok" — paste banyak baris (SKU, Qty, Harga) sekaligus buat
// SATU supplier yang dipilih. Baris dengan SKU yang gak ketemu produknya
// otomatis dilewati (dilaporkan lewat notFoundSkus).
export async function uploadSupplierStock(
  branchId: string,
  supplierId: string,
  rows: SupplierUploadRow[],
  userId?: string,
): Promise<{ inserted: number; notFoundSkus: string[] }> {
  const supabase = createClient()

  const { data: products, error: productsError } = await supabase
    .from('service_products')
    .select('id, sku')
    .in(
      'sku',
      rows.map((r) => r.sku.trim()),
    )
  if (productsError) throw new Error(productsError.message)

  const skuToId = new Map<string, string>()
  for (const p of products ?? []) skuToId.set((p.sku || '').trim().toLowerCase(), p.id)

  const today = new Date().toISOString().slice(0, 10)
  const notFoundSkus: string[] = []
  const insertRows: Record<string, unknown>[] = []
  for (const r of rows) {
    const key = r.sku.trim().toLowerCase()
    const productId = skuToId.get(key)
    if (!productId) {
      notFoundSkus.push(r.sku.trim())
      continue
    }
    insertRows.push({
      branch_id: branchId,
      product_id: productId,
      supplier_id: supplierId,
      qty: r.qty,
      price: r.price ?? null,
      checked_at: today,
      created_by: userId,
    })
  }

  if (insertRows.length > 0) {
    // Dipecah per 300 baris — sama seperti pola import di modul Servis,
    // biar gak gagal kalau kamu paste ratusan baris sekaligus.
    const CHUNK = 300
    for (let i = 0; i < insertRows.length; i += CHUNK) {
      const { error } = await supabase.from('stock_supplier_snapshots').insert(insertRows.slice(i, i + CHUNK))
      if (error) throw new Error(error.message)
    }
  }

  return { inserted: insertRows.length, notFoundSkus }
}

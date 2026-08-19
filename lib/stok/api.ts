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
  branchName: string | null
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
    .select('*, branches(name)')
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
    branchName: r.branches?.name || null,
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
export const BRANCH_STOCK_SOURCE: Record<string, 'zoho' | 'accurate' | null> = {
  'ff24cbd3-f11a-4f12-b658-88ff40b1a8e3': 'zoho', // Solo
  '9b4c7834-2e20-4416-8163-2faff97294c0': 'zoho', // Bali
  '5ad7239f-a7dd-47be-9ba2-c5667a3f76b2': 'accurate', // Jakarta
  '4c97b2cb-cf88-4e13-84c0-2f2cb8d9b612': 'accurate', // Purwokerto
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

export async function triggerAccurateSync(branchId: string): Promise<{ results: any[]; message?: string }> {
  const res = await fetch('/api/stok/sync-accurate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branchId }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.message || 'Gagal menjalankan sinkronisasi Accurate.')
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

export type SupplierStockGudangEntry = { gudang: string; qty: number; updatedAt: string | null }
export type SupplierStockSupplierGroup = { supplierName: string; totalQty: number; gudangEntries: SupplierStockGudangEntry[] }
export type SupplierStockProductResult = {
  productId: string
  productName: string
  productSku: string
  kategori: string
  subjenis: string
  totalQty: number
  suppliers: SupplierStockSupplierGroup[]
}

// Normalisasi buat PENCARIAN — buang SEMUA spasi & tanda baca, biar
// "76 d0t" bisa ketemu produk yang namanya "76d0t" (atau sebaliknya).
// Supabase ILIKE gak bisa nyamain ini langsung dari server (gak bisa
// manggil regexp_replace ke kolom lewat filter biasa), jadi pencarian
// di bawah ini FILTER-nya dipindah ke sisi aplikasi (fetch semua
// produk yang punya data supplier, baru dicocokin di sini).
function normalizeForSearch(s: string): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '')
}

// Cari produk (lewat nama atau SKU) lalu tampilkan ketersediaannya di
// semua supplier yang pernah di-upload datanya, DIKELOMPOKKAN per
// produk -> per supplier -> per gudang (kalau supplier itu ngasih
// breakdown gudang; kalau cuma 1 angka flat, gudang-nya bakal string
// kosong '' dan cuma tampil 1 baris).
export async function searchSupplierStock(query: string): Promise<SupplierStockProductResult[]> {
  const q = query.trim()
  if (!q) return []
  const supabase = createClient()
  const qNorm = normalizeForSearch(q)

  // PENTING: pakai supplier_stock!inner biar query ini CUMA nyari di
  // antara produk yang BENERAN punya data supplier (bukan seluruh
  // katalog service_products) — set ini jauh lebih kecil dari seluruh
  // katalog, jadi aman di-fetch semua (paging) lalu difilter di sisi
  // aplikasi, biar pencarian gak sensitif beda spasi/tanda baca.
  const allRows: any[] = []
  {
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('service_products')
        .select('id, sku, name, kategori, subjenis, supplier_stock!inner(gudang, qty, updated_at, service_suppliers(name))')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      allRows.push(...(data || []))
      if (!data || data.length < PAGE) break
      from += PAGE
    }
  }

  const rows = allRows
    .filter((p) => normalizeForSearch(p.name).includes(qNorm) || normalizeForSearch(p.sku).includes(qNorm))
    .slice(0, 100)
  if (rows.length === 0) return []

  const results: SupplierStockProductResult[] = rows.map((p: any) => {
    const bySupplier = new Map<string, SupplierStockSupplierGroup>()
    ;(p.supplier_stock || []).forEach((r: any) => {
      const supplierName = r.service_suppliers?.name || '(supplier tidak diketahui)'
      const group = bySupplier.get(supplierName) || { supplierName, totalQty: 0, gudangEntries: [] }
      group.gudangEntries.push({ gudang: r.gudang || '', qty: Number(r.qty) || 0, updatedAt: r.updated_at })
      group.totalQty += Number(r.qty) || 0
      bySupplier.set(supplierName, group)
    })
    // Supplier yang stoknya 0 sengaja DISEMBUNYIIN dari hasil — kalau 1
    // produk ada di beberapa supplier dan salah satunya lagi kosong,
    // yang ditampilin cuma supplier yang beneran ada stoknya. totalQty
    // produk gak berubah (supplier yang 0 emang gak nyumbang apa-apa
    // ke total), cuma baris supplier-nya aja yang gak dimunculin.
    const suppliers = Array.from(bySupplier.values())
      .filter((s) => s.totalQty > 0)
      .sort((a, b) => b.totalQty - a.totalQty)
    const totalQty = suppliers.reduce((sum, s) => sum + s.totalQty, 0)
    return {
      productId: p.id,
      productName: p.name,
      productSku: p.sku || '',
      kategori: p.kategori || '',
      subjenis: p.subjenis || '',
      totalQty,
      suppliers,
    }
  })

  // Produk yang SEMUA supplier-nya kebetulan 0 (abis di-filter di atas)
  // gak ada gunanya ditampilin sebagai kartu kosong — dilewatin aja.
  return results.filter((r) => r.suppliers.length > 0).sort((a, b) => b.totalQty - a.totalQty)
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
export type ResolvedSupplierRow = { sku: string; productId: string }
export type UnmappedSupplierRow = { sku: string; namaBarang?: string }
export type ResolveResult = { mapped: ResolvedSupplierRow[]; unmapped: UnmappedSupplierRow[] }

// Cek tiap SKU (SUDAH DI-DEDUPE, satu per SKU — qty & gudang gak
// relevan buat langkah pencocokan ini) terhadap pemetaan kode supplier
// yang SUDAH ADA (supplier_sku_mapping) — kalau belum ada pemetaannya,
// dicoba juga cocok langsung ke SKU internal, lalu cocok lewat nama
// produk (kalau unik), baru kalau tetap gak ketemu masuk ke daftar
// "unmapped" yang perlu dicocokkan manual di UI.
export async function resolveSupplierRows(
  supplierId: string,
  rows: { sku: string; namaBarang?: string }[],
): Promise<ResolveResult> {
  const supabase = createClient()

  const { data: mappings, error: mErr } = await supabase
    .from('supplier_sku_mapping')
    .select('supplier_sku, product_id')
    .eq('supplier_id', supplierId)
  if (mErr) throw new Error(mErr.message)

  // PENTING: service_products bisa lebih dari 1000 baris — PostgREST
  // cuma balikin maksimal 1000/query kalau nggak di-paging. Tanpa loop
  // .range() ini, produk yang urutannya di luar 1000 pertama bakal
  // dianggap "belum dikenal" padahal sebenarnya sudah ada di katalog.
  const products: { id: string; sku: string; name: string }[] = []
  {
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error: pErr } = await supabase
        .from('service_products')
        .select('id, sku, name')
        .range(from, from + PAGE - 1)
      if (pErr) throw new Error(pErr.message)
      products.push(...(data || []))
      if (!data || data.length < PAGE) break
      from += PAGE
    }
  }

  const productIdByMapping = new Map<string, string>()
  ;(mappings || []).forEach((m: any) => productIdByMapping.set(normalizeSku(m.supplier_sku), m.product_id))
  const productIdBySku = new Map<string, string>()
  ;(products || []).forEach((p: any) => productIdBySku.set(normalizeSku(p.sku), p.id))

  // Fallback tambahan: cocokkan lewat NAMA produk (dari kolom Deskripsi
  // Barang di file) — TAPI cuma kalau namanya persis sama dan cuma
  // nunjuk ke SATU produk (kalau ada 2+ produk dengan nama yang sama
  // persis, itu ambigu, dilewatin — biar dicocokkan manual aja daripada
  // salah tebak).
  const normalizeName = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const productIdByName = new Map<string, string | null>() // null = ambigu (nama dobel)
  ;(products || []).forEach((p: any) => {
    const key = normalizeName(p.name)
    if (!key) return
    if (productIdByName.has(key)) productIdByName.set(key, null)
    else productIdByName.set(key, p.id)
  })

  const mapped: ResolvedSupplierRow[] = []
  const unmapped: UnmappedSupplierRow[] = []
  const autoNameMatches: { supplierSku: string; productId: string }[] = []

  rows.forEach((r) => {
    const key = normalizeSku(r.sku)
    let productId = productIdByMapping.get(key) || productIdBySku.get(key)
    if (!productId && r.namaBarang) {
      const byName = productIdByName.get(normalizeName(r.namaBarang))
      if (byName) {
        productId = byName
        autoNameMatches.push({ supplierSku: r.sku, productId: byName })
      }
    }
    if (productId) mapped.push({ sku: r.sku, productId })
    else unmapped.push(r)
  })

  // Simpen hasil cocok-otomatis-by-nama itu jadi pemetaan permanen juga,
  // biar upload berikutnya dari supplier ini gak perlu nyocokin nama
  // lagi — langsung lewat jalur SKU mapping yang lebih cepat & pasti.
  if (autoNameMatches.length) {
    const CHUNK = 300
    for (let i = 0; i < autoNameMatches.length; i += CHUNK) {
      const chunk = autoNameMatches.slice(i, i + CHUNK).map((m) => ({
        supplier_id: supplierId,
        supplier_sku: m.supplierSku,
        product_id: m.productId,
      }))
      await supabase.from('supplier_sku_mapping').upsert(chunk, { onConflict: 'supplier_id,supplier_sku' })
      // Kalau upsert ini gagal, gak masalah besar — mapping-nya cuma
      // gak kesimpen buat next time, hasil resolve kali ini tetap valid.
    }
  }

  return { mapped, unmapped }
}

export type FinalSupplierStockRow = { productId: string; gudang: string; qty: number }

// Dipanggil di client SETELAH resolveSupplierRows (+ pencocokan manual
// kalau ada) selesai — "kembangkan" balik baris-baris asli dari file
// (yang masih per-gudang, belum di-dedupe) jadi baris final siap upload,
// pakai peta SKU -> productId yang udah pasti. Ini murni logic lokal,
// gak ada panggilan ke server.
export function buildSupplierStockRows(
  fileRows: { sku: string; gudang: string; qty: number }[],
  skuToProductId: Map<string, string>,
): { rows: FinalSupplierStockRow[]; skippedCount: number } {
  const rows: FinalSupplierStockRow[] = []
  let skippedCount = 0
  fileRows.forEach((r) => {
    const productId = skuToProductId.get(normalizeSku(r.sku))
    if (!productId) {
      skippedCount += 1
      return
    }
    rows.push({ productId, gudang: r.gudang || '', qty: r.qty })
  })
  return { rows, skippedCount }
}

export type BulkCreateResult = { created: number; skipped: number; mappingBySku: Record<string, string> }

// Buat SKU supplier yang gak ketemu produk-nya sama sekali (belum pernah
// didaftarin ke katalog) — bikin produk BARU sekaligus banyak, pakai
// kode supplier sebagai SKU dan deskripsi barang sebagai nama, terus
// langsung disimpen pemetaannya juga.
export async function bulkCreateProductsAndMap(
  supplierId: string,
  rows: { sku: string; namaBarang?: string }[],
): Promise<BulkCreateResult> {
  const supabase = createClient()

  // Cek dulu SKU mana yang udah ada di katalog (biar gak duplikat/kena
  // unique constraint) — pola yang sama kayak pengecekan import produk
  // massal di lib/service/api.ts. Sekalian ambil NAMA-nya juga (bukan
  // cuma SKU) buat pencocokan by-nama di bawah.
  const existingSkuSet = new Set<string>()
  const catalogForNameMatch: { id: string; name: string }[] = []
  {
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase.from('service_products').select('id, sku, name').range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      ;(data || []).forEach((p: any) => {
        existingSkuSet.add(normalizeSku(p.sku))
        catalogForNameMatch.push({ id: p.id, name: p.name })
      })
      if (!data || data.length < PAGE) break
      from += PAGE
    }
  }

  // Alias yang udah pernah tercatat dari sync Accurate/Zoho ATAU dari
  // upload Stok Supplier sebelumnya (tabel yang sama dipakai bareng —
  // lihat lib/stok/accurate-sync.ts::resolveNewProductSkus).
  const aliasBySkuKey = new Map<string, string>()
  {
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase.from('product_sku_aliases').select('alias_sku_key, product_id').range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      ;(data || []).forEach((r: any) => aliasBySkuKey.set(r.alias_sku_key, r.product_id))
      if (!data || data.length < PAGE) break
      from += PAGE
    }
  }

  // Pencocokan by-nama — normalisasi PERSIS SAMA dengan yang dipakai di
  // migration gabung-duplikat (buang "CAMERA"/"DVR"/"NVR" di depan,
  // buang SEMUA tanda baca/spasi). PENGAMAN: "DVR ..." dan "NVR ..."
  // dengan kode model yang sama TETAP dianggap produk BEDA (DVR buat
  // kamera analog, NVR buat kamera IP — dua alat yang beda biar kode
  // modelnya kebetulan sama), jadi TIDAK dicocokkan silang.
  function deviceType(nameUpper: string): 'DVR' | 'NVR' | null {
    if (nameUpper.startsWith('DVR ')) return 'DVR'
    if (nameUpper.startsWith('NVR ')) return 'NVR'
    return null
  }
  function normalizeNameForMatch(s: string): string {
    return (s || '')
      .toUpperCase()
      .trim()
      .replace(/^(CAMERA|DVR|NVR)\s+/, '')
      .replace(/[^A-Z0-9]+/g, '')
  }
  const productIdByNormName = new Map<string, { id: string; type: 'DVR' | 'NVR' | null }[]>()
  catalogForNameMatch.forEach((p) => {
    const key = normalizeNameForMatch(p.name)
    if (!key) return
    const list = productIdByNormName.get(key) || []
    list.push({ id: p.id, type: deviceType((p.name || '').toUpperCase().trim()) })
    productIdByNormName.set(key, list)
  })
  function findNameMatch(name: string): string | null {
    const key = normalizeNameForMatch(name)
    const candidates = productIdByNormName.get(key)
    if (!candidates || candidates.length === 0) return null
    const wantType = deviceType((name || '').toUpperCase().trim())
    // Kalau ada campuran DVR/NVR di antara kandidat & yang dicari juga
    // punya tipe, cuma terima yang tipenya SAMA (atau yang gak
    // bertipe). Kalau nggak ada yang cocok tipenya, dianggap gak ketemu
    // — lebih aman bikin produk baru daripada salah gabung DVR<->NVR.
    const match = candidates.find((c) => !wantType || !c.type || c.type === wantType)
    return match ? match.id : null
  }

  const seenInBatch = new Set<string>()
  const toInsert: { id: string; sku: string; name: string; source: string }[] = []
  const newAliases: { product_id: string; alias_sku_key: string }[] = []
  const skuToNewId = new Map<string, string>()
  let skipped = 0

  rows.forEach((r) => {
    const key = normalizeSku(r.sku)
    if (!r.sku.trim() || !key || seenInBatch.has(key)) {
      skipped += 1
      return
    }
    seenInBatch.add(key)

    if (existingSkuSet.has(key)) return // udah ada persis, biarin jalur mapping normal yang urus

    const aliasHit = aliasBySkuKey.get(key)
    if (aliasHit) {
      skuToNewId.set(r.sku, aliasHit)
      return
    }

    const nameHit = findNameMatch(r.namaBarang || r.sku)
    if (nameHit) {
      skuToNewId.set(r.sku, nameHit)
      newAliases.push({ product_id: nameHit, alias_sku_key: key })
      return
    }

    const id = crypto.randomUUID()
    toInsert.push({ id, sku: r.sku.trim(), name: (r.namaBarang || r.sku).trim().toUpperCase(), source: 'supplier' })
    skuToNewId.set(r.sku, id)
  })

  if (toInsert.length) {
    const CHUNK = 300
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK)
      const { error } = await supabase.from('service_products').insert(chunk)
      if (error) throw new Error(error.message)
    }
  }

  if (newAliases.length) {
    const CHUNK = 300
    for (let i = 0; i < newAliases.length; i += CHUNK) {
      const chunk = newAliases.slice(i, i + CHUNK)
      const { error } = await supabase.from('product_sku_aliases').upsert(chunk, { onConflict: 'alias_sku_key', ignoreDuplicates: true })
      if (error) throw new Error(`Gagal simpan alias SKU: ${error.message}`)
    }
  }

  if (skuToNewId.size) {
    const mappingRows = Array.from(skuToNewId.entries()).map(([sku, productId]) => ({
      supplier_id: supplierId,
      supplier_sku: sku,
      product_id: productId,
    }))
    const CHUNK = 300
    for (let i = 0; i < mappingRows.length; i += CHUNK) {
      const chunk = mappingRows.slice(i, i + CHUNK)
      const { error } = await supabase.from('supplier_sku_mapping').upsert(chunk, { onConflict: 'supplier_id,supplier_sku' })
      if (error) throw new Error(error.message)
    }
  }

  const mappingBySku: Record<string, string> = {}
  skuToNewId.forEach((id, sku) => { mappingBySku[sku] = id })

  return { created: toInsert.length, skipped, mappingBySku }
}

export type ProductSearchResult = { id: string; sku: string; name: string }

export async function searchProductsForMapping(query: string): Promise<ProductSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from('service_products')
    .select('id, sku, name')
    .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
    .limit(20)
  if (error) throw new Error(error.message)
  return (data || []).map((p: any) => ({ id: p.id, sku: p.sku || '', name: p.name }))
}

// Simpan 1 pemetaan kode supplier -> produk internal, dipakai otomatis
// di upload-upload berikutnya dari supplier yang sama.
export async function saveSupplierSkuMapping(supplierId: string, supplierSku: string, productId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('supplier_sku_mapping')
    .upsert({ supplier_id: supplierId, supplier_sku: supplierSku.trim(), product_id: productId }, { onConflict: 'supplier_id,supplier_sku' })
  if (error) throw new Error(error.message)
}

// Upload versi final — dipanggil SETELAH baris di-resolve (lewat
// resolveSupplierRows + pencocokan manual di UI kalau perlu). Gak perlu
// nebak SKU lagi di sini, tinggal tulis product_id+qty yang udah pasti.
export async function uploadSupplierStockFile(
  supplierId: string,
  resolvedRows: FinalSupplierStockRow[],
  skippedCount = 0,
): Promise<PasteResult> {
  const supabase = createClient()

  // Snapshot angka LAMA punya supplier ini, sebelum ditimpa (buat riwayat).
  const { data: oldRows, error: oldErr } = await supabase
    .from('supplier_stock')
    .select('product_id, gudang, qty')
    .eq('supplier_id', supplierId)
  if (oldErr) throw new Error(oldErr.message)

  // syncTimestamp diambil SEKALI, dipakai jadi updated_at SEMUA baris
  // yang ditulis upload ini — biar bisa jadi "batas" buat cleanup di
  // bawah (baris yang updated_at-nya LEBIH LAMA dari ini = produk itu
  // udah gak ada lagi di file terbaru supplier = basi, dihapus). Pola
  // yang sama kayak fix stale-data di lib/stok/accurate-sync.ts &
  // zoho-sync.ts — sebelumnya bug ini juga ada di sini: upload cuma
  // upsert, gak pernah bersihin produk yang ilang dari file supplier,
  // jadi bisa nyangkut basi selamanya kayak yang ketemu di sync
  // Accurate/Zoho kemarin.
  const now = new Date().toISOString()
  const upsertRows = resolvedRows.map((r) => ({
    supplier_id: supplierId,
    product_id: r.productId,
    gudang: r.gudang || '',
    qty: r.qty,
    updated_at: now,
  }))

  if (upsertRows.length) {
    const CHUNK = 300
    for (let i = 0; i < upsertRows.length; i += CHUNK) {
      const chunk = upsertRows.slice(i, i + CHUNK)
      const { error } = await supabase.from('supplier_stock').upsert(chunk, { onConflict: 'supplier_id,product_id,gudang' })
      if (error) throw new Error(error.message)
    }
  }

  // Bersih-bersih basi: hapus baris supplier_stock punya supplier ini
  // yang gak ke-sentuh upload kali ini (produk yang gak ada lagi di
  // file terbaru). Dijalankan HANYA kalau ada baris yang beneran
  // di-upload (upsertRows.length > 0) -- kalau file-nya kosong total
  // (0 baris), lebih aman DIAM daripada ngosongin semua stok supplier
  // ini gara-gara kemungkinan file salah/kosong ke-upload gak sengaja.
  if (upsertRows.length > 0) {
    const { error: cleanupErr } = await supabase
      .from('supplier_stock')
      .delete()
      .eq('supplier_id', supplierId)
      .lt('updated_at', now)
    if (cleanupErr) throw new Error(`Gagal bersihin stok supplier basi: ${cleanupErr.message}`)
  }

  const itemsUpdated = resolvedRows.length
  const itemsSkipped = skippedCount

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

  // Cuma produk yang BENERAN punya minimal 1 baris product_stock (dari
  // sync Zoho/Accurate) yang ditampilin di sini. Produk yang cuma ada
  // di katalog gara-gara "Tambah semua sebagai produk baru & mapping"
  // di Stok Supplier (tapi belum pernah ke-sync dari cabang manapun)
  // sengaja DIKELUARIN — biar Stok Cabang & Stok Supplier nggak
  // kecampur, sesuai keputusan biar dipisah.
  const trackedProductIds = new Set(stockRows.map((r: any) => r.product_id))

  const products: MatrixProduct[] = productRows
    .filter((p: any) => trackedProductIds.has(p.id))
    .map((p: any) => ({
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

export async function triggerAccurateSoloKonsi(): Promise<{ results: any[]; message?: string }> {
  const res = await fetch('/api/stok/sync-accurate-solo-konsi', { method: 'POST' })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.message || 'Gagal menjalankan sinkronisasi Accurate Solo (konsinyasi).')
  return body
}

export async function triggerAccurateSyncAll(): Promise<{ results: any[]; message?: string }> {
  const res = await fetch('/api/stok/sync-accurate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.message || 'Gagal menjalankan sinkronisasi Accurate.')
  return body
}

// Riwayat sekarang ditampilkan lintas cabang (gak terikat 1 cabang aktif
// lagi) — RLS tetap otomatis batasin Admin Cabang biasa cuma lihat
// baris cabangnya sendiri, Super Admin lihat semua.
export async function loadSyncLogAll(limit = 30): Promise<SyncLogRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('stock_sync_log')
    .select('*, branches(name)')
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
    branchName: r.branches?.name || null,
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

// =====================================================
// Desty — daftar SKU yang lagi "terdaftar/dilistingkan" di Desty,
// dipakai buat nyaring produk mana aja yang muncul pas ekspor format
// Bulk Update On-Hand Stock. Diisi lewat upload manual (ganti total,
// bukan nambah — lihat komentar di migration 20260813020000).
// =====================================================

export async function loadDestyListedSkus(): Promise<string[]> {
  const supabase = createClient()
  const rows: string[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase.from('desty_listed_skus').select('sku').range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    ;(data || []).forEach((r: any) => rows.push(r.sku))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return rows
}

// Ganti TOTAL isi daftar SKU Desty — upload baru = sumber kebenaran
// baru. SKU yang gak ada lagi di upload terbaru otomatis dianggap
// sudah "delisting" (dihapus dari tabel ini, TIDAK ngaruh ke katalog
// produk utama sama sekali, cuma ke daftar referensi Desty ini).
export async function replaceDestyListedSkus(skus: string[]): Promise<{ count: number }> {
  const supabase = createClient()
  const uniqueBySkuKey = new Map<string, string>()
  skus.forEach((s) => {
    const key = normalizeSku(s)
    if (key) uniqueBySkuKey.set(key, s.trim())
  })
  const rows = Array.from(uniqueBySkuKey.entries()).map(([sku_key, sku]) => ({
    sku_key,
    sku,
    updated_at: new Date().toISOString(),
  }))

  // Tabel ini kecil (cuma daftar SKU referensi, bukan data transaksi) —
  // hapus semua dulu baru insert ulang, simpel & pasti bersih.
  const { error: delErr } = await supabase.from('desty_listed_skus').delete().neq('sku_key', '__never_matches__')
  if (delErr) throw new Error(delErr.message)

  if (rows.length) {
    const CHUNK = 500
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error } = await supabase.from('desty_listed_skus').insert(chunk)
      if (error) throw new Error(error.message)
    }
  }
  return { count: rows.length }
}

// =====================================================
// Cek & gabung produk duplikat — versi UI dari migration manual yang
// selama ini dijalanin lewat SQL Editor. Aturan pencocokan PERSIS SAMA
// kayak migration terakhir: buang kata "CAMERA"/"DVR"/"NVR" di depan,
// buang SEMUA tanda baca/spasi. PENGAMAN: grup yang isinya campuran
// "DVR ..." dan "NVR ..." (dua tipe device beda meski kode model
// kebetulan sama) ditandai `hasTypeConflict` dan TIDAK BOLEH digabung
// otomatis — pelajaran dari kasus iDS-7204HUHI-M1/E dkk.
// =====================================================

function normalizeNameForDupCheck(s: string): string {
  return (s || '')
    .toUpperCase()
    .trim()
    .replace(/^(CAMERA|DVR|NVR)\s+/, '')
    .replace(/\s+(OUTDOOR|INDOOR)\b/g, '')
    .replace(/[^A-Z0-9]+/g, '')
}
function deviceTypeTag(nameUpper: string): 'DVR' | 'NVR' | null {
  if (nameUpper.startsWith('DVR ')) return 'DVR'
  if (nameUpper.startsWith('NVR ')) return 'NVR'
  return null
}

export type DuplicateProductItem = { id: string; sku: string; name: string; kategori: string | null; totalStock: number }
export type DuplicateProductGroup = { nameKey: string; products: DuplicateProductItem[]; hasTypeConflict: boolean }

export async function findDuplicateProductGroups(): Promise<DuplicateProductGroup[]> {
  const supabase = createClient()

  const products: { id: string; sku: string; name: string; kategori: string | null }[] = []
  {
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase.from('service_products').select('id, sku, name, kategori').range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      ;(data || []).forEach((p: any) => products.push({ id: p.id, sku: p.sku || '', name: p.name, kategori: p.kategori }))
      if (!data || data.length < PAGE) break
      from += PAGE
    }
  }

  const stockByProduct = new Map<string, number>()
  {
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase.from('product_stock').select('product_id, qty_on_hand').range(from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      ;(data || []).forEach((r: any) => stockByProduct.set(r.product_id, (stockByProduct.get(r.product_id) || 0) + (Number(r.qty_on_hand) || 0)))
      if (!data || data.length < PAGE) break
      from += PAGE
    }
  }

  const groups = new Map<string, typeof products>()
  products.forEach((p) => {
    const key = normalizeNameForDupCheck(p.name)
    if (!key) return
    const list = groups.get(key) || []
    list.push(p)
    groups.set(key, list)
  })

  const result: DuplicateProductGroup[] = []
  groups.forEach((list, key) => {
    if (list.length < 2) return
    const types = new Set(list.map((p) => deviceTypeTag((p.name || '').toUpperCase().trim())).filter(Boolean))
    const withStock = list
      .map((p) => ({ ...p, totalStock: stockByProduct.get(p.id) || 0 }))
      .sort((a, b) => b.totalStock - a.totalStock || (a.kategori ? -1 : 1))
    result.push({ nameKey: key, products: withStock, hasTypeConflict: types.size > 1 })
  })

  return result.sort((a, b) => b.products.length - a.products.length)
}

// Gabung 1 grup duplikat: winnerId = produk yang dipertahankan (biasanya
// yang stoknya paling banyak, dipilih dari UI), loserIds = sisanya yang
// bakal dilebur ke situ lalu dihapus. Mindahin semua data terkait dulu
// (jumlahin qty per kombinasi kunci yang sama, bukan ditimpa) sebelum
// beneran hapus baris produknya — persis pola yang dipakai di
// migration-migration manual sebelumnya, cuma sekarang lewat kode biar
// bisa dipicu dari tombol di UI.
export async function mergeDuplicateProducts(winnerId: string, loserIds: string[]): Promise<void> {
  const supabase = createClient()
  if (loserIds.length === 0) return
  const allIds = [winnerId, ...loserIds]

  // 1) product_stock — jumlahin per branch_id
  {
    const { data, error } = await supabase.from('product_stock').select('branch_id, qty_on_hand').in('product_id', allIds)
    if (error) throw new Error(error.message)
    const byBranch = new Map<string, number>()
    ;(data || []).forEach((r: any) => byBranch.set(r.branch_id, (byBranch.get(r.branch_id) || 0) + (Number(r.qty_on_hand) || 0)))
    if (byBranch.size) {
      const now = new Date().toISOString()
      const upserts = Array.from(byBranch.entries()).map(([branch_id, qty_on_hand]) => ({ branch_id, product_id: winnerId, qty_on_hand, updated_at: now }))
      const { error: upErr } = await supabase.from('product_stock').upsert(upserts, { onConflict: 'branch_id,product_id' })
      if (upErr) throw new Error(upErr.message)
    }
    const { error: delErr } = await supabase.from('product_stock').delete().in('product_id', loserIds)
    if (delErr) throw new Error(delErr.message)
  }

  // 2) product_stock_konsi — jumlahin per (branch_id, source)
  {
    const { data, error } = await supabase.from('product_stock_konsi').select('branch_id, source, qty_on_hand').in('product_id', allIds)
    if (error) throw new Error(error.message)
    const byKey = new Map<string, number>()
    ;(data || []).forEach((r: any) => {
      const k = `${r.branch_id}|${r.source}`
      byKey.set(k, (byKey.get(k) || 0) + (Number(r.qty_on_hand) || 0))
    })
    if (byKey.size) {
      const now = new Date().toISOString()
      const upserts = Array.from(byKey.entries()).map(([k, qty_on_hand]) => {
        const [branch_id, source] = k.split('|')
        return { branch_id, product_id: winnerId, source, qty_on_hand, updated_at: now }
      })
      const { error: upErr } = await supabase.from('product_stock_konsi').upsert(upserts, { onConflict: 'branch_id,product_id,source' })
      if (upErr) throw new Error(upErr.message)
    }
    const { error: delErr } = await supabase.from('product_stock_konsi').delete().in('product_id', loserIds)
    if (delErr) throw new Error(delErr.message)
  }

  // 3) supplier_stock — jumlahin per (supplier_id, gudang)
  {
    const { data, error } = await supabase.from('supplier_stock').select('supplier_id, gudang, qty').in('product_id', allIds)
    if (error) throw new Error(error.message)
    const byKey = new Map<string, number>()
    ;(data || []).forEach((r: any) => {
      const k = `${r.supplier_id}|${r.gudang || ''}`
      byKey.set(k, (byKey.get(k) || 0) + (Number(r.qty) || 0))
    })
    if (byKey.size) {
      const now = new Date().toISOString()
      const upserts = Array.from(byKey.entries()).map(([k, qty]) => {
        const [supplier_id, gudang] = k.split('|')
        return { supplier_id, product_id: winnerId, gudang, qty, updated_at: now }
      })
      const { error: upErr } = await supabase.from('supplier_stock').upsert(upserts, { onConflict: 'supplier_id,product_id,gudang' })
      if (upErr) throw new Error(upErr.message)
    }
    const { error: delErr } = await supabase.from('supplier_stock').delete().in('product_id', loserIds)
    if (delErr) throw new Error(delErr.message)
  }

  // 4) supplier_sku_mapping — pindahin product_id-nya aja
  {
    const { error } = await supabase.from('supplier_sku_mapping').update({ product_id: winnerId }).in('product_id', loserIds)
    if (error) throw new Error(error.message)
  }

  // 5) stock_transfers — pindahin product_id-nya aja
  {
    const { error } = await supabase.from('stock_transfers').update({ product_id: winnerId }).in('product_id', loserIds)
    if (error) throw new Error(error.message)
  }

  // 6) service_claims.produk_sku (teks, bukan FK) — update ke SKU
  // produk yang dipertahankan, biar klaim aktif tetap kehitung "ditahan"
  {
    const { data: winnerRow, error: wErr } = await supabase.from('service_products').select('sku').eq('id', winnerId).single()
    if (wErr) throw new Error(wErr.message)
    const { data: loserRows, error: lErr } = await supabase.from('service_products').select('sku').in('id', loserIds)
    if (lErr) throw new Error(lErr.message)
    for (const lp of loserRows || []) {
      if (!lp.sku || !lp.sku.trim()) continue
      const { error } = await supabase.from('service_claims').update({ produk_sku: winnerRow.sku }).ilike('produk_sku', lp.sku.trim())
      if (error) throw new Error(error.message)
    }
  }

  // 7) terakhir, hapus baris produk duplikatnya
  {
    const { error } = await supabase.from('service_products').delete().in('id', loserIds)
    if (error) throw new Error(error.message)
  }
}

// Perbaikan manual nama produk 1 baris — dipakai tombol "Perbaiki" di
// tool "Cek Nama vs Accurate" (typo lama yang udah dibenerin di
// Accurate tapi belum ikut ke-update di sistem kita, karena nama cuma
// disalin sekali pas produk pertama kali dibikin, gak pernah di-sync
// ulang otomatis). Sekalian hapus catatan mismatch-nya (udah beres).
export async function updateProductName(productId: string, name: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('service_products').update({ name }).eq('id', productId)
  if (error) throw new Error(error.message)
  await supabase.from('product_name_mismatches').delete().eq('product_id', productId)
}

// =====================================================
// Daftar mismatch nama (produk kita vs Accurate) — dibaca dari tabel
// product_name_mismatches yang diisi OTOMATIS tiap kali sync Accurate
// jalan (lihat lib/stok/accurate-sync.ts). TIDAK manggil Accurate live
// sama sekali, jadi instan -- versi sebelumnya (fetch ke route yang
// manggil Accurate real-time buat ribuan barang) bikin timeout di
// server, makanya diganti ke pendekatan ini.
// =====================================================

export type NameMismatchRow = { productId: string; sku: string; branchName: string; namaKita: string; namaAccurate: string }

export async function loadNameMismatches(): Promise<NameMismatchRow[]> {
  const supabase = createClient()
  const rows: NameMismatchRow[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('product_name_mismatches')
      .select('product_id, sku, branch_name, nama_kita, nama_accurate')
      .order('detected_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    ;(data || []).forEach((r: any) =>
      rows.push({ productId: r.product_id, sku: r.sku, branchName: r.branch_name, namaKita: r.nama_kita, namaAccurate: r.nama_accurate }),
    )
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return rows
}

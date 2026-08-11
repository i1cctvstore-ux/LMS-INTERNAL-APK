import { createAdminClient } from '@/lib/supabase/admin'

// =====================================================
// Sinkronisasi stok dari ZOHO BOOKS (bukan Zoho Inventory) ke tabel
// product_stock, per cabang. Arahnya SATU ARAH: tarik dari Zoho, TIDAK
// menulis balik ke Zoho. Dipakai baik oleh tombol manual di UI maupun
// Vercel Cron.
//
// KENAPA BOOKS BUKAN INVENTORY (revisi 2026-07-30):
// Versi sebelumnya manggil endpoint /inventory/v1/items (Zoho Inventory,
// aplikasi terpisah yang butuh subscribe/aktivasi sendiri). Ternyata toko
// cuma langganan Zoho BOOKS di kedua organisasi (Solo & Bali) — Inventory
// kebetulan pernah ke-enable di organisasi Bali (makanya sync lama itu
// "jalan" untuk Bali), tapi datanya independen dari Books dan gampang
// out-of-sync. Solo belum pernah enable Inventory sama sekali, makanya
// selalu gagal "not authorized". Solusinya: pindah semua ke Books API,
// yang beneran dipakai & dibayar di kedua cabang.
//
// SYARAT DI SISI ZOHO BOOKS (perlu dicek manual per organisasi):
// Item yang mau muncul stoknya lewat sync ini HARUS:
//   1. Di halaman edit item, "Track Inventory" dinyalakan (kadang
//      istilahnya "Track Inventory for this item").
//   2. item_type tersimpan sebagai "inventory" (otomatis kejadian kalau
//      poin 1 dinyalakan waktu bikin/edit item).
// Item yang cuma "goods" biasa tanpa Track Inventory TIDAK akan punya
// field stok sama sekali di response API, dan akan otomatis dilewati
// (masuk hitungan itemsSkipped) oleh kode ini.
//
// Region akun Zoho (.com/.in/.eu) bisa beda-beda tergantung tempat akun
// didaftarkan — base URL-nya bisa dioverride lewat env var
// ZOHO_ACCOUNTS_BASE_URL / ZOHO_API_BASE_URL tanpa perlu ubah kode ini.
// =====================================================

const ZOHO_ACCOUNTS_BASE_URL = process.env.ZOHO_ACCOUNTS_BASE_URL || 'https://accounts.zoho.com'
const ZOHO_API_BASE_URL = process.env.ZOHO_API_BASE_URL || 'https://www.zohoapis.com'

export type ZohoOrgConfig = {
  envPrefix: string
  branchId: string
  branchName: string // buat log/pesan aja, BUKAN buat pencocokan
  clientId: string
  clientSecret: string
  refreshToken: string
  organizationId: string
}

// Pemetaan organisasi Zoho -> cabang, LEWAT ID (bukan nama) — nama
// cabang di tabel branches ternyata gak konsisten/rapi (ada yang isinya
// "solo cctv cabang bali", dll), jadi dicocokkan pakai id cabang yang
// pasti unik. Cuma di sini tempat nambah kalau nanti ada cabang/
// organisasi Zoho baru — gak perlu ubah logic lainnya.
const ZOHO_ORG_BRANCH_MAP: { envPrefix: string; branchId: string; branchName: string }[] = [
  { envPrefix: 'ZOHO_1', branchId: 'ff24cbd3-f11a-4f12-b658-88ff40b1a8e3', branchName: 'Solo' },
  { envPrefix: 'ZOHO_2', branchId: '9b4c7834-2e20-4416-8163-2faff97294c0', branchName: 'Bali' },
]

export function getZohoOrgConfigs(): ZohoOrgConfig[] {
  return ZOHO_ORG_BRANCH_MAP.map(({ envPrefix, branchId, branchName }) => {
    const clientId = process.env[`${envPrefix}_CLIENT_ID`]
    const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`]
    const refreshToken = process.env[`${envPrefix}_REFRESH_TOKEN`]
    const organizationId = process.env[`${envPrefix}_ORGANIZATION_ID`]
    if (!clientId || !clientSecret || !refreshToken || !organizationId) {
      throw new Error(
        `Env var ${envPrefix}_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN / _ORGANIZATION_ID belum lengkap di Vercel untuk cabang ${branchName}.`,
      )
    }
    return { envPrefix, branchId, branchName, clientId, clientSecret, refreshToken, organizationId }
  })
}

async function getZohoAccessToken(config: ZohoOrgConfig): Promise<string> {
  const params = new URLSearchParams({
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
  })
  const res = await fetch(`${ZOHO_ACCOUNTS_BASE_URL}/oauth/v2/token?${params.toString()}`, {
    method: 'POST',
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    throw new Error(
      `Gagal ambil access token Zoho (${config.branchName}): ${body.error || res.statusText}. ` +
        `Kalau errornya "invalid_client", kemungkinan region akun Zoho beda — coba set env ` +
        `ZOHO_ACCOUNTS_BASE_URL ke https://accounts.zoho.in atau https://accounts.zoho.eu.`,
    )
  }
  return body.access_token as string
}

type ZohoItemRow = { sku: string; name: string; available_stock: number }

// Coba beberapa kemungkinan bentuk field stok dari Zoho Books, karena
// tergantung pengaturan "Track Inventory" & multi-lokasi, bentuk
// response bisa beda. Kembalikan null kalau item ini memang gak
// punya data stok sama sekali (berarti Track Inventory belum aktif
// untuk item itu) — item seperti ini akan dilewati (bukan dianggap 0),
// supaya gak sengaja nimpa data yang sudah benar dengan angka 0 palsu.
function extractStockFromBooksItem(it: any): number | null {
  // Kasus 1: field langsung di level item (paling umum kalau Track
  // Inventory aktif & organisasi gak pakai multi-lokasi/warehouse).
  const directCandidates = [it.stock_on_hand, it.available_stock, it.actual_available_stock]
  for (const val of directCandidates) {
    if (val !== undefined && val !== null && val !== '') {
      const num = Number(val)
      if (!Number.isNaN(num)) return num
    }
  }

  // Kasus 2: dipecah per lokasi/gudang (kalau fitur Locations aktif di
  // Books) — jumlahkan semua lokasi.
  if (Array.isArray(it.locations) && it.locations.length > 0) {
    let sum = 0
    let found = false
    for (const loc of it.locations) {
      const val = loc.location_stock_on_hand ?? loc.location_available_stock ?? loc.location_actual_available_stock
      if (val !== undefined && val !== null && val !== '') {
        const num = Number(val)
        if (!Number.isNaN(num)) {
          sum += num
          found = true
        }
      }
    }
    if (found) return sum
  }

  return null // Item ini gak punya data stok — kemungkinan Track Inventory belum aktif
}

async function fetchAllZohoItemStocks(
  config: ZohoOrgConfig,
  accessToken: string,
): Promise<{ items: ZohoItemRow[]; itemsWithoutStockField: number }> {
  const items: ZohoItemRow[] = []
  let itemsWithoutStockField = 0
  const PER_PAGE = 200
  let page = 1

  while (true) {
    const params = new URLSearchParams({
      organization_id: config.organizationId,
      page: String(page),
      per_page: String(PER_PAGE),
      filter_by: 'Status.Active',
    })
    // Endpoint Zoho BOOKS (bukan lagi /inventory/v1/items).
    const res = await fetch(`${ZOHO_API_BASE_URL}/books/v3/items?${params.toString()}`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    })
    const body = await res.json()
    if (!res.ok || body.code !== 0) {
      throw new Error(
        `Gagal ambil daftar item Zoho Books (${config.branchName}, halaman ${page}): ${body.message || res.statusText}`,
      )
    }
    const pageItems = (body.items || []) as any[]
    pageItems.forEach((it) => {
      const sku = (it.sku || '').trim()
      if (!sku) return // item tanpa SKU dilewati — gak bisa dicocokkan ke katalog produk

      const stock = extractStockFromBooksItem(it)
      if (stock === null) {
        itemsWithoutStockField += 1
        return // Track Inventory belum aktif untuk item ini — dilewati, bukan dianggap 0
      }
      items.push({ sku, name: it.name || sku, available_stock: stock })
    })

    const hasMore = body.page_context?.has_more_page === true || pageItems.length === PER_PAGE
    if (!hasMore) break
    page += 1
  }

  return { items, itemsWithoutStockField }
}

// Normalisasi SKU yang sama dengan yang dipakai di modul Servis
// (buang karakter tak kasat mata, samakan bentuk, lowercase) — biar
// pencocokan SKU antara Zoho dan katalog produk internal konsisten.
function normalizeSku(s: string): string {
  return (s || '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
}

// Bikin produk baru — dulu pakai upsert(onConflict:'sku_key',
// ignoreDuplicates:true), TAPI itu ternyata gak bisa jalan: unique
// index `service_products_sku_key_uidx` adalah PARTIAL index (WHERE
// sku_key IS NOT NULL AND sku_key <> ''), sementara Supabase-js/
// PostgREST cuma bisa generate `ON CONFLICT (sku_key) DO NOTHING`
// POLOS tanpa klausa WHERE — Postgres nolak itu ("there is no unique
// or exclusion constraint matching the ON CONFLICT specification").
// Bug ini baru kena begitu ada SKU baru yang perlu di-insert, jadi
// sync sebelumnya bisa "Sukses" berkali-kali sebelum akhirnya gagal.
// Sama persis dengan bug yang diperbaiki di lib/stok/accurate-sync.ts.
//
// Perbaikan: panggil RPC `insert_new_products_ignore_dup` (migration
// 20260811010000_fix_sku_key_conflict.sql) yang jalanin INSERT ...
// ON CONFLICT (sku_key) WHERE (...) DO NOTHING mentah lewat SQL,
// match persis predicate index partial-nya. sku_key sendiri GENERATED
// ALWAYS AS (lower(btrim(sku))) — otomatis, gak perlu dikirim di sini.
async function createNewProductsAndRefreshCatalog(
  supabase: ReturnType<typeof createAdminClient>,
  toInsert: { id: string; sku: string; name: string; source: string }[],
  productIdBySku: Map<string, string>,
): Promise<number> {
  if (toInsert.length === 0) return 0
  const CHUNK = 300
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    const { error } = await supabase.rpc('insert_new_products_ignore_dup', { new_products: chunk })
    if (error) throw new Error(`Gagal bikin produk baru dari Zoho: ${error.message}`)
  }
  productIdBySku.clear()
  let from = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data, error } = await supabase.from('service_products').select('id, sku').range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    ;(data || []).forEach((p: any) => productIdBySku.set(normalizeSku(p.sku), p.id))
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return toInsert.length
}

export type SyncResult = {
  branchName: string
  itemsUpdated: number
  itemsSkipped: number
}

// Jalanin sinkronisasi buat SATU cabang/organisasi Zoho. Selalu bikin
// entri di stock_sync_log (baik sukses maupun gagal), supaya riwayatnya
// lengkap dan bisa dilihat dari tombol "Riwayat" di UI.
export async function syncZohoForBranch(
  config: ZohoOrgConfig,
  triggeredBy: 'manual' | 'cron',
  createdBy?: string,
): Promise<SyncResult> {
  const supabase = createAdminClient()
  const branchId = config.branchId

  const { data: logRow, error: logInsertErr } = await supabase
    .from('stock_sync_log')
    .insert({ branch_id: branchId, source: 'zoho', triggered_by: triggeredBy, created_by: createdBy || null })
    .select('id')
    .single()
  if (logInsertErr) throw new Error(logInsertErr.message)
  const logId = logRow.id as string

  try {
    const accessToken = await getZohoAccessToken(config)
    const { items: zohoItems, itemsWithoutStockField } = await fetchAllZohoItemStocks(config, accessToken)

    // Ambil seluruh katalog produk (sku -> id) lewat paging, sama seperti
    // di lib/service/api.ts — jumlah produk sudah pernah lebih dari 1000.
    const productIdBySku = new Map<string, string>()
    let from = 0
    const PAGE_SIZE = 1000
    while (true) {
      const { data, error } = await supabase
        .from('service_products')
        .select('id, sku')
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(error.message)
      ;(data || []).forEach((p: any) => productIdBySku.set(normalizeSku(p.sku), p.id))
      if (!data || data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    let itemsSkipped = 0
    let newProductsCreated = 0

    // Sebelum nyocokin stok, cari dulu SKU Zoho yang BELUM ada di
    // katalog produk kita, otomatis bikinin sebagai produk baru (pola
    // sama kayak yang udah jalan di sync Accurate) — SKU & nama dari
    // Zoho langsung. Dedupe dulu biar SKU yang sama gak dobel-insert.
    const seenNewSku = new Set<string>()
    const toInsert: { id: string; sku: string; name: string; source: string }[] = []
    zohoItems.forEach((item) => {
      const key = normalizeSku(item.sku)
      if (!key || productIdBySku.has(key) || seenNewSku.has(key)) return
      seenNewSku.add(key)
      toInsert.push({ id: crypto.randomUUID(), sku: item.sku, name: item.name, source: 'cabang' })
    })
    if (toInsert.length) {
      newProductsCreated = await createNewProductsAndRefreshCatalog(supabase, toInsert, productIdBySku)
    }

    // Kunci pakai product_id (bukan array biasa) supaya kalau ada 2+ item
    // Zoho dengan SKU berbeda tapi ke-normalisasi jadi sama & mengarah ke
    // produk internal yang sama, kita cuma simpan SATU baris per produk —
    // Postgres upsert bakal error "cannot affect row a second time" kalau
    // dalam 1 batch ada baris (branch_id, product_id) yang duplikat.
    const upsertRowsByProductId = new Map<string, { branch_id: string; product_id: string; qty_on_hand: number }>()
    let duplicateSkuCount = 0

    zohoItems.forEach((item) => {
      const productId = productIdBySku.get(normalizeSku(item.sku))
      if (!productId) {
        itemsSkipped += 1 // harusnya gak kejadian lagi setelah auto-create di atas, jaga-jaga aja
        return
      }
      if (upsertRowsByProductId.has(productId)) {
        duplicateSkuCount += 1 // Item Zoho lain sudah pernah mengarah ke produk yang sama
      }
      upsertRowsByProductId.set(productId, {
        branch_id: branchId,
        product_id: productId,
        qty_on_hand: Math.round(item.available_stock),
      })
    })

    const upsertRows = Array.from(upsertRowsByProductId.values())
    const itemsUpdated = upsertRows.length

    if (upsertRows.length) {
      const CHUNK = 300
      for (let i = 0; i < upsertRows.length; i += CHUNK) {
        const chunk = upsertRows.slice(i, i + CHUNK)
        const { error } = await supabase
          .from('product_stock')
          .upsert(chunk, { onConflict: 'branch_id,product_id' })
        if (error) throw new Error(error.message)
      }
    }

    // itemsSkipped di log gabungan dari: SKU gak ketemu di katalog KITA,
    // + item yang Track Inventory-nya belum aktif di Zoho Books. Dua
    // penyebab beda ini digabung di error_message biar kelihatan jelas
    // waktu dicek dari tombol Riwayat / DevTools.
    const totalSkipped = itemsSkipped + itemsWithoutStockField
    const infoNotes: string[] = []
    if (itemsWithoutStockField > 0) {
      infoNotes.push(`${itemsWithoutStockField} item belum aktif "Track Inventory" di Zoho Books, dilewati.`)
    }
    if (newProductsCreated > 0) {
      infoNotes.push(`${newProductsCreated} produk baru otomatis dibuat di katalog dari SKU Zoho yang belum ada.`)
    }
    if (duplicateSkuCount > 0) {
      infoNotes.push(
        `${duplicateSkuCount} item Zoho ke-mapping ke produk internal yang sama dengan item lain (kemungkinan SKU beda tipis/duplikat setelah normalisasi) — cuma nilai terakhir yang dipakai.`,
      )
    }
    await supabase
      .from('stock_sync_log')
      .update({
        status: 'success',
        items_updated: itemsUpdated,
        items_skipped: totalSkipped,
        error_message: infoNotes.length > 0 ? `Info: ${infoNotes.join(' ')}` : null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', logId)

    return { branchName: config.branchName, itemsUpdated, itemsSkipped: totalSkipped }
  } catch (err: any) {
    await supabase
      .from('stock_sync_log')
      .update({
        status: 'error',
        error_message: String(err?.message || err),
        finished_at: new Date().toISOString(),
      })
      .eq('id', logId)
    throw err
  }
}

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveNewProductSkus } from './accurate-sync'

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

// Zoho Solo = "kepala suku" nama produk (lihat komentar di
// syncZohoForBranch) — SATU-SATUNYA sumber yang boleh nimpa nama
// produk yang udah ada secara otomatis.
const SOLO_BRANCH_ID = 'ff24cbd3-f11a-4f12-b658-88ff40b1a8e3'

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
      const rawSku = (it.sku || '').trim()
      if (!rawSku) return // item tanpa SKU dilewati — gak bisa dicocokkan ke katalog produk
      // Buang kata "JASA" dari SKU DI SINI, sekali aja, di sumbernya —
      // biar semua kode di bawah (pencocokan katalog, bikin produk
      // baru, cek nama) otomatis pakai SKU yang udah bersih, bisa
      // nyambung ke SKU yang sama dari Accurate (yang gak punya
      // embel-embel "JASA").
      const jasaCleaned = stripJasaFromSku(rawSku) || rawSku
      const sku = scopeNumericSku(jasaCleaned, NUMERIC_SKU_BRANCH_TAG[config.branchId] || config.branchId)

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
// PENTING: "/" dan "-" disamain jadi "-" di sini — sama alasannya
// kayak di lib/stok/accurate-sync.ts (SKU item biasa vs item "(K)"
// dari model yang sama kadang ditulis beda slash/dash di Accurate,
// kalau dianggap beda stoknya nggak nyambung ke produk yang benar).
function normalizeSku(s: string): string {
  return (s || '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
    .normalize('NFKC')
    .replace(/\//g, '-')
    .trim()
    .toLowerCase()
}

// Zoho Solo suka nyantumin kata "JASA" di SKU-nya (posisinya bisa
// macem-macem — awal, tengah, akhir, dalam kurung, pakai dash, dll),
// padahal SKU dasar barangnya sendiri sama kayak yang dipakai
// Accurate. Kalau kata "JASA" ini ikut kebaca sebagai bagian SKU,
// jadi gak pernah nyambung/ke-match ke SKU Accurate yang gak punya
// embel-embel itu. Fungsi ini buang kata "JASA" (apapun casing/posisi
// nya) dulu, baru rapihin sisa dash/spasi/kurung yang nyangkut — biar
// SKU dasarnya konsisten dicocokkan lintas akun.
function stripJasaFromSku(sku: string): string {
  return (sku || '')
    .replace(/\(?\s*JASA\s*\)?/gi, '')
    .replace(/[-\s]{2,}/g, '-')
    .replace(/^[-\s]+|[-\s]+$/g, '')
    .trim()
}

// BUG PENTING (2026-08-24): SKU angka polos (kayak "100020") itu nomor
// urut OTOMATIS per-akun — Zoho Solo dan Zoho Bali itu 2 sistem
// terpisah yang bisa kebetulan ngasih angka yang sama ke barang yang
// TOTAL BEDA (sama kayak kasus yang ketemu di Accurate Jakarta/
// Purwokerto). Dikasih label akun di sini biar gak nabrak. Sama pola
// kayak scopeNumericSku di lib/stok/accurate-sync.ts.
const NUMERIC_SKU_BRANCH_TAG: Record<string, string> = {
  'ff24cbd3-f11a-4f12-b658-88ff40b1a8e3': 'ZSOLO', // Solo
  '9b4c7834-2e20-4416-8163-2faff97294c0': 'ZBALI', // Bali
}
function scopeNumericSku(sku: string, branchTag: string): string {
  const s = (sku || '').trim()
  if (/^\d+$/.test(s)) return `${s}-${branchTag}`
  return s
}

// createNewProductsAndRefreshCatalog & pencocokan alias/nama sekarang
// dipakai bareng lewat resolveNewProductSkus() yang di-import dari
// lib/stok/accurate-sync.ts (biar logic-nya cuma di 1 tempat, gak perlu
// dobel maintenance kayak sebelumnya).

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
    const nameByProductId = new Map<string, string>()
    let from = 0
    const PAGE_SIZE = 1000
    while (true) {
      const { data, error } = await supabase
        .from('service_products')
        .select('id, sku, name')
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(error.message)
      ;(data || []).forEach((p: any) => {
        productIdBySku.set(normalizeSku(p.sku), p.id)
        nameByProductId.set(p.id, p.name || '')
      })
      if (!data || data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    let itemsSkipped = 0

    // Sebelum bikin produk baru buat SKU Zoho yang belum ketemu di
    // katalog, cek dulu apakah ini sebenarnya SKU lain dari produk yang
    // UDAH ADA (lewat alias yang pernah tercatat, atau lewat kecocokan
    // nama, sama persis dengan pola di lib/stok/accurate-sync.ts) —
    // biar SKU yang dulu pernah digabung manual gak bikin duplikat baru
    // lagi tiap kali sync ulang.
    const { newProductsCreated } = await resolveNewProductSkus(
      supabase,
      productIdBySku,
      zohoItems.map((item) => ({ sku: item.sku, name: item.name })),
      // Balik pakai nama asli dari Zoho (lihat catatan di
      // resolveNewProductSkus, accurate-sync.ts).
    )

    // Nyatet hasil cek nama (produk kita vs nama LIVE di Zoho) — pola
    // sama kayak lib/stok/accurate-sync.ts, numpang di data yang udah
    // diambil di atas, gak ada panggilan API tambahan. Nyimpen SEMUA
    // hasil (cocok DAN beda, ditandai kolom status), bukan cuma yang
    // beda — biar bisa lihat juga daftar yang udah sesuai per akun.
    {
      const touchedIds = new Set<string>()
      const checkByProductId = new Map<string, { product_id: string; sku: string; branch_name: string; nama_kita: string; nama_accurate: string; status: string }>()
      zohoItems.forEach((item) => {
        const productId = productIdBySku.get(normalizeSku(item.sku))
        if (!productId) return
        touchedIds.add(productId)
        const namaKita = (nameByProductId.get(productId) || '').trim()
        const namaZoho = item.name.trim()
        if (!namaKita || !namaZoho) return
        checkByProductId.set(productId, {
          product_id: productId,
          sku: item.sku,
          branch_name: config.branchName,
          nama_kita: namaKita,
          nama_accurate: namaZoho,
          status: namaKita === namaZoho ? 'match' : 'mismatch',
        })
      })
      const checkRows = Array.from(checkByProductId.values())
      const touchedIdList = Array.from(touchedIds)
      if (touchedIdList.length) {
        const CHUNK = 300
        for (let i = 0; i < touchedIdList.length; i += CHUNK) {
          const chunk = touchedIdList.slice(i, i + CHUNK)
          const { error: delErr } = await supabase.from('product_name_checks').delete().eq('branch_name', config.branchName).in('product_id', chunk)
          if (delErr) throw new Error(`Gagal bersihin catatan cek nama lama: ${delErr.message}`)
        }
      }
      if (checkRows.length) {
        const CHUNK = 300
        for (let i = 0; i < checkRows.length; i += CHUNK) {
          const chunk = checkRows.slice(i, i + CHUNK)
          const { error: insErr } = await supabase.from('product_name_checks').upsert(chunk, { onConflict: 'product_id,branch_name' })
          if (insErr) throw new Error(`Gagal catat hasil cek nama: ${insErr.message}`)
        }
      }

      // Zoho Solo = "kepala suku" buat nama produk — sync cabang ini
      // SATU-SATUNYA yang boleh nimpa nama produk otomatis (gak perlu
      // klik "Perbaiki" manual lagi). Sumber lain (Jakarta, Purwokerto,
      // Accurate Solo multi-gudang, Zoho Bali) TETAP CUMA baca/narik
      // stok, gak pernah nimpa nama produk yang udah ada — biar gak
      // saling rebutan kayak sebelumnya. Produk yang beneran baru
      // (belum pernah ke-sync dari manapun) tetap boleh dibikin oleh
      // sumber manapun yang nemuin duluan (lewat resolveNewProductSkus
      // di atas), cuma yang PRODUK SUDAH ADA doang yang dilindungi.
      if (config.branchId === SOLO_BRANCH_ID) {
        const toRename = checkRows.filter((r) => r.status === 'mismatch').map((r) => ({ id: r.product_id, name: r.nama_accurate }))
        if (toRename.length) {
          const CHUNK = 300
          for (let i = 0; i < toRename.length; i += CHUNK) {
            const chunk = toRename.slice(i, i + CHUNK)
            const { error: renameErr } = await supabase.rpc('update_products_name_bulk', { updates: chunk })
            if (renameErr) throw new Error(`Gagal update nama produk (Zoho Solo): ${renameErr.message}`)
          }
          const ids = toRename.map((r) => r.id)
          for (let i = 0; i < ids.length; i += CHUNK) {
            const chunk = ids.slice(i, i + CHUNK)
            const { error: recomputeErr } = await supabase.rpc('recompute_name_check_status', { product_ids: chunk })
            if (recomputeErr) throw new Error(`Gagal hitung ulang status cek nama: ${recomputeErr.message}`)
          }
        }
      }
    }

    // Kunci pakai product_id (bukan array biasa) supaya kalau ada 2+ item
    // Zoho dengan SKU berbeda tapi ke-normalisasi jadi sama & mengarah ke
    // produk internal yang sama, kita cuma simpan SATU baris per produk —
    // Postgres upsert bakal error "cannot affect row a second time" kalau
    // dalam 1 batch ada baris (branch_id, product_id) yang duplikat.
    const upsertRowsByProductId = new Map<string, { branch_id: string; product_id: string; qty_on_hand: number; updated_at: string }>()
    let duplicateSkuCount = 0
    const now = new Date().toISOString()

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
        updated_at: now,
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

    // Bersih-bersih basi — item yang dulu pernah ke-sync dari Zoho tapi
    // sekarang udah nggak ketemu lagi (dihapus/di-nonaktifkan Track
    // Inventory-nya di Zoho Books) dihapus dari product_stock, biar gak
    // numpuk jadi angka basi selamanya (bug yang sama kayak yang
    // ditemukan & diperbaiki di product_stock_konsi). Fetch Zoho di
    // fungsi ini all-or-nothing (gagal = seluruh sync dianggap error,
    // gak nyampe ke titik ini), jadi aman langsung bersihin tanpa perlu
    // gate "kalau ada yang gagal sebagian" kayak di Accurate.
    //
    // Bandingin ke `now` (timestamp yang sama dipakai buat updated_at
    // pas upsert di atas), BUKAN daftar ID — daftar ID bisa ribuan
    // baris & bikin request kepanjangan/"Bad Request" (kejadian nyata
    // di cabang yang produknya banyak).
    {
      const { error: cleanupErr } = await supabase
        .from('product_stock')
        .delete()
        .eq('branch_id', branchId)
        .lt('updated_at', now)
      if (cleanupErr) throw new Error(`Gagal bersihin stok basi: ${cleanupErr.message}`)
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

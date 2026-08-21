import { createAdminClient } from '@/lib/supabase/admin'

// =====================================================
// Integrasi Accurate Online (AOL) untuk cabang-cabang yang pakai
// Accurate (baru Jakarta yang aktif; Purwokerto & Solo menyusul).
//
// ARSITEKTUR: tiap cabang = akun Accurate SENDIRI-SENDIRI (login beda),
// jadi refresh token beda per cabang (disimpan & auto-diupdate di
// Supabase karena Accurate MEROTASI refresh token tiap dipakai — lihat
// catatan panjang di versi sebelumnya file ini). DB ID beda per cabang,
// disimpan di env var Vercel (nilainya gak pernah berubah).
//
// CARA AMBIL STOK: item/list.do CUMA balikin {id, no, name} — field
// stok ("balance") cuma ada di item/detail.do, jadi WAJIB dipanggil
// satu-satu per produk (gak ada endpoint bulk buat ini di Accurate).
// Field "balance" sudah dikurangi otomatis oleh Accurate dari gudang
// "Transit (AOL System)" (barang yang lagi dikirim balik ke
// supplier/klaim) — TIDAK perlu dikurangi manual lagi di sini.
//
// KUOTA API: akun Accurate defaultnya cuma 5.000 panggilan/hari. Sync
// penuh 1 cabang ≈ (jumlah produk) + beberapa panggilan tambahan. Jaga
// jangan sampai tombol sync dipencet berkali-kali dalam waktu dekat.
//
// ENV VAR:
//   ACCURATE_CLIENT_ID                 <- sama untuk semua cabang
//   ACCURATE_CLIENT_SECRET             <- sama untuk semua cabang
//   ACCURATE_OAUTH_REDIRECT_URI        <- sama untuk semua cabang
//   ACCURATE_DB_ID_JAKARTA             <- beda per cabang
//   ACCURATE_DB_ID_PURWOKERTO          <- (isi nanti)
//   ACCURATE_DB_ID_SOLO                <- (isi nanti)
// =====================================================

const ACCOUNT_BASE_URL = 'https://account.accurate.id'

const ACCURATE_BRANCH_MAP: { envDbIdKey: string; branchId: string; branchName: string }[] = [
  { envDbIdKey: 'ACCURATE_DB_ID_JAKARTA', branchId: '5ad7239f-a7dd-47be-9ba2-c5667a3f76b2', branchName: 'Jakarta' },
  { envDbIdKey: 'ACCURATE_DB_ID_PURWOKERTO', branchId: '4c97b2cb-cf88-4e13-84c0-2f2cb8d9b612', branchName: 'Purwokerto' },
  // Solo SENGAJA gak ditaruh di sini lagi — akun Accurate "Solo" (CV
  // Yasin Putra Sejahtera) ternyata database MULTI-GUDANG yang nampung
  // konsinyasi buat SEMUA cabang (Jakarta/Bali/Purwokerto/Solo), bukan
  // stok utama Solo doang. Logic sync-nya beda total, lihat
  // syncAccurateSoloMultiGudang() di bawah, dipanggil terpisah dari
  // syncAccurateForBranch biasa.
]

export type AccurateBranchConfig = { branchId: string; branchName: string; dbId: string }

// Label singkat per akun, dipakai scopeNumericSku() di atas.
const NUMERIC_SKU_BRANCH_TAG: Record<string, string> = {
  '5ad7239f-a7dd-47be-9ba2-c5667a3f76b2': 'JKT', // Jakarta
  '4c97b2cb-cf88-4e13-84c0-2f2cb8d9b612': 'PWT', // Purwokerto
}
const SOLO_MULTIGUDANG_SKU_TAG = 'SOLOKONSI'

export async function getAccurateBranchConfigs(): Promise<AccurateBranchConfig[]> {
  const supabase = createAdminClient()
  const { data: tokenRows } = await supabase.from('accurate_oauth_tokens').select('branch_id')
  const branchIdsWithToken = new Set((tokenRows || []).map((r: any) => r.branch_id))

  return ACCURATE_BRANCH_MAP.filter(
    ({ envDbIdKey, branchId }) => !!process.env[envDbIdKey] && branchIdsWithToken.has(branchId),
  ).map(({ envDbIdKey, branchId, branchName }) => ({
    branchId,
    branchName,
    dbId: process.env[envDbIdKey] as string,
  }))
}

export type AccurateTokenResponse = { access_token: string; refresh_token: string; expires_in: number; scope: string }

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

export async function exchangeAuthorizationCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<AccurateTokenResponse> {
  const res = await fetch(`${ACCOUNT_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { Authorization: basicAuthHeader(clientId, clientSecret), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: redirectUri }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) throw new Error(`Gagal tukar Authorization Code jadi token: ${JSON.stringify(body)}`)
  return body as AccurateTokenResponse
}

export async function saveAccurateRefreshToken(branchId: string, branchName: string, refreshToken: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('accurate_oauth_tokens')
    .upsert(
      { branch_id: branchId, branch_name: branchName, refresh_token: refreshToken, updated_at: new Date().toISOString() },
      { onConflict: 'branch_id' },
    )
  if (error) throw new Error(`Gagal simpan refresh token Accurate ke Supabase: ${error.message}`)
}

async function getStoredRefreshToken(branchId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('accurate_oauth_tokens').select('refresh_token').eq('branch_id', branchId).single()
  if (error || !data) {
    throw new Error('Belum ada refresh token Accurate tersimpan untuk cabang ini. Lakukan proses OAuth manual dulu.')
  }
  return data.refresh_token as string
}

async function refreshAccessToken(clientId: string, clientSecret: string, branchId: string, branchName: string): Promise<string> {
  const currentRefreshToken = await getStoredRefreshToken(branchId)
  const res = await fetch(`${ACCOUNT_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { Authorization: basicAuthHeader(clientId, clientSecret), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: currentRefreshToken }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    throw new Error(
      `Gagal refresh Access Token Accurate (${branchName}): ${JSON.stringify(body)}. Kalau "invalid_grant", token di Supabase sudah kadaluarsa — perlu ulang proses OAuth manual.`,
    )
  }
  if (body.refresh_token) await saveAccurateRefreshToken(branchId, branchName, body.refresh_token)
  return body.access_token as string
}

type OpenDbResult = { session: string; host: string }

async function openDatabase(accessToken: string, dbId: string): Promise<OpenDbResult> {
  const params = new URLSearchParams({ id: dbId })
  const res = await fetch(`${ACCOUNT_BASE_URL}/api/open-db.do?${params.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const body = await res.json()
  if (!res.ok || !body.s) throw new Error(`Gagal buka database Accurate (id ${dbId}): ${JSON.stringify(body)}`)
  return { session: body.session as string, host: body.host as string }
}

export type AccurateConnection = { accessToken: string; session: string; host: string }

export async function connectToAccurateBranch(config: AccurateBranchConfig): Promise<AccurateConnection> {
  const clientId = process.env.ACCURATE_CLIENT_ID
  const clientSecret = process.env.ACCURATE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Env var ACCURATE_CLIENT_ID / ACCURATE_CLIENT_SECRET belum lengkap.')
  const accessToken = await refreshAccessToken(clientId, clientSecret, config.branchId, config.branchName)
  const { session, host } = await openDatabase(accessToken, config.dbId)
  return { accessToken, session, host }
}

// Ambil daftar ID semua item INVENTORY lewat paging. CATATAN PENTING:
// item/list.do TERNYATA gak selalu balikin field "no" (SKU) di akun
// ini — dari hasil diagnostik sebelumnya cuma dapat {id, modifierName}.
// Jadi di sini CUMA ambil id-nya aja; SKU & stok dua-duanya diambil
// bareng dari item/detail.do (lihat fetchItemDetail di bawah).
export async function fetchAllItemIds(conn: AccurateConnection): Promise<number[]> {
  const ids: number[] = []
  const PAGE_SIZE = 100
  let page = 1
  while (true) {
    const params = new URLSearchParams({ 'sp.pageSize': String(PAGE_SIZE), 'sp.page': String(page), 'filter.itemType': 'INVENTORY' })
    const res = await fetch(`${conn.host}/accurate/api/item/list.do?${params.toString()}`, {
      headers: { Authorization: `Bearer ${conn.accessToken}`, 'X-Session-ID': conn.session },
    })
    const body = await res.json()
    if (!res.ok || !body.s) throw new Error(`Gagal ambil daftar item Accurate (halaman ${page}): ${JSON.stringify(body)}`)
    const pageItems = (body.d || []) as any[]
    pageItems.forEach((it) => {
      if (it.id !== undefined && it.id !== null) ids.push(it.id)
    })
    const hasMore = pageItems.length === PAGE_SIZE
    if (!hasMore) break
    page += 1
  }
  return ids
}

// Ambil SKU ("no") + nama + stok ("balance") sekaligus dari SATU item
// lewat item/detail.do — ini satu-satunya endpoint yang beneran ngasih
// field-field itu di akun ini.
export async function fetchItemDetail(conn: AccurateConnection, itemId: number): Promise<{ no: string; name: string; balance: number; kategori: string | null } | null> {
  const params = new URLSearchParams({ id: String(itemId) })
  const res = await fetch(`${conn.host}/accurate/api/item/detail.do?${params.toString()}`, {
    headers: { Authorization: `Bearer ${conn.accessToken}`, 'X-Session-ID': conn.session },
  })
  const body = await res.json()
  if (!res.ok || !body.s) return null
  const no = body.d?.no
  const name = body.d?.name
  const balance = body.d?.balance
  if (!no || typeof balance !== 'number') return null
  // Kategori barang dari Accurate — field PERSISNYA di API belum sempat
  // dites langsung ke server beneran (belum ada akses live buat
  // verifikasi struktur respons), jadi dicoba beberapa kemungkinan nama
  // field yang umum dipakai Accurate Online. Kalau ternyata semuanya
  // kosong terus padahal di Accurate kategorinya keisi, berarti nama
  // field aslinya beda dari yang dicoba di sini — perlu dicek ulang
  // pakai contoh respons API asli.
  const kategoriRaw =
    body.d?.itemCategory?.name ||
    body.d?.itemCategoryName ||
    body.d?.category?.name ||
    body.d?.categoryName ||
    null
  const kategori = kategoriRaw ? String(kategoriRaw).trim() : null
  return { no, name: name || no, balance, kategori: kategori || null }
}

// PENTING: "/" dan "-" disamain jadi "-" di sini — ternyata di
// Accurate, SKU item biasa vs SKU item "(K)"-nya dari model YANG SAMA
// PERSIS kadang ditulis beda (mis. "...M1-T" vs "...M1/T-(K)", staff
// yang input beda orang/beda kebiasaan). Kalau slash vs dash dianggap
// beda, stok "(K)" itu nggak akan pernah nyambung ke produk dasarnya
// (nyangkut sebagai match gagal, stoknya ilang dari hitungan).
function normalizeSku(s: string): string {
  return (s || '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
    .normalize('NFKC')
    .replace(/\//g, '-')
    .trim()
    .toLowerCase()
}

// BUG PENTING yang diperbaiki (2026-08-24): SKU angka polos (kayak
// "100020") itu nomor urut OTOMATIS yang dibikin masing-masing akun
// Accurate/Zoho sendiri-sendiri kalau barangnya gak dikasih kode
// manual. Karena tiap akun itu sistem TERPISAH yang mulai hitung dari
// nol sendiri-sendiri, angka yang SAMA bisa nunjuk ke BARANG YANG
// TOTAL BEDA antar akun (ketemu 28 kasus nyata: SKU "100020" itu
// "AVARO LS3000 VACUUM" di sistem kita tapi "Paket Avtech 2 Mpx" di
// Accurate Purwokerto). Kalau dianggap sama & langsung dicocokin,
// stoknya ketuker ke produk yang salah.
//
// Perbaikan: SKU yang ANGKA POLOS DOANG (gak ada huruf sama sekali)
// dikasih label akun asalnya sebelum dipakai buat pencocokan/bikin
// produk baru -- jadi "100020" dari Purwokerto jadi "100020-PWT",
// otomatis gak akan pernah nabrak "100020" dari akun lain lagi. SKU
// yang udah ada hurufnya (kayak "EZVIZ-C6N-2MP") TIDAK disentuh --
// SKU kayak gitu udah cukup spesifik, kecil kemungkinan nabrak.
function scopeNumericSku(sku: string, branchTag: string): string {
  const s = (sku || '').trim()
  if (/^\d+$/.test(s)) return `${s}-${branchTag}`
  return s
}

// Deteksi item konsinyasi Accurate — SKU/nama yang diakhiri "(K)"
// (dengan atau tanpa spasi/tanda hubung sebelum kurung, misal
// "EZVIZ-C6N-1080P-(K)" atau "CAMERA EZVIZ C6N 1080P (K)"). Item kayak
// gini BUKAN produk terpisah — dia representasi stok konsinyasi dari
// produk dasarnya (tanpa suffix ini), jadi harus dipetakan balik ke
// produk dasar & ditulis ke product_stock_konsi, bukan bikin produk
// baru sendiri.
const KONSI_SUFFIX_PATTERN = /[\s\-]*\(k\)\s*$/i
export function stripKonsiSuffix(s: string): { base: string; isKonsi: boolean } {
  if (!KONSI_SUFFIX_PATTERN.test(s)) return { base: s, isKonsi: false }
  return { base: s.replace(KONSI_SUFFIX_PATTERN, '').trim(), isKonsi: true }
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
//
// Perbaikan: panggil RPC `insert_new_products_ignore_dup` (migration
// 20260811010000_fix_sku_key_conflict.sql) yang jalanin INSERT ...
// ON CONFLICT (sku_key) WHERE (...) DO NOTHING mentah lewat SQL,
// match persis predicate index partial-nya. sku_key sendiri GENERATED
// ALWAYS AS (lower(btrim(sku))) — otomatis, gak perlu dikirim di sini.
//
// Kalau 2 proses sync jalan BARENGAN (misal Zoho & Accurate) dan
// sama-sama nemu SKU baru yang sama persis, ON CONFLICT DO NOTHING di
// dalam RPC ini yang jamin cuma 1 baris yang beneran kebuat — proses
// yang "kalah" otomatis dilewati tanpa error. Setelah itu, katalog
// di-query ULANG PENUH biar dapet ID yang BENAR (baik yang berhasil
// kita insert sendiri, atau yang ternyata udah kebuat duluan sama
// proses lain).
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
    if (error) throw new Error(`Gagal bikin produk baru: ${error.message}`)
  }
  // PENTING: jangan clear() peta-nya — cuma di-timpa (set ulang) pakai
  // SKU asli di database. Kalau di-clear dulu, semua hasil pencocokan
  // ALIAS/NAMA yang udah di-set duluan (buat SKU yang secara harfiah
  // gak ada sebagai baris tersendiri lagi, karena udah digabung ke
  // produk lain) ikut kehapus, terus bikin FASE 3 nganggep item itu
  // "gak ketemu" padahal harusnya udah ketemu. Bug ini yang bikin sync
  // gagal/skip pas ada campuran produk baru + alias di 1 sync yang sama.
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

// Normalisasi nama produk buat pencocokan "apakah SKU baru ini
// sebenarnya produk yang SAMA dengan yang udah ada, cuma beda kode
// SKU" — pakai aturan PERSIS SAMA dengan yang dipakai di 3 migration
// gabung-duplikat manual (2026-08-11/12): buang kata "CAMERA" di
// depan, samain kapital & tanda baca (dash/spasi/koma dianggap setara).
export function normalizeNameForMatch(s: string): string {
  return (s || '')
    .toUpperCase()
    .trim()
    .replace(/^CAMERA\s+/, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

// Dipakai bareng oleh accurate-sync.ts & zoho-sync.ts SEBELUM manggil
// createNewProductsAndRefreshCatalog — biar SKU yang "kelihatan baru"
// (belum ada di katalog) TAPI sebenarnya cuma varian penulisan SKU
// lain dari produk yang UDAH ADA (dikenali lewat nama yang cocok
// setelah dinormalisasi, ATAU lewat alias yang udah pernah dicatat
// sebelumnya) TIDAK bikin produk duplikat baru — disambungkan ke
// produk yang sudah ada, dan alias-nya diingat permanen di
// product_sku_aliases biar sync BERIKUTNYA lebih cepat (gak perlu
// cocokin nama lagi, tinggal exact-match ke tabel alias).
//
// `candidates` = daftar {sku, name} yang SKU-nya BELUM ketemu exact
// match di productIdBySku (pengecekan awal tetap tanggung jawab
// caller, sama seperti sebelumnya).
export async function resolveNewProductSkus(
  supabase: ReturnType<typeof createAdminClient>,
  productIdBySku: Map<string, string>,
  candidates: { sku: string; name: string }[],
): Promise<{ newProductsCreated: number; aliasesLinked: number }> {
  if (candidates.length === 0) return { newProductsCreated: 0, aliasesLinked: 0 }

  // 1) Alias yang udah pernah tercatat dari sync-sync sebelumnya.
  const aliasBySkuKey = new Map<string, string>()
  {
    let from = 0
    const PAGE_SIZE = 1000
    while (true) {
      const { data, error } = await supabase.from('product_sku_aliases').select('alias_sku_key, product_id').range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(`Gagal ambil daftar alias SKU: ${error.message}`)
      ;(data || []).forEach((r: any) => aliasBySkuKey.set(r.alias_sku_key, r.product_id))
      if (!data || data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  // 2) Nama produk yang udah ada di katalog, buat fallback pencocokan
  // by-nama (kalau SKU-nya beda tapi namanya sama).
  const productIdByNormName = new Map<string, string>()
  {
    let from = 0
    const PAGE_SIZE = 1000
    while (true) {
      const { data, error } = await supabase.from('service_products').select('id, name').range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(`Gagal ambil katalog produk (nama): ${error.message}`)
      ;(data || []).forEach((p: any) => {
        const key = normalizeNameForMatch(p.name)
        if (key && !productIdByNormName.has(key)) productIdByNormName.set(key, p.id)
      })
      if (!data || data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  const toInsert: { id: string; sku: string; name: string; source: string }[] = []
  const newAliases: { product_id: string; alias_sku_key: string }[] = []
  const seenKey = new Set<string>()

  candidates.forEach((c) => {
    const key = normalizeSku(c.sku)
    if (!key || seenKey.has(key) || productIdBySku.has(key)) return
    seenKey.add(key)

    const aliasHit = aliasBySkuKey.get(key)
    if (aliasHit) {
      productIdBySku.set(key, aliasHit)
      return
    }

    const nameHit = productIdByNormName.get(normalizeNameForMatch(c.name))
    if (nameHit) {
      productIdBySku.set(key, nameHit)
      newAliases.push({ product_id: nameHit, alias_sku_key: key })
      return
    }

    toInsert.push({ id: crypto.randomUUID(), sku: c.sku, name: c.name.toUpperCase().trim(), source: 'cabang' })
  })

  const newProductsCreated = await createNewProductsAndRefreshCatalog(supabase, toInsert, productIdBySku)

  if (newAliases.length) {
    const CHUNK = 300
    for (let i = 0; i < newAliases.length; i += CHUNK) {
      const chunk = newAliases.slice(i, i + CHUNK)
      const { error } = await supabase.from('product_sku_aliases').upsert(chunk, { onConflict: 'alias_sku_key', ignoreDuplicates: true })
      if (error) throw new Error(`Gagal simpan alias SKU: ${error.message}`)
    }
  }

  return { newProductsCreated, aliasesLinked: newAliases.length }
}

export type SyncResult = { branchName: string; itemsUpdated: number; itemsSkipped: number }

export async function syncAccurateForBranch(
  config: AccurateBranchConfig,
  triggeredBy: 'manual' | 'cron',
  createdBy?: string,
): Promise<SyncResult> {
  const supabase = createAdminClient()

  const { data: logRow, error: logInsertErr } = await supabase
    .from('stock_sync_log')
    .insert({ branch_id: config.branchId, source: 'accurate', triggered_by: triggeredBy, created_by: createdBy || null })
    .select('id')
    .single()
  if (logInsertErr) throw new Error(logInsertErr.message)
  const logId = logRow.id as string

  try {
    // Tahap awal (buka koneksi + ambil daftar item) juga di-retry —
    // kadang Accurate ngebalikin error sementara (halaman HTML/gateway
    // timeout, bukan JSON) di tahap ini. Dicoba sampai 3x sebelum
    // beneran dianggap gagal.
    let conn: AccurateConnection | null = null
    let itemIds: number[] = []
    let lastConnError: any = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        conn = await connectToAccurateBranch(config)
        itemIds = await fetchAllItemIds(conn)
        lastConnError = null
        break
      } catch (err) {
        lastConnError = err
        conn = null
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
    if (!conn || lastConnError) {
      throw lastConnError || new Error('Gagal buka koneksi Accurate setelah 3x percobaan.')
    }

    // Ambil katalog produk internal (sku -> id), sama pola kaya zoho-sync.
    // Nama-nya JUGA diambil (nameByProductId) -- dipakai buat deteksi
    // mismatch nama vs Accurate di bawah (lihat komentar FASE 3).
    const productIdBySku = new Map<string, string>()
    const nameByProductId = new Map<string, string>()
    let from = 0
    const PAGE_SIZE = 1000
    while (true) {
      const { data, error } = await supabase.from('service_products').select('id, sku, name').range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(error.message)
      ;(data || []).forEach((p: any) => {
        productIdBySku.set(normalizeSku(p.sku), p.id)
        nameByProductId.set(p.id, p.name || '')
      })
      if (!data || data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    let itemsSkipped = 0
    let detailFetchFailed = 0
    let newProductsCreated = 0
    const upsertRowsByProductId = new Map<string, { branch_id: string; product_id: string; qty_on_hand: number }>()

    // FASE 1: ambil detail (no/name/balance) semua item, PARALEL per
    // batch 15 (bukan 1-per-1) — dengan 1.200+ produk, panggilan
    // berurutan bisa makan waktu puluhan menit dan kena timeout server.
    const CONCURRENCY = 15
    const allDetails: { no: string; name: string; balance: number; kategori: string | null }[] = []
    let failedIds: number[] = itemIds
    // Coba sampai 3x total (1 percobaan awal + 2 retry) — kegagalan
    // ambil detail sering cuma sementara (rate limit sesaat, koneksi
    // putus-nyambung), jadi diulang dulu sebelum beneran dianggap
    // gagal permanen.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const stillFailed: number[] = []
      for (let i = 0; i < failedIds.length; i += CONCURRENCY) {
        const batch = failedIds.slice(i, i + CONCURRENCY)
        const details = await Promise.all(batch.map((id) => fetchItemDetail(conn, id)))
        details.forEach((detail, idx) => {
          if (!detail) { stillFailed.push(batch[idx]); return }
          allDetails.push(detail)
        })
      }
      failedIds = stillFailed
      if (failedIds.length === 0) break
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1500)) // jeda sebentar sebelum retry
    }
    detailFetchFailed = failedIds.length

    // Pisahkan dulu: item KONSI (K) dipetakan ke SKU/nama DASARNYA
    // (suffix dibuang), item normal tetap pakai SKU aslinya. SKU angka
    // polos (gak ada huruf) dikasih label akun (scopeNumericSku) biar
    // gak nabrak SKU angka polos dari akun lain yang kebetulan sama.
    const skuTag = NUMERIC_SKU_BRANCH_TAG[config.branchId] || config.branchId
    type ResolvedDetail = { matchSku: string; matchName: string; balance: number; isKonsi: boolean; kategori: string | null }
    const resolvedDetails: ResolvedDetail[] = allDetails.map((d) => {
      const skuResult = stripKonsiSuffix(d.no)
      const nameResult = stripKonsiSuffix(d.name)
      return {
        matchSku: scopeNumericSku(skuResult.base, skuTag),
        matchName: nameResult.base || skuResult.base,
        balance: d.balance,
        isKonsi: skuResult.isKonsi,
        kategori: d.kategori,
      }
    })

    // FASE 2: cari SKU DASAR yang belum ada di katalog produk kita.
    // SEBELUM bikin produk baru, cek dulu apakah ini sebenarnya SKU
    // lain dari produk yang UDAH ADA (lewat alias yang pernah tercatat,
    // atau lewat kecocokan nama) — biar SKU yang dulu pernah digabung
    // manual (migration 2026-08-11/12) TIDAK bikin duplikat baru lagi
    // tiap kali sync ulang nemu SKU lama itu di Accurate.
    const { newProductsCreated: created } = await resolveNewProductSkus(
      supabase,
      productIdBySku,
      resolvedDetails.map((d) => ({ sku: d.matchSku, name: d.matchName })),
    )
    newProductsCreated = created

    // FASE 3: tulis stoknya — item normal ke product_stock (kolom
    // utama), item KONSI (K) ke product_stock_konsi (jadi angka "-K"
    // di UI, DIGABUNG sama transfer manual yang udah ada).
    //
    // PENTING: syncTimestamp diambil SEKALI di sini, dipakai sebagai
    // updated_at buat SEMUA baris yang ditulis sync ini (bukan panggil
    // new Date() lagi per baris) — biar bisa jadi "batas" yang pasti
    // buat cleanup di bawah (baris dengan updated_at LEBIH LAMA dari
    // ini = gak ke-sentuh sync kali ini = basi). Ini gantiin pendekatan
    // lama (NOT IN daftar ribuan ID) yang bikin request-nya kepanjangan
    // & kena "Bad Request" pas cabangnya punya banyak produk.
    const syncTimestamp = new Date().toISOString()
    const upsertKonsiByProductId = new Map<string, { branch_id: string; product_id: string; qty_on_hand: number; source: string }>()
    resolvedDetails.forEach((detail) => {
      const productId = productIdBySku.get(normalizeSku(detail.matchSku))
      if (!productId) { itemsSkipped += 1; return } // harusnya gak kejadian lagi, jaga-jaga aja
      if (detail.isKonsi) {
        upsertKonsiByProductId.set(productId, { branch_id: config.branchId, product_id: productId, qty_on_hand: Math.round(detail.balance), source: 'own' })
      } else {
        upsertRowsByProductId.set(productId, { branch_id: config.branchId, product_id: productId, qty_on_hand: Math.round(detail.balance) })
      }
    })

    if (upsertKonsiByProductId.size) {
      const konsiRows = Array.from(upsertKonsiByProductId.values()).map((r) => ({ ...r, updated_at: syncTimestamp }))
      const CHUNK = 300
      for (let i = 0; i < konsiRows.length; i += CHUNK) {
        const chunk = konsiRows.slice(i, i + CHUNK)
        const { error } = await supabase.from('product_stock_konsi').upsert(chunk, { onConflict: 'branch_id,product_id,source' })
        if (error) throw new Error(error.message)
      }
    }

    // Bersih-bersih: hapus baris product_stock_konsi (source='own',
    // cabang ini) yang updated_at-nya LEBIH LAMA dari syncTimestamp di
    // atas — artinya item "(K)"-nya udah nggak ketemu lagi di sync KALI
    // INI, biar gak numpuk jadi data basi selamanya kayak yang ketemu
    // manual kemarin (54 baris nyangkut sampai 5 hari). HANYA jalan
    // kalau sync ini beneran lengkap (gak ada item yang gagal diambil
    // detailnya) — kalau ada kegagalan sebagian, item yang "kelihatan
    // hilang" itu bisa jadi cuma gagal fetch sesaat, BUKAN beneran udah
    // gak ada — jadi jangan sampai kehapus gara-gara itu.
    if (detailFetchFailed === 0) {
      const { error: cleanupErr } = await supabase
        .from('product_stock_konsi')
        .delete()
        .eq('branch_id', config.branchId)
        .eq('source', 'own')
        .lt('updated_at', syncTimestamp)
      if (cleanupErr) throw new Error(`Gagal bersihin konsi basi: ${cleanupErr.message}`)
    }

    const upsertRows = Array.from(upsertRowsByProductId.values()).map((r) => ({ ...r, updated_at: syncTimestamp }))
    const itemsUpdated = upsertRows.length

    if (upsertRows.length) {
      const CHUNK = 300
      for (let i = 0; i < upsertRows.length; i += CHUNK) {
        const chunk = upsertRows.slice(i, i + CHUNK)
        const { error } = await supabase.from('product_stock').upsert(chunk, { onConflict: 'branch_id,product_id' })
        if (error) throw new Error(error.message)
      }
    }

    // Bersih-bersih basi buat stok UTAMA juga (bukan cuma "-K"), pola
    // sama persis (bandingin ke syncTimestamp, bukan daftar ID).
    if (detailFetchFailed === 0) {
      const { error: cleanupErr } = await supabase
        .from('product_stock')
        .delete()
        .eq('branch_id', config.branchId)
        .lt('updated_at', syncTimestamp)
      if (cleanupErr) throw new Error(`Gagal bersihin stok utama basi: ${cleanupErr.message}`)
    }

    // Kategori produk sekarang IKUT Accurate, BUKAN input manual lagi —
    // tiap sync, kategori produk yang match ke item di sini ditimpa
    // pakai kategori dari Accurate (kalau Accurate gak punya kategori
    // buat item itu, dipakein "-"). Ini SENGAJA nimpa kategori manual
    // yang mungkin udah pernah diisi staff — dikonfirmasi user.
    {
      const kategoriByProductId = new Map<string, string>()
      resolvedDetails.forEach((detail) => {
        const productId = productIdBySku.get(normalizeSku(detail.matchSku))
        if (!productId) return
        // Item KONSI (K) & item normal SKU dasar yang sama nunjuk ke
        // produk yang sama -- kalau salah satunya punya kategori,
        // dipakai (gak masalah ke-timpa 2x kalau dua-duanya punya,
        // hasilnya tetap salah satu yang valid).
        if (detail.kategori) kategoriByProductId.set(productId, detail.kategori)
        else if (!kategoriByProductId.has(productId)) kategoriByProductId.set(productId, '-')
      })
      // Update MURNI lewat RPC (bukan .upsert()) -- ribuan produk kalau
      // di-loop satu-satu bakal lambat banget/beresiko timeout, tapi
      // .upsert() kena bug: Postgres tetap nyoba jalur INSERT dulu buat
      // ON CONFLICT, dan itu gagal karena kolom "sku" NOT NULL gak ada
      // di payload (cuma id+kategori). RPC update_products_kategori_bulk
      // (migration 20260820010000) ngelakuin UPDATE murni, aman dari
      // masalah itu.
      const rows = Array.from(kategoriByProductId.entries()).map(([id, kategori]) => ({ id, kategori }))
      if (rows.length) {
        const CHUNK = 300
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK)
          const { error: catErr } = await supabase.rpc('update_products_kategori_bulk', { updates: chunk })
          if (catErr) throw new Error(`Gagal update kategori: ${catErr.message}`)
        }
      }
    }

    // Deteksi mismatch NAMA (bukan auto-timpa kayak kategori — nama
    // cuma dicatat buat direview manual lewat tombol "Cek Nama vs
    // Accurate", biar staff yang putusin, bukan sistem asal ganti).
    // Numpang di detail yang UDAH diambil buat FASE 2/3 di atas, jadi
    // gak ada panggilan API tambahan sama sekali — beda dari versi
    // lama yang bikin route terpisah manggil Accurate lagi dari nol
    // tiap kali tombolnya diklik (itu yang bikin timeout kemarin).
    // SEKARANG nyimpen SEMUA hasil cek (cocok DAN beda, ditandai kolom
    // status) — bukan cuma yang beda — biar bisa lihat juga daftar yang
    // udah sesuai per akun, gak cuma yang bermasalah.
    if (detailFetchFailed === 0) {
      const touchedIds = new Set<string>()
      // Map (bukan array) biar otomatis cuma 1 baris per productId --
      // item normal & item "(K)"-nya bisa sama-sama nunjuk ke produk
      // yang sama, kalau dua-duanya kebetulan hasilnya sama bakal ganda
      // dalam 1 batch upsert dan bikin Postgres error ("ON CONFLICT DO
      // UPDATE command cannot affect row a second time").
      const checkByProductId = new Map<string, { product_id: string; sku: string; branch_name: string; nama_kita: string; nama_accurate: string; status: string }>()
      resolvedDetails.forEach((detail) => {
        const productId = productIdBySku.get(normalizeSku(detail.matchSku))
        if (!productId) return
        touchedIds.add(productId)
        const namaKita = (nameByProductId.get(productId) || '').trim()
        const namaAccurate = detail.matchName.trim()
        if (!namaKita || !namaAccurate) return
        checkByProductId.set(productId, {
          product_id: productId,
          sku: detail.matchSku,
          branch_name: config.branchName,
          nama_kita: namaKita,
          nama_accurate: namaAccurate,
          status: namaKita === namaAccurate ? 'match' : 'mismatch',
        })
      })
      const checkRows = Array.from(checkByProductId.values())
      const touchedIdList = Array.from(touchedIds)
      if (touchedIdList.length) {
        const CHUNK = 300
        for (let i = 0; i < touchedIdList.length; i += CHUNK) {
          const chunk = touchedIdList.slice(i, i + CHUNK)
          // Hapus dulu baris lama punya produk-produk yang disentuh sync
          // ini, KHUSUS milik cabang/sumber ini aja (branch_name) —
          // biar gak ikut kehapus catatan dari sumber Accurate/Zoho lain
          // yang kebetulan nyentuh produk yang sama (mis. item konsi
          // yang juga dicek dari Accurate Solo multi-gudang).
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
    }

    const totalSkipped = itemsSkipped + detailFetchFailed
    const notes: string[] = []
    if (detailFetchFailed > 0) {
      notes.push(`${detailFetchFailed} item gagal diambil detailnya (kemungkinan kuota API atau item bermasalah), dilewati.`)
    }
    if (newProductsCreated > 0) {
      notes.push(`${newProductsCreated} produk baru otomatis dibuat di katalog dari SKU Accurate yang belum ada.`)
    }
    if (upsertKonsiByProductId.size > 0) {
      notes.push(`${upsertKonsiByProductId.size} item konsinyasi (K) dipetakan ke kolom "-K", bukan kolom utama.`)
    }
    await supabase
      .from('stock_sync_log')
      .update({
        status: 'success',
        items_updated: itemsUpdated,
        items_skipped: totalSkipped,
        error_message: notes.length > 0 ? `Info: ${notes.join(' | ')}` : null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', logId)

    return { branchName: config.branchName, itemsUpdated, itemsSkipped: totalSkipped }
  } catch (err: any) {
    await supabase
      .from('stock_sync_log')
      .update({ status: 'error', error_message: String(err?.message || err), finished_at: new Date().toISOString() })
      .eq('id', logId)
    throw err
  }
}

// =====================================================
// SYNC KHUSUS: Accurate "Solo" (CV Yasin Putra Sejahtera) — database
// MULTI-GUDANG yang nampung stok konsinyasi buat 4 cabang sekaligus,
// bukan stok utama Solo. Nama gudang di database ini (dikonfirmasi
// lewat diagnostik langsung, BUKAN tebakan):
//   "Jakarta" -> konsinyasi Jakarta
//   "Bali" -> konsinyasi Bali
//   "Purwokerto" -> konsinyasi Purwokerto
//   "Utama" -> konsinyasi Solo (gudang default akun ini sendiri)
//   "Transit (AOL System)" -> DIABAIKAN (gudang sistem, bukan cabang)
//
// Ditulis SEMUA ke product_stock_konsi (kolom "-K"), TIDAK PERNAH ke
// product_stock (kolom utama) — kolom utama Solo tetap murni dari
// Zoho. Dipanggil TERPISAH dari syncAccurateForBranch/getAccurateBranchConfigs
// biasa karena satu database ini nulis ke BANYAK cabang sekaligus.
// =====================================================

const SOLO_BRANCH_ID = 'ff24cbd3-f11a-4f12-b658-88ff40b1a8e3'

const SOLO_WAREHOUSE_SOURCE_LABEL: Record<string, 'own' | 'solo'> = {
  jakarta: 'solo',
  bali: 'solo',
  purwokerto: 'solo',
  utama: 'own', // "Utama" = konsinyasi Solo sendiri, bukan "titipan" dari cabang lain
}

const SOLO_WAREHOUSE_TO_BRANCH: Record<string, string> = {
  jakarta: '5ad7239f-a7dd-47be-9ba2-c5667a3f76b2',
  bali: '9b4c7834-2e20-4416-8163-2faff97294c0',
  purwokerto: '4c97b2cb-cf88-4e13-84c0-2f2cb8d9b612',
  utama: SOLO_BRANCH_ID, // "Utama" = gudang default akun ini = Solo sendiri
}

export async function syncAccurateSoloMultiGudang(
  triggeredBy: 'manual' | 'cron',
  createdBy?: string,
): Promise<{ branchName: string; itemsUpdated: number; itemsSkipped: number }> {
  const supabase = createAdminClient()
  const dbId = process.env.ACCURATE_DB_ID_SOLO
  if (!dbId) throw new Error('Env var ACCURATE_DB_ID_SOLO belum diisi.')

  const { data: logRow, error: logInsertErr } = await supabase
    .from('stock_sync_log')
    .insert({ branch_id: SOLO_BRANCH_ID, source: 'accurate', triggered_by: triggeredBy, created_by: createdBy || null })
    .select('id')
    .single()
  if (logInsertErr) throw new Error(logInsertErr.message)
  const logId = logRow.id as string

  try {
    const config: AccurateBranchConfig = { branchId: SOLO_BRANCH_ID, branchName: 'Solo (multi-gudang)', dbId }

    let conn: AccurateConnection | null = null
    let itemIds: number[] = []
    let lastConnError: any = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        conn = await connectToAccurateBranch(config)
        itemIds = await fetchAllItemIds(conn)
        lastConnError = null
        break
      } catch (err) {
        lastConnError = err
        conn = null
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
    if (!conn || lastConnError) throw lastConnError || new Error('Gagal buka koneksi Accurate Solo setelah 3x percobaan.')

    type RawDetail = { no: string; name: string; warehouses: { name: string; balance: number }[] }
    async function fetchRawDetail(id: number): Promise<RawDetail | null> {
      const params = new URLSearchParams({ id: String(id) })
      const res = await fetch(`${conn!.host}/accurate/api/item/detail.do?${params.toString()}`, {
        headers: { Authorization: `Bearer ${conn!.accessToken}`, 'X-Session-ID': conn!.session },
      })
      const body = await res.json()
      if (!res.ok || !body.s || !body.d?.no) return null
      // SKU angka polos dikasih label akun (scopeNumericSku) di sini,
      // di SUMBERNYA — biar semua pemakaian d.no di bawah (pencocokan
      // katalog, bikin produk baru, dst) otomatis pakai versi yang
      // udah aman dari tabrakan.
      return {
        no: scopeNumericSku(body.d.no, SOLO_MULTIGUDANG_SKU_TAG),
        name: body.d.name || body.d.no,
        warehouses: (body.d.detailWarehouseData || []).map((w: any) => ({ name: w.name, balance: Number(w.balance) || 0 })),
      }
    }

    const CONCURRENCY = 15
    const allDetails: RawDetail[] = []
    let failedIds: number[] = itemIds
    for (let attempt = 1; attempt <= 3; attempt++) {
      const stillFailed: number[] = []
      for (let i = 0; i < failedIds.length; i += CONCURRENCY) {
        const batch = failedIds.slice(i, i + CONCURRENCY)
        const details = await Promise.all(batch.map((id) => fetchRawDetail(id)))
        details.forEach((d, idx) => {
          if (!d) { stillFailed.push(batch[idx]); return }
          allDetails.push(d)
        })
      }
      failedIds = stillFailed
      if (failedIds.length === 0) break
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    const detailFetchFailed = failedIds.length

    const productIdBySku = new Map<string, string>()
    const nameByProductId = new Map<string, string>()
    {
      let from = 0
      const PAGE_SIZE = 1000
      while (true) {
        const { data, error } = await supabase.from('service_products').select('id, sku, name').range(from, from + PAGE_SIZE - 1)
        if (error) throw new Error(error.message)
        ;(data || []).forEach((p: any) => {
          productIdBySku.set(normalizeSku(p.sku), p.id)
          nameByProductId.set(p.id, p.name || '')
        })
        if (!data || data.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
    }

    const { newProductsCreated } = await resolveNewProductSkus(
      supabase,
      productIdBySku,
      allDetails.map((d) => ({ sku: d.no, name: d.name })),
    )

    // Deteksi mismatch nama — pola sama kayak syncAccurateForBranch,
    // numpang di detail yang udah diambil di atas, gak ada panggilan
    // API tambahan.
    if (detailFetchFailed === 0) {
      const touchedIds = new Set<string>()
      const checkByProductId = new Map<string, { product_id: string; sku: string; branch_name: string; nama_kita: string; nama_accurate: string; status: string }>()
      allDetails.forEach((d) => {
        const productId = productIdBySku.get(normalizeSku(d.no))
        if (!productId) return
        touchedIds.add(productId)
        const namaKita = (nameByProductId.get(productId) || '').trim()
        const namaAccurate = d.name.trim()
        if (!namaKita || !namaAccurate) return
        checkByProductId.set(productId, {
          product_id: productId,
          sku: d.no,
          branch_name: 'Accurate Solo (multi-gudang)',
          nama_kita: namaKita,
          nama_accurate: namaAccurate,
          status: namaKita === namaAccurate ? 'match' : 'mismatch',
        })
      })
      const checkRows = Array.from(checkByProductId.values())
      const touchedIdList = Array.from(touchedIds)
      if (touchedIdList.length) {
        const CHUNK = 300
        for (let i = 0; i < touchedIdList.length; i += CHUNK) {
          const chunk = touchedIdList.slice(i, i + CHUNK)
          const { error: delErr } = await supabase.from('product_name_checks').delete().eq('branch_name', 'Accurate Solo (multi-gudang)').in('product_id', chunk)
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
    }

    // Rutekan tiap baris gudang ke cabang yang sesuai, tulis ke
    // product_stock_konsi (BUKAN product_stock).
    const konsiRows = new Map<string, { branch_id: string; product_id: string; qty_on_hand: number; source: string }>()
    let itemsSkipped = 0
    allDetails.forEach((d) => {
      const productId = productIdBySku.get(normalizeSku(d.no))
      if (!productId) { itemsSkipped += 1; return }
      d.warehouses.forEach((w) => {
        const key = (w.name || '').trim().toLowerCase()
        const branchId = SOLO_WAREHOUSE_TO_BRANCH[key]
        if (!branchId) return // gudang sistem (Transit) atau gudang gak dikenal, dilewati
        const source = SOLO_WAREHOUSE_SOURCE_LABEL[key] || 'solo'
        konsiRows.set(`${branchId}|${productId}|${source}`, { branch_id: branchId, product_id: productId, qty_on_hand: Math.round(w.balance), source })
      })
    })

    const syncTimestamp = new Date().toISOString()
    const rows = Array.from(konsiRows.values()).map((r) => ({ ...r, updated_at: syncTimestamp }))
    if (rows.length) {
      const CHUNK = 300
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK)
        const { error } = await supabase.from('product_stock_konsi').upsert(chunk, { onConflict: 'branch_id,product_id,source' })
        if (error) throw new Error(error.message)
      }
    }

    // Bersih-bersih basi — sama kayak di syncAccurateForBranch (bandingin
    // updated_at ke syncTimestamp, BUKAN daftar ID — daftar ID bisa
    // ribuan baris & bikin request kepanjangan/"Bad Request"). Di sini
    // datanya nyebar ke beberapa cabang+source sekaligus (Jakarta/Bali/
    // Purwokerto = source 'solo', Solo sendiri = source 'own'). Cuma
    // jalan kalau sync ini lengkap (gak ada item gagal fetch).
    if (detailFetchFailed === 0) {
      const managedCombos = new Set<string>()
      Object.entries(SOLO_WAREHOUSE_TO_BRANCH).forEach(([wh, branchId]) => {
        const source = SOLO_WAREHOUSE_SOURCE_LABEL[wh] || 'solo'
        managedCombos.add(`${branchId}|${source}`)
      })
      for (const combo of managedCombos) {
        const [branchId, source] = combo.split('|')
        const { error: cleanupErr } = await supabase
          .from('product_stock_konsi')
          .delete()
          .eq('branch_id', branchId)
          .eq('source', source)
          .lt('updated_at', syncTimestamp)
        if (cleanupErr) throw new Error(`Gagal bersihin konsi basi (Solo multi-gudang): ${cleanupErr.message}`)
      }
    }

    const totalSkipped = itemsSkipped + detailFetchFailed
    const notes: string[] = []
    if (detailFetchFailed > 0) notes.push(`${detailFetchFailed} item gagal diambil detailnya.`)
    if (newProductsCreated > 0) notes.push(`${newProductsCreated} produk baru otomatis dibuat.`)
    notes.push(`Stok konsinyasi ditulis ke ${rows.length} kombinasi cabang+produk (Jakarta-K/Bali-K/Purwokerto-K/Solo-K).`)

    await supabase
      .from('stock_sync_log')
      .update({
        status: 'success',
        items_updated: rows.length,
        items_skipped: totalSkipped,
        error_message: `Info: ${notes.join(' | ')}`,
        finished_at: new Date().toISOString(),
      })
      .eq('id', logId)

    return { branchName: 'Solo (multi-gudang → -K)', itemsUpdated: rows.length, itemsSkipped: totalSkipped }
  } catch (err: any) {
    await supabase
      .from('stock_sync_log')
      .update({ status: 'error', error_message: String(err?.message || err), finished_at: new Date().toISOString() })
      .eq('id', logId)
    throw err
  }
}

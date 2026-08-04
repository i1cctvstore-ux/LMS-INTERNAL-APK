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
  // Solo baru menyusul kalau nanti resmi pindah dari Zoho ke Accurate:
  // { envDbIdKey: 'ACCURATE_DB_ID_SOLO', branchId: 'ff24cbd3-f11a-4f12-b658-88ff40b1a8e3', branchName: 'Solo' },
]

export type AccurateBranchConfig = { branchId: string; branchName: string; dbId: string }

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
async function fetchAllItemIds(conn: AccurateConnection): Promise<number[]> {
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
async function fetchItemDetail(conn: AccurateConnection, itemId: number): Promise<{ no: string; name: string; balance: number } | null> {
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
  return { no, name: name || no, balance }
}

function normalizeSku(s: string): string {
  return (s || '').replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '').normalize('NFKC').trim().toLowerCase()
}

// Deteksi item konsinyasi Accurate — SKU/nama yang diakhiri "(K)"
// (dengan atau tanpa spasi/tanda hubung sebelum kurung, misal
// "EZVIZ-C6N-1080P-(K)" atau "CAMERA EZVIZ C6N 1080P (K)"). Item kayak
// gini BUKAN produk terpisah — dia representasi stok konsinyasi dari
// produk dasarnya (tanpa suffix ini), jadi harus dipetakan balik ke
// produk dasar & ditulis ke product_stock_konsi, bukan bikin produk
// baru sendiri.
const KONSI_SUFFIX_PATTERN = /[\s\-]*\(k\)\s*$/i
function stripKonsiSuffix(s: string): { base: string; isKonsi: boolean } {
  if (!KONSI_SUFFIX_PATTERN.test(s)) return { base: s, isKonsi: false }
  return { base: s.replace(KONSI_SUFFIX_PATTERN, '').trim(), isKonsi: true }
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
    const conn = await connectToAccurateBranch(config)
    const itemIds = await fetchAllItemIds(conn)

    // Ambil katalog produk internal (sku -> id), sama pola kaya zoho-sync.
    const productIdBySku = new Map<string, string>()
    let from = 0
    const PAGE_SIZE = 1000
    while (true) {
      const { data, error } = await supabase.from('service_products').select('id, sku').range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(error.message)
      ;(data || []).forEach((p: any) => productIdBySku.set(normalizeSku(p.sku), p.id))
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
    const allDetails: { no: string; name: string; balance: number }[] = []
    for (let i = 0; i < itemIds.length; i += CONCURRENCY) {
      const batch = itemIds.slice(i, i + CONCURRENCY)
      const details = await Promise.all(batch.map((id) => fetchItemDetail(conn, id)))
      details.forEach((detail) => {
        if (!detail) { detailFetchFailed += 1; return }
        allDetails.push(detail)
      })
    }

    // Pisahkan dulu: item KONSI (K) dipetakan ke SKU/nama DASARNYA
    // (suffix dibuang), item normal tetap pakai SKU aslinya.
    type ResolvedDetail = { matchSku: string; matchName: string; balance: number; isKonsi: boolean }
    const resolvedDetails: ResolvedDetail[] = allDetails.map((d) => {
      const skuResult = stripKonsiSuffix(d.no)
      const nameResult = stripKonsiSuffix(d.name)
      return {
        matchSku: skuResult.base,
        matchName: nameResult.base || skuResult.base,
        balance: d.balance,
        isKonsi: skuResult.isKonsi,
      }
    })

    // FASE 2: cari SKU DASAR yang belum ada di katalog produk kita,
    // otomatis bikinin sebagai produk baru (pola sama kayak "Tambah
    // semua sebagai produk baru & mapping" di Stok Supplier). Dedupe
    // dulu berdasarkan SKU dasar yang sudah di-normalize — item normal
    // & item (K) dengan SKU dasar sama CUMA bikin 1 produk.
    const seenNewSku = new Set<string>()
    const toInsert: { id: string; sku: string; name: string; source: string }[] = []
    resolvedDetails.forEach((d) => {
      const key = normalizeSku(d.matchSku)
      if (!key || productIdBySku.has(key) || seenNewSku.has(key)) return
      seenNewSku.add(key)
      toInsert.push({ id: crypto.randomUUID(), sku: d.matchSku, name: d.matchName, source: 'cabang' })
    })
    if (toInsert.length) {
      const CHUNK = 300
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK)
        const { error } = await supabase.from('service_products').insert(chunk)
        if (error) throw new Error(`Gagal bikin produk baru dari Accurate: ${error.message}`)
      }
      toInsert.forEach((p) => productIdBySku.set(normalizeSku(p.sku), p.id))
      newProductsCreated = toInsert.length
    }

    // FASE 3: tulis stoknya — item normal ke product_stock (kolom
    // utama), item KONSI (K) ke product_stock_konsi (jadi angka "-K"
    // di UI, DIGABUNG sama transfer manual yang udah ada).
    const upsertKonsiByProductId = new Map<string, { branch_id: string; product_id: string; qty_on_hand: number }>()
    resolvedDetails.forEach((detail) => {
      const productId = productIdBySku.get(normalizeSku(detail.matchSku))
      if (!productId) { itemsSkipped += 1; return } // harusnya gak kejadian lagi, jaga-jaga aja
      if (detail.isKonsi) {
        upsertKonsiByProductId.set(productId, { branch_id: config.branchId, product_id: productId, qty_on_hand: Math.round(detail.balance) })
      } else {
        upsertRowsByProductId.set(productId, { branch_id: config.branchId, product_id: productId, qty_on_hand: Math.round(detail.balance) })
      }
    })

    if (upsertKonsiByProductId.size) {
      const konsiRows = Array.from(upsertKonsiByProductId.values()).map((r) => ({ ...r, updated_at: new Date().toISOString() }))
      const CHUNK = 300
      for (let i = 0; i < konsiRows.length; i += CHUNK) {
        const chunk = konsiRows.slice(i, i + CHUNK)
        const { error } = await supabase.from('product_stock_konsi').upsert(chunk, { onConflict: 'branch_id,product_id' })
        if (error) throw new Error(error.message)
      }
    }

    const upsertRows = Array.from(upsertRowsByProductId.values())
    const itemsUpdated = upsertRows.length

    if (upsertRows.length) {
      const CHUNK = 300
      for (let i = 0; i < upsertRows.length; i += CHUNK) {
        const chunk = upsertRows.slice(i, i + CHUNK)
        const { error } = await supabase.from('product_stock').upsert(chunk, { onConflict: 'branch_id,product_id' })
        if (error) throw new Error(error.message)
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

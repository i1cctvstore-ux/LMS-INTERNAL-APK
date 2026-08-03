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

// Ambil daftar ringkas {id, no} semua item INVENTORY, lewat paging.
async function fetchAllItemIds(conn: AccurateConnection): Promise<{ id: number; no: string }[]> {
  const items: { id: number; no: string }[] = []
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
      if (it.no) items.push({ id: it.id, no: it.no })
    })
    const hasMore = pageItems.length === PAGE_SIZE
    if (!hasMore) break
    page += 1
  }
  return items
}

// Ambil "balance" (stok, sudah otomatis exclude gudang Transit) untuk
// SATU item lewat item/detail.do — ini yang dipanggil per item, gak
// ada alternatif bulk.
async function fetchItemBalance(conn: AccurateConnection, itemId: number): Promise<number | null> {
  const params = new URLSearchParams({ id: String(itemId) })
  const res = await fetch(`${conn.host}/accurate/api/item/detail.do?${params.toString()}`, {
    headers: { Authorization: `Bearer ${conn.accessToken}`, 'X-Session-ID': conn.session },
  })
  const body = await res.json()
  if (!res.ok || !body.s) return null
  const balance = body.d?.balance
  return typeof balance === 'number' ? balance : null
}

function normalizeSku(s: string): string {
  return (s || '').replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '').normalize('NFKC').trim().toLowerCase()
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
    const itemList = await fetchAllItemIds(conn)

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
    const upsertRowsByProductId = new Map<string, { branch_id: string; product_id: string; qty_on_hand: number }>()

    // Panggil detail.do SATU-SATU per item (batasan API Accurate — lihat
    // catatan kuota di komentar atas file). Untuk katalog besar ini bisa
    // makan waktu beberapa menit; itu wajar, bukan error.
    for (const item of itemList) {
      const productId = productIdBySku.get(normalizeSku(item.no))
      if (!productId) {
        itemsSkipped += 1
        continue
      }
      const balance = await fetchItemBalance(conn, item.id)
      if (balance === null) {
        detailFetchFailed += 1
        continue
      }
      upsertRowsByProductId.set(productId, { branch_id: config.branchId, product_id: productId, qty_on_hand: Math.round(balance) })
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
    await supabase
      .from('stock_sync_log')
      .update({
        status: 'success',
        items_updated: itemsUpdated,
        items_skipped: totalSkipped,
        error_message:
          detailFetchFailed > 0
            ? `Info: ${detailFetchFailed} item gagal diambil detailnya (kemungkinan kuota API atau item bermasalah), dilewati.`
            : null,
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

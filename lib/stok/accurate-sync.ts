import { createAdminClient } from '@/lib/supabase/admin'

// =====================================================
// Integrasi Accurate Online (AOL) untuk cabang-cabang yang pakai
// Accurate (baru Jakarta yang aktif; Purwokerto & Solo rencana
// menyusul nanti — lihat ACCURATE_BRANCH_MAP di bawah).
//
// ARSITEKTUR (revisi ke-3 — PENTING):
//   - Client ID & Client Secret: SAMA untuk semua cabang (identitas
//     aplikasi kita di Accurate Developer Portal), disimpan di env var
//     Vercel seperti biasa (ACCURATE_CLIENT_ID / ACCURATE_CLIENT_SECRET).
//   - DB ID: BEDA per cabang, disimpan di env var Vercel
//     (ACCURATE_DB_ID_JAKARTA dkk) — ini aman di env var karena nilainya
//     TIDAK PERNAH BERUBAH.
//   - Refresh Token: BEDA per cabang, dan Accurate MEROTASI refresh
//     token SETIAP KALI DIPAKAI (beda dari Zoho yang tokennya sama
//     terus) — jadi TIDAK BISA disimpan di env var Vercel (env var gak
//     bisa diupdate otomatis dari kode yang jalan). Karena itu refresh
//     token disimpan & diupdate di tabel Supabase
//     `accurate_oauth_tokens`, bukan di Vercel. Setiap kali sync
//     berhasil refresh access token, refresh token BARU yang dibalikin
//     Accurate langsung ditulis balik ke tabel ini, menimpa yang lama.
//
// SETUP AWAL (sekali per cabang): lakukan proses OAuth manual (buka
// URL authorize sambil login akun Accurate cabang itu, klik "Beri
// Akses"). Halaman callback (accurate-oauth-callback/route.ts) akan
// LANGSUNG menyimpan refresh token pertama ke tabel ini — gak perlu
// copy-paste manual ke env var lagi seperti versi sebelumnya.
//
// ENV VAR YANG MASIH DIPAKAI:
//   ACCURATE_CLIENT_ID
//   ACCURATE_CLIENT_SECRET
//   ACCURATE_OAUTH_REDIRECT_URI
//   ACCURATE_DB_ID_JAKARTA        (dan nanti ACCURATE_DB_ID_PURWOKERTO, dst)
// =====================================================

const ACCOUNT_BASE_URL = 'https://account.accurate.id'

const ACCURATE_BRANCH_MAP: { envDbIdKey: string; branchId: string; branchName: string }[] = [
  { envDbIdKey: 'ACCURATE_DB_ID_JAKARTA', branchId: '5ad7239f-a7dd-47be-9ba2-c5667a3f76b2', branchName: 'Jakarta' },
  { envDbIdKey: 'ACCURATE_DB_ID_PURWOKERTO', branchId: '4c97b2cb-cf88-4e13-84c0-2f2cb8d9b612', branchName: 'Purwokerto' },
  // Solo baru menyusul kalau nanti resmi pindah dari Zoho ke Accurate:
  // { envDbIdKey: 'ACCURATE_DB_ID_SOLO', branchId: 'ff24cbd3-f11a-4f12-b658-88ff40b1a8e3', branchName: 'Solo' },
]

export type AccurateBranchConfig = { branchId: string; branchName: string; dbId: string }

// Cuma kembalikan cabang yang DB ID-nya sudah diisi di Vercel DAN
// sudah punya baris refresh token di tabel accurate_oauth_tokens
// (artinya sudah pernah lewat proses OAuth manual).
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

export type AccurateTokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

// Dipakai oleh halaman callback OAuth (dijalankan sekali per cabang,
// tiap kali login akun Accurate cabang itu), buat nukar Authorization
// Code jadi Access Token + Refresh Token PERTAMA KALI untuk cabang itu.
export async function exchangeAuthorizationCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<AccurateTokenResponse> {
  const res = await fetch(`${ACCOUNT_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: redirectUri }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    throw new Error(`Gagal tukar Authorization Code jadi token: ${JSON.stringify(body)}`)
  }
  return body as AccurateTokenResponse
}

// Simpan/timpa refresh token untuk 1 cabang ke Supabase — dipanggil
// baik oleh halaman callback OAuth (token pertama) MAUPUN tiap kali
// refreshAccessToken() berhasil (token hasil rotasi).
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
  const { data, error } = await supabase
    .from('accurate_oauth_tokens')
    .select('refresh_token')
    .eq('branch_id', branchId)
    .single()
  if (error || !data) {
    throw new Error(
      `Belum ada refresh token Accurate tersimpan untuk cabang ini. Lakukan proses OAuth manual dulu (buka URL authorize, login, klik "Beri Akses").`,
    )
  }
  return data.refresh_token as string
}

// Tukar refresh token jadi access token BARU. Karena Accurate merotasi
// refresh token setiap dipakai, refresh_token baru dari hasil response
// LANGSUNG disimpan balik ke Supabase di sini juga — supaya panggilan
// berikutnya selalu pakai yang terbaru.
async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  branchId: string,
  branchName: string,
): Promise<string> {
  const currentRefreshToken = await getStoredRefreshToken(branchId)
  const res = await fetch(`${ACCOUNT_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: currentRefreshToken }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    throw new Error(
      `Gagal refresh Access Token Accurate (${branchName}): ${JSON.stringify(body)}. ` +
        `Kalau errornya "invalid_grant"/refresh token invalid, kemungkinan token di Supabase sudah kadaluarsa/dipakai proses lain — perlu ulang proses OAuth manual untuk cabang ini.`,
    )
  }
  // PENTING: simpan refresh_token BARU, jangan pakai yang lama lagi.
  if (body.refresh_token) {
    await saveAccurateRefreshToken(branchId, branchName, body.refresh_token)
  }
  return body.access_token as string
}

type OpenDbResult = { session: string; host: string }

async function openDatabase(accessToken: string, dbId: string): Promise<OpenDbResult> {
  const params = new URLSearchParams({ id: dbId })
  const res = await fetch(`${ACCOUNT_BASE_URL}/api/open-db.do?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json()
  if (!res.ok || !body.s) {
    throw new Error(`Gagal buka database Accurate (id ${dbId}): ${JSON.stringify(body)}`)
  }
  return { session: body.session as string, host: body.host as string }
}

export type AccurateConnection = { accessToken: string; session: string; host: string }

export async function connectToAccurateBranch(config: AccurateBranchConfig): Promise<AccurateConnection> {
  const clientId = process.env.ACCURATE_CLIENT_ID
  const clientSecret = process.env.ACCURATE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Env var ACCURATE_CLIENT_ID / ACCURATE_CLIENT_SECRET belum lengkap.')
  }
  const accessToken = await refreshAccessToken(clientId, clientSecret, config.branchId, config.branchName)
  const { session, host } = await openDatabase(accessToken, config.dbId)
  return { accessToken, session, host }
}

// =====================================================
// FASE DIAGNOSTIK — dipanggil per cabang. Ambil beberapa item pertama
// (list + detail lengkap) dari akun/database Accurate cabang itu,
// biar kelihatan lewat DevTools/Riwayat field stok yang beneran
// dipakai. Belum nulis ke product_stock.
// =====================================================
export async function syncAccurateForBranch(
  config: AccurateBranchConfig,
  triggeredBy: 'manual' | 'cron',
  createdBy?: string,
): Promise<{ branchName: string; note: string; sample: any[] }> {
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

    const params = new URLSearchParams({ 'sp.pageSize': '5', 'sp.page': '1', 'filter.itemType': 'INVENTORY' })
    const res = await fetch(`${conn.host}/accurate/api/item/list.do?${params.toString()}`, {
      headers: { Authorization: `Bearer ${conn.accessToken}`, 'X-Session-ID': conn.session },
    })
    const body = await res.json()
    if (!res.ok || !body.s) {
      throw new Error(`Gagal ambil sample item Accurate (${config.branchName}): ${JSON.stringify(body)}`)
    }
    const listItems = (body.d || []) as any[]

    const sample: any[] = []
    for (const it of listItems) {
      const detailParams = new URLSearchParams({ id: String(it.id) })
      const detailRes = await fetch(`${conn.host}/accurate/api/item/detail.do?${detailParams.toString()}`, {
        headers: { Authorization: `Bearer ${conn.accessToken}`, 'X-Session-ID': conn.session },
      })
      const detailBody = await detailRes.json()
      sample.push(detailBody.s ? detailBody.d : { error: detailBody, listFallback: it })
    }

    await supabase
      .from('stock_sync_log')
      .update({
        status: 'success',
        items_updated: 0,
        items_skipped: 0,
        error_message: `Info: mode diagnostik, belum nulis stok. Sample ${sample.length} item diambil dari akun Accurate ${config.branchName}.`,
        finished_at: new Date().toISOString(),
      })
      .eq('id', logId)

    return { branchName: config.branchName, note: 'diagnostik — belum nulis stok', sample }
  } catch (err: any) {
    await supabase
      .from('stock_sync_log')
      .update({ status: 'error', error_message: String(err?.message || err), finished_at: new Date().toISOString() })
      .eq('id', logId)
    throw err
  }
}

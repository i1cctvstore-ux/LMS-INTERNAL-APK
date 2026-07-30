import { createAdminClient } from '@/lib/supabase/admin'

// =====================================================
// Integrasi Accurate Online (AOL) untuk cabang-cabang yang pakai
// Accurate (baru Jakarta yang aktif; Purwokerto & Solo rencana
// menyusul nanti — lihat ACCURATE_BRANCH_MAP di bawah).
//
// ARSITEKTUR (revisi ke-2): setiap cabang punya AKUN ACCURATE SENDIRI-
// SENDIRI (login beda, bukan cuma database beda) — persis seperti
// Zoho (tiap cabang = tiap organisasi/akun terpisah). Jadi:
//   - Client ID & Client Secret: BOLEH SAMA untuk semua cabang (ini
//     cuma identitas "aplikasi" kita di Accurate Developer Portal,
//     bukan identitas akun toko — 1 aplikasi bisa dipakai buat
//     authorize banyak akun Accurate berbeda, mirip 1 App Zoho yang
//     bisa connect ke berbagai organisasi).
//   - Refresh Token: BEDA per cabang (karena hasil dari proses OAuth
//     manual yang dilakukan sambil login ke akun Accurate cabang
//     tersebut).
//   - DB ID: BEDA per cabang (database di dalam akun Accurate cabang
//     itu — biasanya cuma ada 1 database per akun, tapi tetap perlu
//     dicari lewat db-list.do).
//
// Jadi tiap cabang butuh proses OAuth manual SENDIRI-SENDIRI (login
// akun Accurate cabang itu, klik "Beri Akses", dapat refresh token
// khusus cabang itu) — sama seperti generate refresh token Zoho per
// organisasi dulu.
//
// FASE SEKARANG: diagnostik dulu (belum nulis ke product_stock) —
// syncAccurateForBranch() di bawah masih dalam mode "ambil sample &
// log", supaya kita bisa lihat dulu field JSON stok yang beneran
// dikirim Accurate buat akun ini, sebelum finalisasi logic penulisan
// ke database.
//
// ENV VAR:
//   ACCURATE_CLIENT_ID                 <- sama untuk semua cabang
//   ACCURATE_CLIENT_SECRET             <- sama untuk semua cabang
//   ACCURATE_OAUTH_REDIRECT_URI        <- sama untuk semua cabang
//   ACCURATE_REFRESH_TOKEN_JAKARTA     <- beda per cabang
//   ACCURATE_DB_ID_JAKARTA             <- beda per cabang
//   ACCURATE_REFRESH_TOKEN_PURWOKERTO  <- (isi nanti)
//   ACCURATE_DB_ID_PURWOKERTO          <- (isi nanti)
//   ACCURATE_REFRESH_TOKEN_SOLO        <- (isi nanti kalau Solo pindah ke Accurate)
//   ACCURATE_DB_ID_SOLO                <- (isi nanti)
// =====================================================

const ACCOUNT_BASE_URL = 'https://account.accurate.id'

// Cuma cabang yang KEDUA env var-nya (refresh token & db id) keisi
// yang bakal ikut disync — jadi aman nambah baris baru di sini duluan
// sebelum credential-nya ada, gak akan bikin error, cabang itu
// otomatis dilewati (lihat getAccurateBranchConfigs()).
const ACCURATE_BRANCH_MAP: { envRefreshTokenKey: string; envDbIdKey: string; branchId: string; branchName: string }[] = [
  {
    envRefreshTokenKey: 'ACCURATE_REFRESH_TOKEN_JAKARTA',
    envDbIdKey: 'ACCURATE_DB_ID_JAKARTA',
    branchId: '5ad7239f-a7dd-47be-9ba2-c5667a3f76b2',
    branchName: 'Jakarta',
  },
  {
    envRefreshTokenKey: 'ACCURATE_REFRESH_TOKEN_PURWOKERTO',
    envDbIdKey: 'ACCURATE_DB_ID_PURWOKERTO',
    branchId: '4c97b2cb-cf88-4e13-84c0-2f2cb8d9b612',
    branchName: 'Purwokerto',
  },
  // Solo baru menyusul kalau nanti resmi pindah dari Zoho ke Accurate:
  // {
  //   envRefreshTokenKey: 'ACCURATE_REFRESH_TOKEN_SOLO',
  //   envDbIdKey: 'ACCURATE_DB_ID_SOLO',
  //   branchId: 'ff24cbd3-f11a-4f12-b658-88ff40b1a8e3',
  //   branchName: 'Solo',
  // },
]

export type AccurateBranchConfig = { branchId: string; branchName: string; dbId: string; refreshToken: string }

// Cuma kembalikan cabang yang refresh token & DB ID-nya sudah diisi di
// Vercel — jadi tombol "Sync Semua" otomatis cuma jalanin cabang yang
// beneran siap, gak perlu ubah kode lagi waktu Purwokerto/Solo nyusul.
export function getAccurateBranchConfigs(): AccurateBranchConfig[] {
  return ACCURATE_BRANCH_MAP.filter(
    ({ envRefreshTokenKey, envDbIdKey }) => !!process.env[envRefreshTokenKey] && !!process.env[envDbIdKey],
  ).map(({ envRefreshTokenKey, envDbIdKey, branchId, branchName }) => ({
    branchId,
    branchName,
    dbId: process.env[envDbIdKey] as string,
    refreshToken: process.env[envRefreshTokenKey] as string,
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

// Dipakai SETIAP KALI proses OAuth manual per cabang (dijalankan
// beberapa kali, sekali per cabang — beda dari Zoho yang generate
// token-nya lewat Postman, di sini lewat halaman callback route),
// buat nukar Authorization Code jadi Access Token + Refresh Token
// pertama kali untuk cabang itu.
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

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch(`${ACCOUNT_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  const body = await res.json()
  if (!res.ok || !body.access_token) {
    throw new Error(`Gagal refresh Access Token Accurate: ${JSON.stringify(body)}`)
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

// Buka koneksi ke SATU cabang tertentu — pakai refresh token & DB ID
// khusus cabang itu (bukan lagi 1 refresh token buat semua cabang).
export async function connectToAccurateBranch(refreshToken: string, dbId: string): Promise<AccurateConnection> {
  const clientId = process.env.ACCURATE_CLIENT_ID
  const clientSecret = process.env.ACCURATE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Env var ACCURATE_CLIENT_ID / ACCURATE_CLIENT_SECRET belum lengkap.')
  }
  const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken)
  const { session, host } = await openDatabase(accessToken, dbId)
  return { accessToken, session, host }
}

// =====================================================
// FASE DIAGNOSTIK — dipanggil per cabang. Ambil beberapa item pertama
// APA ADANYA dari akun/database Accurate cabang itu, biar kelihatan
// lewat DevTools/Riwayat field stok yang beneran dipakai. Belum nulis
// ke product_stock.
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
    const conn = await connectToAccurateBranch(config.refreshToken, config.dbId)

    const params = new URLSearchParams({
      'sp.pageSize': '5',
      'sp.page': '1',
      'filter.itemType': 'INVENTORY',
    })
    const res = await fetch(`${conn.host}/accurate/api/item/list.do?${params.toString()}`, {
      headers: { Authorization: `Bearer ${conn.accessToken}`, 'X-Session-ID': conn.session },
    })
    const body = await res.json()
    if (!res.ok || !body.s) {
      throw new Error(`Gagal ambil sample item Accurate (${config.branchName}): ${JSON.stringify(body)}`)
    }
    const sample = (body.d || []) as any[]

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

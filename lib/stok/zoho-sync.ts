import { createAdminClient } from '@/lib/supabase/admin'

// =====================================================
// Sinkronisasi stok dari Zoho Inventory ke tabel product_stock, per
// cabang. Arahnya SATU ARAH: tarik dari Zoho, TIDAK menulis balik ke
// Zoho. Dipakai baik oleh tombol manual di UI maupun Vercel Cron.
//
// Region akun Zoho (.com/.in/.eu) bisa beda-beda tergantung tempat
// akun didaftarkan — makanya base URL-nya dibuat bisa dioverride lewat
// env var ZOHO_ACCOUNTS_BASE_URL / ZOHO_API_BASE_URL tanpa perlu ubah
// kode ini, kalau ternyata default (.com) salah.
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

type ZohoItemRow = { sku: string; available_stock: number }

async function fetchAllZohoItemStocks(
  config: ZohoOrgConfig,
  accessToken: string,
): Promise<ZohoItemRow[]> {
  const items: ZohoItemRow[] = []
  const PER_PAGE = 200
  let page = 1

  while (true) {
    const params = new URLSearchParams({
      organization_id: config.organizationId,
      page: String(page),
      per_page: String(PER_PAGE),
    })
    const res = await fetch(`${ZOHO_API_BASE_URL}/inventory/v1/items?${params.toString()}`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    })
    const body = await res.json()
    if (!res.ok || body.code !== 0) {
      throw new Error(
        `Gagal ambil daftar item Zoho (${config.branchName}, halaman ${page}): ${body.message || res.statusText}`,
      )
    }
    const pageItems = (body.items || []) as any[]
    pageItems.forEach((it) => {
      const sku = (it.sku || '').trim()
      if (!sku) return // item tanpa SKU dilewati — gak bisa dicocokkan ke katalog produk
      items.push({ sku, available_stock: Number(it.available_stock) || 0 })
    })

    const hasMore = body.page_context?.has_more_page === true || pageItems.length === PER_PAGE
    if (!hasMore) break
    page += 1
  }

  return items
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
    const zohoItems = await fetchAllZohoItemStocks(config, accessToken)

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

    let itemsUpdated = 0
    let itemsSkipped = 0
    const upsertRows: { branch_id: string; product_id: string; qty_on_hand: number }[] = []

    zohoItems.forEach((item) => {
      const productId = productIdBySku.get(normalizeSku(item.sku))
      if (!productId) {
        itemsSkipped += 1 // SKU dari Zoho ini belum ada di katalog produk internal
        return
      }
      upsertRows.push({ branch_id: branchId, product_id: productId, qty_on_hand: Math.round(item.available_stock) })
      itemsUpdated += 1
    })

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

    await supabase
      .from('stock_sync_log')
      .update({
        status: 'success',
        items_updated: itemsUpdated,
        items_skipped: itemsSkipped,
        finished_at: new Date().toISOString(),
      })
      .eq('id', logId)

    return { branchName: config.branchName, itemsUpdated, itemsSkipped }
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

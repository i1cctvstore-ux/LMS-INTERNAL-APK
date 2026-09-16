// File ini: app/api/quote-builder/sync-price-list/route.ts
// Pola sama persis kaya app/api/stok/sync-accurate/route.ts yang sudah ada.

export const maxDuration = 300 // detik (5 menit) -- price list bisa ratusan baris

import { createClient } from '@/lib/supabase/server'
import { getPriceListBranchConfigs, syncPriceListForBranch } from '@/lib/stok/price-list-sync'

async function runSync(branchIdFilter?: string, createdBy?: string) {
  const configs = (await getPriceListBranchConfigs()).filter((c) => !branchIdFilter || c.branchId === branchIdFilter)
  if (configs.length === 0) {
    return { message: 'Tidak ada konfigurasi price list (URL/token) yang cocok/siap untuk cabang ini.', results: [] }
  }
  const results = []
  for (const config of configs) {
    try {
      const r = await syncPriceListForBranch(config, branchIdFilter ? 'manual' : 'cron', createdBy)
      results.push({ ...r, status: 'success' as const })
    } catch (err: any) {
      results.push({ branchName: config.branchName, status: 'error' as const, message: String(err?.message || err) })
    }
  }
  return { results }
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ message: 'Unauthorized.' }, { status: 401 })
  }
  const result = await runSync()
  return Response.json(result)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ message: 'Belum login.' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const branchId = typeof body?.branchId === 'string' ? body.branchId : undefined
  const result = await runSync(branchId, user.id)

  // 2026-09: triggerManualSync() di lib/quote-builder/api.ts nunggu
  // bentuk { batchId, productCount, status } (bukan { results: [...] }
  // kaya route sync-accurate) -- flatten hasil single-branch di sini
  // biar cocok sama yang ditunggu ProductCatalogPage.
  const first = result.results?.[0]
  if (!first) return Response.json(result, { status: 400 })
  if (first.status === 'error') return Response.json({ message: first.message }, { status: 500 })
  const { status, ...rest } = first
  return Response.json({ ...rest, status: 'success' })
}

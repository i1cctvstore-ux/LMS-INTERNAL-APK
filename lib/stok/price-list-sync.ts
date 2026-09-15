// File ini: lib/stok/price-list-sync.ts
//
// Sync harga produk dari Google Sheet (via Apps Script Web App, lihat
// sync-price-list.gs -- itu file YANG DIPASTE ke Extensions > Apps
// Script di Google Sheet pricelist cabang, BUKAN bagian dari repo ini)
// ke tabel `products` / `product_prices` / `sync_batches` Quote
// Builder.
//
// 2026-09: awalnya didesain sebagai Supabase Edge Function (butuh
// `supabase functions deploy` -- CLI). Diganti jadi Next.js API route
// biasa (pola SAMA PERSIS kaya lib/stok/accurate-sync.ts +
// app/api/stok/sync-accurate/route.ts) -- deploy-nya cukup commit ke
// GitHub kaya semua perubahan lain, gak perlu CLI/terminal sama
// sekali.
//
// ATURAN PENTING: tier harga "modal" TIDAK PERNAH ditulis ke
// product_prices, sesuai catatan di 001_quote_builder_schema.sql --
// modal adalah harga cost internal, jangan sampai ada jalur manapun
// yang bisa nongolin dia di penawaran customer.

import { createAdminClient } from '@/lib/supabase/admin'

// UUID branch -- SAMA PERSIS dengan BR_JAKARTA dkk yang sudah dipakai
// di lib/nav-config.tsx / stok-module.tsx / stok-opname. Cuma Jakarta
// yang sudah punya Google Sheet + Apps Script Web App sekarang (lihat
// sync-price-list.gs) -- cabang lain nyusul kalau sumbernya sudah ada.
const BR_JAKARTA = '5ad7239f-a7dd-47be-9ba2-c5667a3f76b2'
const BR_SOLO = 'ff24cbd3-f11a-4f12-b658-88ff40b1a8e3'
const BR_BALI = '9b4c7834-2e20-4416-8163-2faff97294c0'
const BR_PWT = '4c97b2cb-cf88-4e13-84c0-2f2cb8d9b612'

const PRICE_LIST_BRANCH_MAP = [
  { branchId: BR_JAKARTA, branchName: 'Jakarta', envKeySuffix: 'JAKARTA' },
  { branchId: BR_SOLO, branchName: 'Solo', envKeySuffix: 'SOLO' },
  { branchId: BR_BALI, branchName: 'Bali', envKeySuffix: 'BALI' },
  { branchId: BR_PWT, branchName: 'Purwokerto', envKeySuffix: 'PURWOKERTO' },
] as const

export type PriceListBranchConfig = { branchId: string; branchName: string; sourceUrl: string; sourceToken: string }

// Cuma balikin cabang yang 2 env var-nya (URL Web App + token) SUDAH
// diisi di Vercel (Project Settings > Environment Variables):
//   PRICE_LIST_SOURCE_URL_<NAMA>   -- Web App URL dari Apps Script deploy
//   PRICE_LIST_SOURCE_TOKEN_<NAMA> -- SYNC_TOKEN yang sama kaya di Script Properties
export async function getPriceListBranchConfigs(): Promise<PriceListBranchConfig[]> {
  return PRICE_LIST_BRANCH_MAP.filter(
    ({ envKeySuffix }) => !!process.env[`PRICE_LIST_SOURCE_URL_${envKeySuffix}`] && !!process.env[`PRICE_LIST_SOURCE_TOKEN_${envKeySuffix}`],
  ).map(({ branchId, branchName, envKeySuffix }) => ({
    branchId,
    branchName,
    sourceUrl: process.env[`PRICE_LIST_SOURCE_URL_${envKeySuffix}`] as string,
    sourceToken: process.env[`PRICE_LIST_SOURCE_TOKEN_${envKeySuffix}`] as string,
  }))
}

type SheetRow = {
  category: string
  name: string
  brand: string
  sku: string
  priceList: number | null
  hargaOnline: number | null
  qtyDiscount: number | null
  resellerDpp: number | null
  resellerSpecial: number | null
  modal: number | null // dibaca tapi SENGAJA tidak pernah ditulis -- lihat catatan di atas
  rowNumber: number
}
type SheetPayload = { sheetVersion: string; generatedAt: string; rowCount: number; rows: SheetRow[]; warnings: string[] }

export type SyncResult = { branchName: string; batchId: string; productCount: number; skippedNoSku: number; warnings: string[] }

export async function syncPriceListForBranch(
  config: PriceListBranchConfig,
  triggeredBy: 'manual' | 'cron',
  createdBy?: string,
): Promise<SyncResult> {
  const supabase = createAdminClient()

  const { data: batchRow, error: batchInsertErr } = await supabase
    .from('sync_batches')
    .insert({ branch_id: config.branchId, source_type: 'google_sheet', triggered_by: createdBy || null })
    .select('id')
    .single()
  if (batchInsertErr) throw new Error(batchInsertErr.message)
  const batchId = batchRow.id as string

  try {
    const url = `${config.sourceUrl}${config.sourceUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(config.sourceToken)}`
    const res = await fetch(url)
    const body = (await res.json().catch(() => null)) as (SheetPayload & { error?: string; message?: string }) | null
    if (!res.ok || !body) {
      throw new Error(`Gagal ambil price list dari Google Sheet (HTTP ${res.status}): ${body ? JSON.stringify(body) : await res.text().catch(() => '(respons bukan JSON)')}`)
    }
    if (body.error) {
      throw new Error(`Apps Script menolak request: ${body.error}${body.message ? ` -- ${body.message}` : ''} (cek SYNC_TOKEN di Script Properties vs PRICE_LIST_SOURCE_TOKEN_* di Vercel, harus sama persis)`)
    }

    let productCount = 0
    let skippedNoSku = 0

    // 2026-09: SEBELUMNYA upsert produk + insert harga dilakukan
    // SATU-SATU per baris (await di dalam loop) -- buat 805 baris,
    // itu ratusan round-trip berurutan ke Supabase, jauh melebihi
    // limit waktu function di plan Vercel Hobby (~60 detik) -> selalu
    // gagal 504 Gateway Timeout. Sekarang di-batch: upsert produk
    // dalam beberapa panggilan besar, lalu insert harga dalam
    // beberapa batch besar -- total cuma butuh belasan round-trip,
    // bukan ribuan.
    const validRows = body.rows.filter((row) => {
      const sku = row.sku.trim()
      if (!sku) {
        skippedNoSku++
        return false
      }
      return true
    })

    const productUpserts = validRows.map((row) => ({
      branch_id: config.branchId,
      sku: row.sku.trim(),
      name: row.name,
      brand: row.brand || null,
      category: row.category || null,
      is_active: true,
      source_updated_at: new Date().toISOString(),
    }))

    // Batch 500 baris per panggilan (bukan sekaligus semua -- jaga-
    // jaga kalau row-nya nanti nambah banyak). `.select("id, sku")`
    // langsung balikin id yang baru di-upsert, jadi gak perlu query
    // terpisah buat dapetin product_id.
    const BATCH = 500
    const productIdBySku = new Map<string, string>()
    for (let i = 0; i < productUpserts.length; i += BATCH) {
      const chunk = productUpserts.slice(i, i + BATCH)
      const { data: rows, error: productErr } = await supabase
        .from('products')
        .upsert(chunk, { onConflict: 'branch_id,sku' })
        .select('id, sku')
      if (productErr) throw new Error(`Gagal simpan batch produk (baris ke-${i + 1} s.d. ${i + chunk.length}): ${productErr.message}`)
      ;(rows ?? []).forEach((r: any) => productIdBySku.set(r.sku, r.id))
      productCount += chunk.length
    }

    // Tier yang ditulis -- price_list, online, qty_discount, reseller_dpp,
    // reseller_special. "modal" TIDAK ADA DI SINI SAMA SEKALI, sengaja.
    const priceInserts: Array<{ product_id: string; price_tier: string; amount: number; sync_batch_id: string }> = []
    for (const row of validRows) {
      const productId = productIdBySku.get(row.sku.trim())
      if (!productId) continue // seharusnya gak pernah terjadi, tapi jaga-jaga
      const entries: Array<[string, number | null]> = [
        ['price_list', row.priceList],
        ['online', row.hargaOnline],
        ['qty_discount', row.qtyDiscount],
        ['reseller_dpp', row.resellerDpp],
        ['reseller_special', row.resellerSpecial],
      ]
      entries
        .filter(([, amount]) => amount !== null)
        .forEach(([priceTier, amount]) => priceInserts.push({ product_id: productId, price_tier: priceTier, amount: amount as number, sync_batch_id: batchId }))
    }

    for (let i = 0; i < priceInserts.length; i += BATCH) {
      const chunk = priceInserts.slice(i, i + BATCH)
      const { error: priceErr } = await supabase.from('product_prices').insert(chunk)
      if (priceErr) throw new Error(`Gagal simpan batch harga (baris ke-${i + 1} s.d. ${i + chunk.length}): ${priceErr.message}`)
    }

    await supabase
      .from('sync_batches')
      .update({ status: 'success', source_version: body.sheetVersion, product_count: productCount, finished_at: new Date().toISOString() })
      .eq('id', batchId)

    return { branchName: config.branchName, batchId, productCount, skippedNoSku, warnings: body.warnings }
  } catch (err: any) {
    await supabase
      .from('sync_batches')
      .update({ status: 'failed', error_summary: String(err?.message || err).slice(0, 2000), finished_at: new Date().toISOString() })
      .eq('id', batchId)
    throw err
  }
}

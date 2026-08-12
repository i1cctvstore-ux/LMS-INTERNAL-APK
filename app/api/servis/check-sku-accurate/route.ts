// File ini: app/api/servis/check-sku-accurate/route.ts
//
// Endpoint READ-ONLY — narik daftar item LANGSUNG dari Accurate (bukan
// dari tabel product_stock yang udah ke-sync), lalu dibandingin ke
// katalog service_products. TIDAK nulis apa-apa ke database — murni
// buat bantu Admin Pusat nemuin SKU yang "nyasar" (beda/ketinggalan
// update) antara master produk Servis dan Accurate.
//
// GET /api/servis/check-sku-accurate?branchId=<uuid opsional>
// Tanpa ?branchId, cek SEMUA cabang yang punya akun Accurate sendiri
// (Jakarta, Purwokerto — bukan Accurate Solo, karena itu database
// konsinyasi multi-gudang, bukan katalog produk cabang).
//
// 3 kategori hasil per cabang:
//   1. cocokSku      — SKU di Accurate ketemu persis di katalog kita. Aman.
//   2. cocokNamaBeda Sku — nama produk cocok, tapi SKU di Accurate BEDA
//      dari SKU yang tersimpan di katalog kita untuk produk itu — kandidat
//      "SKU perlu dikoreksi manual" (pola sama kayak Koreksi SKU di Data
//      Master Servis).
//   3. gakKetemuSamaSekali — item di Accurate yang SKU dan namanya
//      dua-duanya gak match apapun di katalog kita. Kalau sync Accurate
//      udah pernah jalan sukses, ini SEHARUSNYA kosong (soalnya sync
//      otomatis bikin produk baru) — kalau ada isinya, tandanya sync
//      belum sempat jalan buat item ini.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getAccurateBranchConfigs,
  connectToAccurateBranch,
  fetchAllItemIds,
  fetchItemDetail,
  stripKonsiSuffix,
} from '@/lib/stok/accurate-sync'

function normalizeSku(s: string): string {
  return (s || '')
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
}
function normalizeName(s: string): string {
  return (s || '').trim().toLowerCase()
}

export async function GET(req: NextRequest) {
  const branchIdParam = req.nextUrl.searchParams.get('branchId')

  try {
    const allConfigs = await getAccurateBranchConfigs()
    const configs = branchIdParam ? allConfigs.filter((c) => c.branchId === branchIdParam) : allConfigs
    if (configs.length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada cabang Accurate yang siap dicek (belum ada refresh token / ACCURATE_DB_ID_*, atau branchId tidak dikenali).' },
        { status: 400 },
      )
    }

    const supabase = createAdminClient()
    const catalog: { id: string; sku: string; name: string }[] = []
    {
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data, error } = await supabase.from('service_products').select('id, sku, name').range(from, from + PAGE - 1)
        if (error) throw new Error(error.message)
        catalog.push(...((data as any) || []))
        if (!data || data.length < PAGE) break
        from += PAGE
      }
    }
    const catalogBySku = new Map<string, { id: string; sku: string; name: string }>()
    catalog.forEach((p) => catalogBySku.set(normalizeSku(p.sku), p))
    const catalogByName = new Map<string, { id: string; sku: string; name: string }>()
    catalog.forEach((p) => {
      const key = normalizeName(p.name)
      if (key) catalogByName.set(key, p)
    })

    const results: any[] = []

    for (const config of configs) {
      const conn = await connectToAccurateBranch(config)
      const itemIds = await fetchAllItemIds(conn)

      const CONCURRENCY = 15
      const rawItems: { no: string; name: string }[] = []
      for (let i = 0; i < itemIds.length; i += CONCURRENCY) {
        const batch = itemIds.slice(i, i + CONCURRENCY)
        const details = await Promise.all(batch.map((id) => fetchItemDetail(conn, id)))
        details.forEach((d) => {
          if (d) rawItems.push({ no: d.no, name: d.name })
        })
      }

      // Item "(K)" dipetakan balik ke SKU dasarnya (sama kayak sync
      // asli) — dedupe biar item normal & versi (K)-nya gak dobel
      // dihitung sebagai 2 item beda.
      const seenSku = new Set<string>()
      const accurateItems: { sku: string; name: string }[] = []
      rawItems.forEach((it) => {
        const { base } = stripKonsiSuffix(it.no)
        const key = normalizeSku(base)
        if (!key || seenSku.has(key)) return
        seenSku.add(key)
        accurateItems.push({ sku: base, name: it.name })
      })

      const cocokSku: { sku: string; nama: string }[] = []
      const cocokNamaBedaSku: { accurateSku: string; katalogSku: string; nama: string }[] = []
      const gakKetemuSamaSekali: { sku: string; nama: string }[] = []

      accurateItems.forEach((it) => {
        const skuKey = normalizeSku(it.sku)
        if (catalogBySku.has(skuKey)) {
          cocokSku.push({ sku: it.sku, nama: it.name })
          return
        }
        const nameHit = catalogByName.get(normalizeName(it.name))
        if (nameHit) {
          cocokNamaBedaSku.push({ accurateSku: it.sku, katalogSku: nameHit.sku, nama: it.name })
          return
        }
        gakKetemuSamaSekali.push({ sku: it.sku, nama: it.name })
      })

      results.push({
        branchId: config.branchId,
        branchName: config.branchName,
        totalItemAccurate: accurateItems.length,
        cocokSkuCount: cocokSku.length,
        cocokNamaBedaSku,
        gakKetemuSamaSekali,
      })
    }

    return NextResponse.json({ results })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}

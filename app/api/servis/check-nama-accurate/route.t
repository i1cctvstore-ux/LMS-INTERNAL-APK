import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getAccurateBranchConfigs,
  connectToAccurateBranch,
  fetchAllItemIds,
  fetchItemDetail,
  stripKonsiSuffix,
} from '@/lib/stok/accurate-sync'

// =====================================================
// GET /api/servis/check-nama-accurate?branchId=
//
// Bandingin nama produk yang TERSIMPAN di katalog kita vs nama LIVE di
// Accurate SEKARANG JUGA. Beda dari sync biasa: sync cuma nulis nama
// pas produk PERTAMA KALI dibikin, gak pernah nge-refresh lagi setelah
// itu -- jadi kalau ada typo di Accurate yang udah dibenerin belakangan
// (misal "NVR" -> "DVR"), salinan lama yang salah tetap nyangkut di
// sistem kita. Tool ini nyari SEMUA kasus kayak gitu sekaligus, biar
// gak perlu nebak-nebak pola satu-satu.
//
// Read-only -- gak nulis apa-apa ke database, cuma laporan buat
// direview manual (ada tombol "Perbaiki" per baris di sisi UI).
// =====================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const onlyBranchId = searchParams.get('branchId')

    const configs = await getAccurateBranchConfigs()
    const targets = onlyBranchId ? configs.filter((c) => c.branchId === onlyBranchId) : configs
    if (targets.length === 0) {
      return NextResponse.json({ error: 'Konfigurasi cabang Accurate tidak ditemukan.' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Katalog kita (sku -> {id, name}) buat dibandingin.
    const catalogBySku = new Map<string, { id: string; name: string }>()
    {
      let from = 0
      const PAGE = 1000
      while (true) {
        const { data, error } = await supabase.from('service_products').select('id, sku, name').range(from, from + PAGE - 1)
        if (error) throw new Error(error.message)
        ;(data || []).forEach((p: any) => {
          const key = (p.sku || '').trim().toLowerCase()
          if (key) catalogBySku.set(key, { id: p.id, name: p.name })
        })
        if (!data || data.length < PAGE) break
        from += PAGE
      }
    }

    const results: {
      branchName: string
      sku: string
      productId: string
      namaKita: string
      namaAccurate: string
    }[] = []

    for (const config of targets) {
      const conn = await connectToAccurateBranch(config)
      const itemIds = await fetchAllItemIds(conn)

      const CONCURRENCY = 15
      for (let i = 0; i < itemIds.length; i += CONCURRENCY) {
        const batch = itemIds.slice(i, i + CONCURRENCY)
        const details = await Promise.all(batch.map((id) => fetchItemDetail(conn, id)))
        details.forEach((d) => {
          if (!d) return
          const skuResult = stripKonsiSuffix(d.no)
          const nameResult = stripKonsiSuffix(d.name)
          const key = skuResult.base.trim().toLowerCase()
          const match = catalogBySku.get(key)
          if (!match) return // SKU ini belum ada di katalog kita sama sekali -- itu urusan "Cek SKU vs Accurate", bukan di sini
          const namaAccurate = (nameResult.base || skuResult.base).trim()
          const namaKita = (match.name || '').trim()
          if (namaKita && namaAccurate && namaKita !== namaAccurate) {
            results.push({
              branchName: config.branchName,
              sku: skuResult.base,
              productId: match.id,
              namaKita,
              namaAccurate,
            })
          }
        })
      }
    }

    return NextResponse.json({ results })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}

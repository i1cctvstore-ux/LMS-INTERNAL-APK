// File ini: app/api/stok/accurate-diag/route.ts
//
// Endpoint diagnostik SEMENTARA — dipanggil manual (buka URL-nya
// langsung di browser). Loop ke semua cabang Accurate yang sudah
// punya DB ID di env var (sekarang cuma Jakarta; Purwokerto/Solo
// otomatis ikut kalau env var-nya sudah diisi nanti — lihat
// getAccurateBranchConfigs() di lib/stok/accurate-sync.ts).
//
// Tujuannya cuma buat LIHAT bentuk data mentah item dari Accurate
// per cabang, belum nulis apapun ke product_stock.
//
// Setelah fase diagnostik ini kelar, file ini sebaiknya DIHAPUS atau
// dikunci di belakang autentikasi admin, karena isinya data stok
// mentah.

import { NextResponse } from 'next/server'
import { getAccurateBranchConfigs, syncAccurateForBranch } from '@/lib/stok/accurate-sync'

export async function GET() {
  const configs = getAccurateBranchConfigs()
  if (configs.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Belum ada cabang Accurate yang env var DB ID-nya keisi (ACCURATE_DB_ID_JAKARTA dkk).' },
      { status: 400 },
    )
  }

  const results = []
  for (const config of configs) {
    try {
      const result = await syncAccurateForBranch(config, 'manual')
      results.push({ branchName: result.branchName, status: 'ok', sample: result.sample })
    } catch (err: any) {
      results.push({ branchName: config.branchName, status: 'error', error: String(err?.message || err) })
    }
  }

  return NextResponse.json({ ok: true, results }, { status: 200 })
}

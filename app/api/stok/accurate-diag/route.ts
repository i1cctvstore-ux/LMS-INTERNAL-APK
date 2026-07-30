// File ini: app/api/stok/accurate-diag/route.ts
//
// Endpoint diagnostik SEMENTARA — dipanggil manual di browser. Loop ke
// semua cabang Accurate yang DB ID-nya sudah di env var DAN refresh
// token-nya sudah tersimpan di Supabase (hasil proses OAuth manual).
//
// Setelah fase diagnostik ini kelar, file ini sebaiknya DIHAPUS atau
// dikunci di belakang autentikasi admin, karena isinya data stok
// mentah.

import { NextResponse } from 'next/server'
import { getAccurateBranchConfigs, syncAccurateForBranch } from '@/lib/stok/accurate-sync'

export async function GET() {
  const configs = await getAccurateBranchConfigs()
  if (configs.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Belum ada cabang Accurate yang siap (butuh ACCURATE_DB_ID_<CABANG> di env var DAN refresh token tersimpan di tabel accurate_oauth_tokens hasil proses OAuth manual).',
      },
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

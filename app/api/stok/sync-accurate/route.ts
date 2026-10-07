// File ini: app/api/stok/sync-accurate/route.ts
// Pola sama persis kaya app/api/stok/sync-zoho/route.ts yang sudah ada.

// Naikkan batas waktu maksimal function (default Vercel cuma 10-15
// detik) — sync Accurate manggil ratusan API call, walau sudah
// diparalelkan tetap butuh waktu lebih dari default.
export const maxDuration = 300 // detik (5 menit)

import { createClient } from '@/lib/supabase/server'
import { getAccurateBranchConfigs, syncAccurateForBranch } from '@/lib/stok/accurate-sync'

async function runSync(branchIdFilter?: string, createdBy?: string, trigger?: 'manual' | 'cron') {
  // 2026-09: SEMUA cabang jalan berurutan dalam 1 function (maxDuration
  // 300 detik) -- batas waktunya dipakai bersama. Cabang yang kehabisan
  // waktu berhenti rapi & tercatat "Gagal" di Riwayat Stok (bukan
  // dimatikan paksa lalu nyangkut "Berjalan").
  const deadlineAt = Date.now() + 270_000
  const configs = (await getAccurateBranchConfigs()).filter((c) => !branchIdFilter || c.branchId === branchIdFilter)
  if (configs.length === 0) {
    return { message: `Tidak ada konfigurasi Accurate yang cocok/siap untuk cabang ini.`, results: [] }
  }
  const results = []
  for (const config of configs) {
    try {
      const r = await syncAccurateForBranch(config, trigger || (branchIdFilter ? 'manual' : 'cron'), createdBy, deadlineAt)
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
  // FIX 6 Okt 2026 -- cron dipecah PER CABANG (?branch=jakarta /
  // ?branch=purwokerto, lihat vercel.json). Dulu 1 cron menjalankan
  // semua cabang berurutan dalam 1 function, berbagi 270 detik yang
  // sama -- Purwokerto (1646 item) jalan SETELAH Jakarta, sisa waktunya
  // tidak cukup -> "Waktu habis di tahap ambil detail item". Sekarang
  // tiap cabang dapat function & batas waktu sendiri.
  // Tanpa ?branch tetap jalan semua cabang (perilaku lama).
  const branchParam = new URL(request.url).searchParams.get('branch')?.trim().toLowerCase()
  let branchId: string | undefined
  if (branchParam) {
    const configs = await getAccurateBranchConfigs()
    branchId = configs.find((c) => c.branchName.toLowerCase() === branchParam || c.branchId === branchParam)?.branchId
    if (!branchId) {
      return Response.json({ message: `Cabang "${branchParam}" tidak ditemukan / belum dikonfigurasi Accurate.` }, { status: 400 })
    }
  }
  const result = await runSync(branchId, undefined, 'cron')
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
  let branchId = typeof body?.branchId === 'string' ? body.branchId : undefined
  // 7 Okt 2026 -- boleh juga pakai nama cabang ({ branch: 'purwokerto' }) supaya
  // tombol "Sync Semua" bisa memanggil tiap cabang di request terpisah (tiap
  // request dapat batas waktu 300 detik sendiri, tidak berbagi dengan cabang lain).
  const branchName = typeof body?.branch === 'string' ? body.branch.trim().toLowerCase() : ''
  if (!branchId && branchName) {
    const configs = await getAccurateBranchConfigs()
    branchId = configs.find((c) => c.branchName.toLowerCase() === branchName)?.branchId
    if (!branchId) {
      return Response.json({ message: `Cabang "${body.branch}" tidak ditemukan / belum dikonfigurasi Accurate.`, results: [] }, { status: 400 })
    }
  }
  const result = await runSync(branchId, user.id)
  return Response.json(result)
}

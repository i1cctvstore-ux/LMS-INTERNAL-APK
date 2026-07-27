import { createClient } from '@/lib/supabase/server'
import { getZohoOrgConfigs, syncZohoForBranch } from '@/lib/stok/zoho-sync'

// =====================================================
// POST /api/stok/sync-zoho — dipanggil dari tombol "Sync dari Zoho"
// di UI. Butuh user login (Admin Cabang boleh sync cabangnya sendiri,
// Super Admin boleh sync semua).
//
// GET /api/stok/sync-zoho — dipanggil otomatis oleh Vercel Cron
// (lihat vercel.json). Vercel otomatis nyertain header
// "Authorization: Bearer <CRON_SECRET>" kalau env var CRON_SECRET
// sudah diset di project settings — jadi endpoint ini TIDAK bisa
// dipanggil orang luar tanpa tau CRON_SECRET itu.
// =====================================================

async function runSync(branchNameFilter?: string, createdBy?: string) {
  const configs = getZohoOrgConfigs().filter(
    (c) => !branchNameFilter || c.branchName.toLowerCase() === branchNameFilter.toLowerCase(),
  )
  if (configs.length === 0) {
    return { message: `Tidak ada konfigurasi Zoho yang cocok untuk cabang "${branchNameFilter}".`, results: [] }
  }
  const results = []
  for (const config of configs) {
    try {
      const r = await syncZohoForBranch(config, branchNameFilter ? 'manual' : 'cron', createdBy)
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
  // Cron menjalankan sinkronisasi buat SEMUA cabang yang sudah
  // dikonfigurasi Zoho-nya (Solo + Bali sejauh ini).
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
  const branchName = typeof body?.branchName === 'string' ? body.branchName : undefined
  const result = await runSync(branchName, user.id)
  return Response.json(result)
}

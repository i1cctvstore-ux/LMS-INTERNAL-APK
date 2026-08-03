// File ini: app/api/stok/sync-accurate/route.ts
// Pola sama persis kaya app/api/stok/sync-zoho/route.ts yang sudah ada.

import { createClient } from '@/lib/supabase/server'
import { getAccurateBranchConfigs, syncAccurateForBranch } from '@/lib/stok/accurate-sync'

async function runSync(branchIdFilter?: string, createdBy?: string) {
  const configs = (await getAccurateBranchConfigs()).filter((c) => !branchIdFilter || c.branchId === branchIdFilter)
  if (configs.length === 0) {
    return { message: `Tidak ada konfigurasi Accurate yang cocok/siap untuk cabang ini.`, results: [] }
  }
  const results = []
  for (const config of configs) {
    try {
      const r = await syncAccurateForBranch(config, branchIdFilter ? 'manual' : 'cron', createdBy)
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
  return Response.json(result)
}

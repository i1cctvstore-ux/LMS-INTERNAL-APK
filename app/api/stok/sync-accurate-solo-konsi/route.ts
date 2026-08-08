// File ini: app/api/stok/sync-accurate-solo-konsi/route.ts

import { createClient } from '@/lib/supabase/server'
import { syncAccurateSoloMultiGudang } from '@/lib/stok/accurate-sync'

export const maxDuration = 300

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ message: 'Unauthorized.' }, { status: 401 })
  }
  try {
    const result = await syncAccurateSoloMultiGudang('cron')
    return Response.json({ results: [{ ...result, status: 'success' }] })
  } catch (err: any) {
    return Response.json({ results: [{ branchName: 'Solo (multi-gudang)', status: 'error', message: String(err?.message || err) }] })
  }
}

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ message: 'Belum login.' }, { status: 401 })
  }
  try {
    const result = await syncAccurateSoloMultiGudang('manual', user.id)
    return Response.json({ results: [{ ...result, status: 'success' }] })
  } catch (err: any) {
    return Response.json({ results: [{ branchName: 'Solo (multi-gudang)', status: 'error', message: String(err?.message || err) }] })
  }
}

// File ini: app/api/stok/accurate-db-list/route.ts
//
// Endpoint bantu SEMENTARA — buat lihat daftar database Accurate yang
// bisa diakses oleh refresh token yang UDAH TERSIMPAN di Supabase buat
// cabang tertentu (jadi gak perlu lagi copy-paste access_token manual
// dari halaman callback). Panggil dengan ?branchId=<uuid cabang>.
//
// Setelah nemu DB ID yang dicari, endpoint ini boleh dihapus lagi dari
// GitHub kalau mau (bukan bagian permanen dari fitur sync).

import { NextRequest, NextResponse } from 'next/server'

const ACCOUNT_BASE_URL = 'https://account.accurate.id'

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

export async function GET(req: NextRequest) {
  const branchId = req.nextUrl.searchParams.get('branchId')
  if (!branchId) {
    return NextResponse.json({ error: 'Tambahkan ?branchId=<uuid cabang> di URL.' }, { status: 400 })
  }

  const clientId = process.env.ACCURATE_CLIENT_ID
  const clientSecret = process.env.ACCURATE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Env var ACCURATE_CLIENT_ID / ACCURATE_CLIENT_SECRET belum ada.' }, { status: 500 })
  }

  try {
    // Ambil refresh token yang tersimpan buat cabang ini.
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('accurate_oauth_tokens')
      .select('refresh_token, branch_name')
      .eq('branch_id', branchId)
      .single()
    if (error || !data) {
      return NextResponse.json({ error: 'Belum ada refresh token tersimpan buat branchId ini.' }, { status: 404 })
    }

    // Tukar jadi access token baru.
    const tokenRes = await fetch(`${ACCOUNT_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(clientId, clientSecret), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token }),
    })
    const tokenBody = await tokenRes.json()
    if (!tokenRes.ok || !tokenBody.access_token) {
      return NextResponse.json({ error: 'Gagal refresh token', detail: tokenBody }, { status: 500 })
    }

    // Simpan lagi refresh_token baru hasil rotasi.
    if (tokenBody.refresh_token) {
      await supabase
        .from('accurate_oauth_tokens')
        .update({ refresh_token: tokenBody.refresh_token, updated_at: new Date().toISOString() })
        .eq('branch_id', branchId)
    }

    // Ambil daftar database.
    const dbRes = await fetch(`${ACCOUNT_BASE_URL}/api/db-list.do`, {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
    })
    const dbBody = await dbRes.json()

    return NextResponse.json({ branchName: data.branch_name, databases: dbBody.d || dbBody })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}

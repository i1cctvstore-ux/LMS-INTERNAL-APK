// File ini: app/api/stok/accurate-oauth-callback/route.ts
//
// Endpoint callback OAuth Accurate — dijalankan SEKALI PER CABANG
// (tiap kali kamu lakukan proses "Beri Akses" login sebagai akun
// Accurate cabang tertentu). Token LANGSUNG DISIMPAN ke Supabase
// (bukan ditampilin buat di-copy manual) — karena Accurate merotasi
// refresh token tiap dipakai, jadi harus disimpan di tempat yang bisa
// diupdate otomatis oleh server (lihat lib/stok/accurate-sync.ts).
//
// CARA PAKAI per cabang: waktu buka URL authorize, tambahkan param
// &state=<branchId> supaya callback ini tau token ini punya cabang
// mana. Contoh untuk Jakarta:
//   https://account.accurate.id/oauth/authorize?client_id=...&response_type=code&redirect_uri=...&scope=item_view&state=5ad7239f-a7dd-47be-9ba2-c5667a3f76b2

import { NextRequest, NextResponse } from 'next/server'
import { exchangeAuthorizationCode, saveAccurateRefreshToken } from '@/lib/stok/accurate-sync'

// Daftar cabang yang boleh terima token lewat callback ini — dicocokkan
// dari param `state`. Disalin manual dari daftar cabang Accurate di
// lib/stok/accurate-sync.ts supaya file ini gak perlu import daftar
// privat dari sana.
const BRANCH_NAME_BY_ID: Record<string, string> = {
  '5ad7239f-a7dd-47be-9ba2-c5667a3f76b2': 'Jakarta',
  '4c97b2cb-cf88-4e13-84c0-2f2cb8d9b612': 'Purwokerto',
  'ff24cbd3-f11a-4f12-b658-88ff40b1a8e3': 'Solo',
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const branchId = req.nextUrl.searchParams.get('state')

  if (!code) {
    return NextResponse.json({ error: 'Parameter ?code= tidak ditemukan di URL.' }, { status: 400 })
  }
  if (!branchId || !BRANCH_NAME_BY_ID[branchId]) {
    return NextResponse.json(
      { error: 'Parameter ?state= (branch id) tidak ada atau tidak dikenali. Tambahkan &state=<branchId> di URL authorize.' },
      { status: 400 },
    )
  }

  const clientId = process.env.ACCURATE_CLIENT_ID
  const clientSecret = process.env.ACCURATE_CLIENT_SECRET
  const redirectUri = process.env.ACCURATE_OAUTH_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: 'Env var ACCURATE_CLIENT_ID / ACCURATE_CLIENT_SECRET / ACCURATE_OAUTH_REDIRECT_URI belum diisi di Vercel.' },
      { status: 500 },
    )
  }

  try {
    const tokenResult = await exchangeAuthorizationCode(code, clientId, clientSecret, redirectUri)
    const branchName = BRANCH_NAME_BY_ID[branchId]
    await saveAccurateRefreshToken(branchId, branchName, tokenResult.refresh_token)

    const html = `
      <html>
        <body style="font-family: sans-serif; padding: 24px; line-height: 1.6;">
          <h2>Berhasil</h2>
          <p>Refresh token untuk cabang <b>${branchName}</b> sudah otomatis tersimpan ke database.
          Gak perlu copy-paste manual lagi.</p>
          <p>Sekarang cabang ini siap dipakai buat sync (setelah env var
          <code>ACCURATE_DB_ID_${branchName.toUpperCase()}</code> juga sudah diisi di Vercel).</p>
        </body>
      </html>
    `
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}

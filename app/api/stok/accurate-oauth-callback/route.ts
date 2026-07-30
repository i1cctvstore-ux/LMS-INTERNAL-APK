// File ini: app/api/stok/accurate-oauth-callback/route.ts
//
// Endpoint SEKALI PAKAI buat proses OAuth manual Accurate. Alurnya:
// 1. Kamu buka URL authorize Accurate di browser (lihat instruksi chat),
//    login, klik "Beri Akses".
// 2. Accurate redirect balik ke URL endpoint INI dengan ?code=xxxxx
// 3. Endpoint ini nukar code itu jadi access_token + refresh_token,
//    lalu TAMPILIN refresh_token-nya di halaman browser kamu sendiri.
// 4. Kamu copy refresh_token itu, taruh sebagai env var ACCURATE_REFRESH_TOKEN
//    di Vercel. JANGAN paste refresh_token ini ke chat manapun.
//
// Setelah proses ini kelar 1x, endpoint ini gak perlu dipanggil lagi
// kecuali refresh_token-nya di-revoke/rusak dan perlu di-generate ulang.

import { NextRequest, NextResponse } from 'next/server'
import { exchangeAuthorizationCode } from '@/lib/stok/accurate-sync'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.json({ error: 'Parameter ?code= tidak ditemukan di URL.' }, { status: 400 })
  }

  const clientId = process.env.ACCURATE_CLIENT_ID
  const clientSecret = process.env.ACCURATE_CLIENT_SECRET
  // Redirect URI HARUS sama persis dengan yang didaftarkan di Area
  // Developer Accurate & yang dipakai waktu buka URL authorize.
  const redirectUri = process.env.ACCURATE_OAUTH_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error:
          'Env var ACCURATE_CLIENT_ID / ACCURATE_CLIENT_SECRET / ACCURATE_OAUTH_REDIRECT_URI belum diisi di Vercel. Isi dulu sebelum buka URL authorize.',
      },
      { status: 500 },
    )
  }

  try {
    const tokenResult = await exchangeAuthorizationCode(code, clientId, clientSecret, redirectUri)

    // Ditampilin sebagai halaman HTML sederhana di browser KAMU SENDIRI
    // (bukan dikirim ke server lain, bukan di-log) — supaya gampang
    // di-copy manual. Halaman ini aman dibuka karena cuma kamu yang
    // pegang URL callback dengan code sekali-pakai ini.
    const html = `
      <html>
        <body style="font-family: sans-serif; padding: 24px; line-height: 1.6;">
          <h2>Berhasil dapat token dari Accurate ✅</h2>
          <p><b>Langkah selanjutnya:</b> copy nilai <code>refresh_token</code> di bawah ini,
          taruh sebagai env var <code>ACCURATE_REFRESH_TOKEN</code> di Vercel.
          Setelah itu redeploy, lalu langkah ini gak perlu diulang lagi.</p>
          <p style="color:#b91c1c"><b>Jangan share/paste refresh_token ini ke chat AI manapun atau tempat lain.</b></p>
          <textarea style="width:100%; height:80px;" readonly>${tokenResult.refresh_token}</textarea>
          <p>Scope yang didapat: ${tokenResult.scope}</p>
          <hr/>
          <p>Selanjutnya kamu juga perlu cari <b>ACCURATE_DB_ID</b> — buka endpoint
          <code>${ACCOUNT_BASE_URL_PLACEHOLDER}/api/db-list.do</code> dengan header
          <code>Authorization: Bearer ${tokenResult.access_token}</code> (misal lewat Postman),
          cari "id" dari database toko kamu di hasilnya.</p>
        </body>
      </html>
    `.replace('ACCOUNT_BASE_URL_PLACEHOLDER', 'https://account.accurate.id')

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}

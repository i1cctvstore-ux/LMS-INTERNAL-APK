import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Halaman yang boleh diakses TANPA login.
// "/" boleh diakses karena app/page.tsx sendiri yang menampilkan LoginScreen
// kalau belum ada sesi. "/track" boleh diakses publik karena itu halaman
// tracking progres buat CUSTOMER (bukan staf) — keamanannya dari kombinasi
// code+token acak di URL, bukan dari sesi login (lihat app/api/track/route.ts).
// Halaman lain (mis. /stok, /servis nanti) wajib login.
const PUBLIC_PATHS = ['/', '/track']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Ini WAJIB dipanggil (jangan cuma getSession) supaya token di-refresh
  // otomatis kalau sudah kedaluwarsa. Tanpa ini, user bisa "ke-logout" tiba-tiba.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isPublicPath = PUBLIC_PATHS.includes(request.nextUrl.pathname)

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Berlaku untuk SEMUA halaman baru yang nanti ditambahkan (mis. /stok, /servis).
// Belum ada pembatasan per-role di sini — itu tetap dicek per-halaman/per-API
// (lihat lib/supabase/require-admin.ts) supaya "semua akun bisa buka semua page,
// yang penting sudah login" seperti yang diminta.
export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Jalan di semua path KECUALI: API routes (auth-nya sendiri di setiap route),
    // file statis Next.js, dan file publik umum (gambar, ikon, manifest, dll).
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json)$).*)',
  ],
}

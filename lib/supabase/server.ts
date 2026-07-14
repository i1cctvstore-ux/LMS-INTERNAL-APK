import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/supabase/types'

// Client Supabase untuk dipakai di server (Route Handler / Server Component).
// Membaca sesi login dari cookie milik user yang sedang request.
// Tetap tunduk pada RLS (bukan admin) — cocok untuk operasi baca/tulis milik user itu sendiri.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Bisa diabaikan jika dipanggil dari Server Component (bukan Route Handler).
          }
        },
      },
    },
  )
}

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// =====================================================
// PENTING: file ini HANYA boleh dipakai di kode server (API routes,
// server actions) — TIDAK PERNAH di-import dari komponen client
// ('use client'). Dia pakai SUPABASE_SERVICE_ROLE_KEY yang punya akses
// penuh dan MELEWATI (bypass) semua Row Level Security. Kalau ke-bundle
// ke kode client, service role key bakal ke-expose ke browser siapa saja.
//
// Dipakai khusus buat proses yang jalan TANPA user login (misal Vercel
// Cron yang narik stok dari Zoho/Accurate secara terjadwal) — proses
// begini gak punya session user buat di-otentikasi normal, jadi butuh
// akses langsung yang di-otorisasi lewat cara lain (lihat CRON_SECRET
// di app/api/stok/sync-zoho/route.ts).
// =====================================================

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY atau NEXT_PUBLIC_SUPABASE_URL belum diset di Environment Variables Vercel.',
    )
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

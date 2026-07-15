import type { Profile, Role } from '@/lib/supabase/types'

export const ROLES: readonly Role[] = ['super_admin', 'admin', 'kasir', 'gudang', 'teknisi']

// Role yang boleh diatur oleh Admin cabang (menambah karyawan baru atau
// mengubah role karyawan yang sudah ada). Admin cabang TIDAK BOLEH
// menaikkan siapa pun jadi 'admin' atau 'super_admin' — itu cuma bisa
// dilakukan lewat akun Super Admin. Dipakai di UI (batasi pilihan dropdown)
// dan di API route (validasi server-side, lapisan pengaman utama).
export const STAFF_ROLES: readonly Role[] = ['kasir', 'gudang', 'teknisi']

// Label tampilan (Bahasa Indonesia, rapi) untuk tiap nilai role yang tersimpan
// di database (snake_case). Dipakai di dropdown & badge, jangan tampilkan
// nilai mentah role langsung ke user.
export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  kasir: 'Kasir',
  gudang: 'Gudang',
  teknisi: 'Teknisi',
}

export type { Role }

// Employee = baris tabel `profiles` di Supabase (1 baris = 1 akun karyawan).
export type Employee = Profile

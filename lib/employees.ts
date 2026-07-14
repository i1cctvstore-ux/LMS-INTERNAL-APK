import type { Profile, Role } from '@/lib/supabase/types'

export const ROLES: readonly Role[] = ['super_admin', 'admin', 'kasir', 'gudang', 'teknisi']

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

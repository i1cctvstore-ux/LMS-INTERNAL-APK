import {
  LayoutDashboard,
  Boxes,
  Wrench,
  Users,
  BookOpen,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/supabase/types'

export type PageKey =
  | 'dashboard'
  | 'stok'
  | 'servis'
  | 'user-role'
  | 'lms-materi'
  | 'lms-verifikasi'

export type NavItem = {
  key: PageKey
  label: string
  description: string
  icon: LucideIcon
  // Kalau diisi, menu ini cuma muncul untuk role yang disebut di sini.
  // Kalau kosong/undefined, menu terbuka untuk semua role yang sudah login.
  roles?: Role[]
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Ringkasan operasional toko',
    icon: LayoutDashboard,
  },
  {
    key: 'lms-materi',
    label: 'Materi',
    description: 'Belajar materi & ajukan verifikasi',
    icon: BookOpen,
  },
  {
    key: 'lms-verifikasi',
    label: 'Verifikasi',
    description: 'Tinjau pengajuan verifikasi materi karyawan',
    icon: ShieldCheck,
    roles: ['super_admin'],
  },
  {
    key: 'stok',
    label: 'Stok',
    description: 'Kelola inventaris perangkat CCTV',
    icon: Boxes,
  },
  {
    key: 'servis',
    label: 'Servis',
    description: 'Antrian dan riwayat perbaikan',
    icon: Wrench,
  },
  {
    key: 'user-role',
    label: 'User Role',
    description: 'Manajemen pengguna dan hak akses',
    icon: Users,
    roles: ['super_admin'],
  },
]

// Dipakai di Sidebar & pengecekan akses halaman — daftar menu yang boleh
// dilihat role tertentu.
export function getVisibleNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
}

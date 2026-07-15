import {
  LayoutDashboard,
  Boxes,
  Wrench,
  Users,
  FolderKanban,
  Building2,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/supabase/types'

export type PageKey = 'dashboard' | 'proyek' | 'stok' | 'servis' | 'user-role' | 'cabang'

export type NavItem = {
  key: PageKey
  label: string
  description: string
  icon: LucideIcon
  // Kalau diisi, menu ini cuma muncul untuk role yang disebut di sini.
  // Kalau kosong/undefined, menu terbuka untuk semua role yang sudah login.
  roles?: Role[]
}

// Role gudang cuma kerja di area Servis & Stok — gak perlu (dan gak boleh)
// lihat Dashboard ringkasan bisnis, Proyek, apalagi Kelola Cabang/User Role.
const NON_GUDANG_ROLES: Role[] = ['super_admin', 'admin', 'kasir', 'teknisi']

export const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Ringkasan operasional toko',
    icon: LayoutDashboard,
    roles: NON_GUDANG_ROLES,
  },
  {
    key: 'proyek',
    label: 'Proyek',
    description: 'Pantau progres pemasangan CCTV dari survey sampai serah terima',
    icon: FolderKanban,
    roles: NON_GUDANG_ROLES,
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
    key: 'cabang',
    label: 'Kelola Cabang',
    description: 'Daftar cabang dan penugasan karyawan/proyek per cabang',
    icon: Building2,
    // Tetap eksklusif super_admin: Admin cabang tidak boleh lihat/kelola
    // cabang lain ataupun membuat cabang baru.
    roles: ['super_admin'],
  },
  {
    key: 'user-role',
    label: 'User Role',
    description: 'Manajemen pengguna dan hak akses',
    icon: Users,
    // Admin cabang juga boleh akses halaman ini, tapi dibatasi di dalam
    // komponennya sendiri (EmployeeManagement) supaya cuma bisa kelola
    // staff kasir/gudang/teknisi di cabangnya sendiri.
    roles: ['super_admin', 'admin'],
  },
]

// Dipakai di Sidebar & pengecekan akses halaman — daftar menu yang boleh
// dilihat role tertentu.
export function getVisibleNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
}

// Halaman default waktu login/refresh — dashboard untuk yang boleh lihat,
// kalau tidak (mis. gudang) jatuh ke menu pertama yang memang boleh diakses.
export function getDefaultPage(role: Role): PageKey {
  const visible = getVisibleNavItems(role)
  if (visible.some((item) => item.key === 'dashboard')) return 'dashboard'
  return visible[0]?.key ?? 'dashboard'
}

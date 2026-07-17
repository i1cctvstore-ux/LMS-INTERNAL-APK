import {
  LayoutDashboard,
  Boxes,
  Package,
  Truck,
  Layers,
  Wallet,
  Settings2,
  Users,
  FolderKanban,
  Building2,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/supabase/types'

export type PageKey =
  | 'dashboard'
  | 'proyek'
  | 'stok'
  | 'servis-claim'
  | 'servis-supplier'
  | 'servis-inventaris'
  | 'servis-kas'
  | 'servis-master'
  | 'user-role'
  | 'cabang'

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
  // ---------- Servis (dulu 1 menu dengan tab di dalamnya, sekarang
  // 5 menu terpisah langsung di sidebar utama) ----------
  {
    key: 'servis-claim',
    label: 'Claim Barang',
    description: 'Klaim garansi & servis yang masuk dari customer',
    icon: Package,
  },
  {
    key: 'servis-supplier',
    label: 'Proses ke Supplier',
    description: 'Pengiriman barang servis ke supplier',
    icon: Truck,
  },
  {
    key: 'servis-inventaris',
    label: 'Inventaris Servis',
    description: 'Stok sparepart untuk servis',
    icon: Layers,
  },
  {
    key: 'servis-kas',
    label: 'Kas Service',
    description: 'Invoice dan setoran kas hasil servis',
    icon: Wallet,
  },
  {
    key: 'servis-master',
    label: 'Data Master Servis',
    description: 'Brand, supplier, dan produk untuk modul servis',
    icon: Settings2,
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

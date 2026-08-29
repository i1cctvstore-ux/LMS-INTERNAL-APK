import {
  LayoutDashboard,
  Boxes,
  Wrench,
  Package,
  Truck,
  Layers,
  Wallet,
  Settings2,
  Users,
  FolderKanban,
  Building2,
  BookOpen,
  ShieldCheck,
  Receipt,
  PiggyBank,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/supabase/types'

export type PageKey =
  | 'dashboard'
  | 'lms-materi'
  | 'lms-verifikasi'
  | 'kas-buku'
  | 'kas-kecil'
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

// Menu Kas (Buku Kas & Kas Kecil) sengaja HANYA untuk super_admin & admin —
// kasir/gudang/teknisi tidak pernah melihat menu ini sama sekali, beda
// dengan menu "Kas Service" di grup Servis yang memang untuk staf servis.
const KAS_ROLES: Role[] = ['super_admin', 'admin']

export const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Ringkasan operasional toko',
    icon: LayoutDashboard,
    roles: NON_GUDANG_ROLES,
  },
  // ---------- LMS (Materi & Verifikasi) ----------
  {
    key: 'lms-materi',
    label: 'Materi',
    description: 'Materi pelatihan karyawan & pengajuan verifikasi',
    icon: BookOpen,
  },
  {
    key: 'lms-verifikasi',
    label: 'Verifikasi',
    description: 'Tinjau & approve pengajuan verifikasi materi karyawan',
    icon: ShieldCheck,
    // Halamannya sendiri juga membatasi lewat canVerify(role), menu
    // disembunyikan juga di sini biar gak bikin bingung role lain.
    roles: ['super_admin'],
  },
  // ---------- Kas (Buku Kas & Kas Kecil) — 2 sub-menu, dikelompokkan
  // jadi 1 folder dropdown "Kas" di Sidebar lewat NAV_GROUPS di bawah --
  // pola sama persis kayak folder "Servis". Cuma super_admin & admin
  // yang boleh lihat (lihat KAS_ROLES). ----------
  {
    key: 'kas-buku',
    label: 'Buku Kas',
    description: 'Catatan uang masuk & setoran kas harian per cabang',
    icon: Receipt,
    roles: KAS_ROLES,
  },
  {
    key: 'kas-kecil',
    label: 'Kas Kecil',
    description: 'Setoran dari owner & pengeluaran operasional kas kecil per cabang',
    icon: Wallet,
    roles: KAS_ROLES,
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

export type NavGroup = {
  key: string
  label: string
  icon: LucideIcon
  itemKeys: PageKey[]
}

// Menu yang dikelompokkan jadi satu "folder" yang bisa dibuka/tutup di
// Sidebar (bukan tab di dalam halaman lagi) — item-itemnya sendiri tetap
// terdaftar sebagai NavItem biasa di NAV_ITEMS di atas, ini cuma metadata
// tambahan buat cara Sidebar merender & mengelompokkannya secara visual.
export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'kas',
    label: 'Kas',
    icon: PiggyBank,
    itemKeys: ['kas-buku', 'kas-kecil'],
  },
  {
    key: 'servis',
    label: 'Servis',
    icon: Wrench,
    itemKeys: [
      'servis-claim',
      'servis-supplier',
      'servis-inventaris',
      'servis-kas',
      'servis-master',
    ],
  },
]

// Halaman default waktu login/refresh — dashboard untuk yang boleh lihat,
// kalau tidak (mis. gudang) jatuh ke menu pertama yang memang boleh diakses.
export function getDefaultPage(role: Role): PageKey {
  const visible = getVisibleNavItems(role)
  if (visible.some((item) => item.key === 'dashboard')) return 'dashboard'
  return visible[0]?.key ?? 'dashboard'
}

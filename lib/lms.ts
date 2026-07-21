import type { Role } from '@/lib/employees'

// ---------------------------------------------------------------------------
// Kategori materi. Sesuaikan/tambah kalau ada kategori baru — dipakai untuk
// chip filter di daftar materi.
// ---------------------------------------------------------------------------
export const MATERIAL_CATEGORIES = [
  'Admin',
  'Teknis',
  'Instalasi',
  'Tutorial',
  'Materi',
] as const
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number]

export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: 'Menunggu verifikasi',
  approved: 'Terverifikasi',
  rejected: 'Ditolak, ulangi',
}

export type LmsMaterial = {
  id: string
  title: string
  category: string
  section: string
  content: string
  target_roles: Role[]
  ready_to_test: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type LmsMaterialTest = {
  material_id: string
  questions: string
  updated_at: string
}

export type LmsSubmission = {
  id: string
  material_id: string
  user_id: string
  status: SubmissionStatus
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  submitted_at: string
  created_at: string
}

// Join ringan yang dipakai di layar Verifikasi (nama karyawan & judul materi
// diambil lewat select join Supabase, lihat komponen lms-verifikasi.tsx)
export type LmsSubmissionWithRelations = LmsSubmission & {
  material: Pick<LmsMaterial, 'id' | 'title' | 'category'> | null
  employee: { id: string; name: string; role: Role } | null
}

// ---------------------------------------------------------------------------
// Kontrol akses. Sengaja dipusatkan di sini — kalau nanti mau `admin` (bukan
// cuma `super_admin`) ikut bisa kelola materi/verifikasi, cukup ubah di sini.
// ---------------------------------------------------------------------------
export function canManageMaterials(role: Role): boolean {
  return role === 'super_admin'
}

export function canVerify(role: Role): boolean {
  return role === 'super_admin'
}

// Materi ini terlihat oleh role tsb? (mirror dari logika RLS di SQL —
// dipakai untuk filter tampilan client-side kalau perlu, RLS tetap jadi
// penjaga utama di level database)
export function isMaterialVisibleTo(material: LmsMaterial, role: Role): boolean {
  if (role === 'super_admin') return true
  if (!material.target_roles || material.target_roles.length === 0) return true
  return material.target_roles.includes(role)
}

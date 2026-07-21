// Tipe ini merepresentasikan skema database di supabase/schema.sql
// Jika kolom/tabel berubah, update juga file ini secara manual.

export type Role = 'super_admin' | 'admin' | 'kasir' | 'gudang' | 'teknisi'

// Turunan otomatis dari `role` (kolom generated di database, read-only).
// Dipakai modul LMS Internal untuk kontrol akses materi & soal uji.
export type LmsAccessLevel = 'utama' | 'staff'
export type LmsJobType = 'admin' | 'teknisi'

export type Profile = {
  id: string
  name: string
  email: string
  role: Role
  lms_access_level: LmsAccessLevel
  lms_job_type: LmsJobType
  active: boolean
  created_at: string
  updated_at: string
}

// lms_access_level & lms_job_type sengaja TIDAK ada di Insert/Update —
// keduanya generated column, database yang menghitung otomatis dari `role`.
export type ProfileInsert = {
  id: string
  name: string
  email: string
  role?: Role
  active?: boolean
}

export type ProfileUpdate = Partial<Pick<Profile, 'name' | 'email' | 'role' | 'active'>>

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: ProfileInsert
        Update: ProfileUpdate
      }
    }
  }
}

import 'server-only'
import { createClient } from '@/lib/supabase/server'

// Dipakai di setiap Route Handler yang mengubah data karyawan dan HANYA
// boleh dilakukan Super Admin (mis. Kelola Cabang).
// Mengembalikan { error } (response 401/403 siap pakai) jika bukan super_admin aktif,
// atau { userId, role } jika lolos verifikasi.
export async function requireAdmin() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: Response.json({ message: 'Belum login.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin' || !profile.active) {
    return {
      error: Response.json(
        { message: 'Hanya Super Admin aktif yang boleh melakukan aksi ini.' },
        { status: 403 },
      ),
    }
  }

  return { userId: user.id, role: profile.role }
}

export type BranchManagerCheck =
  | { error: Response }
  | { userId: string; role: 'super_admin'; branchId: null; isSuperAdmin: true }
  | { userId: string; role: 'admin'; branchId: string; isSuperAdmin: false }

// Dipakai di Route Handler yang boleh diakses Super Admin ATAU Admin cabang
// (mis. kelola karyawan). Super Admin lolos tanpa batasan cabang. Admin
// lolos HANYA kalau sudah di-assign ke sebuah cabang (branchId wajib ada),
// dan tiap route yang pakai ini WAJIB tetap membatasi aksinya sendiri ke
// branchId itu + role staff (kasir/gudang/teknisi) — lihat pemakaiannya di
// app/api/employees/route.ts dan app/api/employees/[id]/route.ts.
export async function requireBranchManager(): Promise<BranchManagerCheck> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: Response.json({ message: 'Belum login.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, active, branch_id')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.active) {
    return {
      error: Response.json({ message: 'Akun tidak aktif.' }, { status: 403 }),
    }
  }

  if (profile.role === 'super_admin') {
    return { userId: user.id, role: 'super_admin', branchId: null, isSuperAdmin: true }
  }

  if (profile.role === 'admin' && profile.branch_id) {
    return {
      userId: user.id,
      role: 'admin',
      branchId: profile.branch_id,
      isSuperAdmin: false,
    }
  }

  return {
    error: Response.json(
      {
        message:
          profile.role === 'admin'
            ? 'Akun Admin Anda belum di-assign ke cabang mana pun. Hubungi Super Admin.'
            : 'Hanya Super Admin atau Admin cabang yang boleh melakukan aksi ini.',
      },
      { status: 403 },
    ),
  }
}

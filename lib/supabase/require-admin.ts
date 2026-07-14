import 'server-only'
import { createClient } from '@/lib/supabase/server'

// Dipakai di setiap Route Handler yang mengubah data karyawan.
// Mengembalikan { error } (response 401/403 siap pakai) jika bukan super_admin aktif,
// atau { userId, role } jika lolos verifikasi.
// Menu "User Role" di UI cuma muncul untuk super_admin (lihat lib/nav-config.tsx),
// jadi pengecekan di sini adalah lapisan kedua — memastikan API-nya juga tidak
// bisa dipanggil langsung oleh role lain walau menunya disembunyikan di UI.
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

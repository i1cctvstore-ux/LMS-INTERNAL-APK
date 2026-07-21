import { createAdminClient } from '@/lib/supabase/admin'
import { requireBranchManager } from '@/lib/supabase/require-admin'
import { ROLES, STAFF_ROLES } from '@/lib/employees'

// PATCH /api/employees/:id — ubah role, status aktif, dan/atau cabang.
// Body: { role?, active?, branch_id? }
//
// Super Admin: bebas ubah siapa saja, field apa saja.
//
// Admin cabang: HANYA boleh ubah karyawan yang:
//   - berada di cabang Admin itu sendiri, DAN
//   - role-nya saat ini staff (kasir/gudang/teknisi) — bukan admin/super_admin lain.
// Admin cabang TIDAK boleh mengubah branch_id (pindah cabang) sama sekali,
// dan kalau mengubah role, role barunya juga wajib staff (tidak bisa
// menaikkan siapa pun jadi admin/super_admin).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const check = await requireBranchManager()
  if (check.error) return check.error

  const { id } = await params
  const body = await request.json().catch(() => null)
  const admin = createAdminClient()

  if (!check.isSuperAdmin) {
    const { data: target } = await admin
      .from('profiles')
      .select('role, branch_id')
      .eq('id', id)
      .single()

    if (!target || target.branch_id !== check.branchId || !STAFF_ROLES.includes(target.role)) {
      return Response.json(
        { message: 'Anda cuma boleh mengubah karyawan staff di cabang Anda sendiri.' },
        { status: 403 },
      )
    }
  }

  const updates: Record<string, unknown> = {}

  if (body?.role !== undefined) {
    if (!ROLES.includes(body.role)) {
      return Response.json({ message: 'Role tidak valid.' }, { status: 400 })
    }
    if (!check.isSuperAdmin && !STAFF_ROLES.includes(body.role)) {
      return Response.json(
        { message: 'Admin cabang cuma boleh mengatur role Kasir, Gudang, atau Teknisi.' },
        { status: 403 },
      )
    }
    updates.role = body.role
  }

  if (body?.active !== undefined) {
    // Tidak boleh menonaktifkan akun sendiri — mencegah ke-lock-out dari
    // sistem kalau tidak sengaja klik nonaktif.
    if (id === check.userId && body.active === false) {
      return Response.json(
        { message: 'Anda tidak bisa menonaktifkan akun sendiri.' },
        { status: 400 },
      )
    }
    updates.active = Boolean(body.active)
  }

  if (body?.branch_id !== undefined) {
    if (!check.isSuperAdmin) {
      return Response.json(
        { message: 'Admin cabang tidak bisa memindahkan karyawan ke cabang lain.' },
        { status: 403 },
      )
    }
    updates.branch_id = body.branch_id || null
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ message: 'Tidak ada perubahan.' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return Response.json({ message: error.message }, { status: 500 })
  }

  return Response.json({ employee: data })
}

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireBranchManager } from '@/lib/supabase/require-admin'
import { ROLES, STAFF_ROLES } from '@/lib/employees'

// GET /api/employees — daftar semua karyawan (siapa saja yang sudah login boleh
// panggil endpoint ini; hasilnya otomatis terfilter per cabang lewat RLS
// "profiles_select_by_branch" untuk role selain super_admin, karena query di
// bawah ini pakai client biasa/authenticated, bukan service role).
export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ message: 'Belum login.' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ message: error.message }, { status: 500 })
  }

  return Response.json({ employees: data })
}

// POST /api/employees — tambah karyawan baru (Super Admin ATAU Admin cabang).
// Body: { name, email, role, password, branch_id? }
// Membuat akun di Supabase Auth SEKALIGUS baris profil, dalam satu request.
//
// Admin cabang: cuma boleh bikin akun dengan role staff (kasir/gudang/teknisi),
// dan branch_id SELALU dipaksa ke cabang Admin itu sendiri — apapun branch_id
// yang (sengaja atau tidak) dikirim dari client, diabaikan.
export async function POST(request: Request) {
  const check = await requireBranchManager()
  if (check.error) return check.error

  const body = await request.json().catch(() => null)
  const name = body?.name?.trim()
  const email = body?.email?.trim()
  const role = body?.role
  const password = body?.password

  const branchId = check.isSuperAdmin ? body?.branch_id || null : check.branchId

  if (!name || !email || !role || !password) {
    return Response.json(
      { message: 'Nama, email, role, dan password wajib diisi.' },
      { status: 400 },
    )
  }

  if (!ROLES.includes(role)) {
    return Response.json({ message: 'Role tidak valid.' }, { status: 400 })
  }

  if (!check.isSuperAdmin && !STAFF_ROLES.includes(role)) {
    return Response.json(
      { message: 'Admin cabang cuma boleh menambah karyawan dengan role Kasir, Gudang, atau Teknisi.' },
      { status: 403 },
    )
  }

  const admin = createAdminClient()

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })

  if (createError) {
    const isDuplicate = createError.message?.toLowerCase().includes('already been registered')
    return Response.json(
      { message: isDuplicate ? 'Email sudah terdaftar.' : createError.message },
      { status: isDuplicate ? 409 : 500 },
    )
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .insert({ id: created.user.id, name, email, role, branch_id: branchId, active: true })
    .select()
    .single()

  if (profileError) {
    // Rollback akun auth supaya tidak ada akun "yatim" tanpa profil.
    await admin.auth.admin.deleteUser(created.user.id)
    return Response.json({ message: profileError.message }, { status: 500 })
  }

  return Response.json({ employee: profile }, { status: 201 })
}

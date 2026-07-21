import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'
import { ROLES } from '@/lib/employees'

// GET /api/employees — daftar semua karyawan (siapa saja yang sudah login boleh lihat).
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

// POST /api/employees — tambah karyawan baru (khusus Admin).
// Body: { name, email, role, password }
// Membuat akun di Supabase Auth SEKALIGUS baris profil, dalam satu request.
export async function POST(request: Request) {
  const check = await requireAdmin()
  if (check.error) return check.error

  const body = await request.json().catch(() => null)
  const name = body?.name?.trim()
  const email = body?.email?.trim()
  const role = body?.role
  const password = body?.password

  if (!name || !email || !role || !password) {
    return Response.json(
      { message: 'Nama, email, role, dan password wajib diisi.' },
      { status: 400 },
    )
  }

  if (!ROLES.includes(role)) {
    return Response.json({ message: 'Role tidak valid.' }, { status: 400 })
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
    .insert({ id: created.user.id, name, email, role, active: true })
    .select()
    .single()

  if (profileError) {
    // Rollback akun auth supaya tidak ada akun "yatim" tanpa profil.
    await admin.auth.admin.deleteUser(created.user.id)
    return Response.json({ message: profileError.message }, { status: 500 })
  }

  return Response.json({ employee: profile }, { status: 201 })
}

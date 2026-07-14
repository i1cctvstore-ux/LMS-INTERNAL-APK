import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/require-admin'

// GET /api/branches — daftar semua cabang (semua staf login boleh lihat,
// dipakai buat dropdown pilih cabang di form karyawan/proyek).
export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ message: 'Belum login.' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .order('name')

  if (error) {
    return Response.json({ message: error.message }, { status: 500 })
  }

  return Response.json({ branches: data })
}

// POST /api/branches — tambah cabang baru (khusus Super Admin).
export async function POST(request: Request) {
  const check = await requireAdmin()
  if (check.error) return check.error

  const body = await request.json().catch(() => null)
  const name = body?.name?.trim()
  const address = body?.address?.trim() || null
  const phone = body?.phone?.trim() || null

  if (!name) {
    return Response.json({ message: 'Nama cabang wajib diisi.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('branches')
    .insert({ name, address, phone })
    .select()
    .single()

  if (error) {
    return Response.json({ message: error.message }, { status: 500 })
  }

  return Response.json({ branch: data }, { status: 201 })
}

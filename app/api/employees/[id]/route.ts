import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'
import { ROLES } from '@/lib/employees'

// PATCH /api/employees/:id — ubah role dan/atau status aktif (khusus Admin).
// Body: { role?, active? }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const check = await requireAdmin()
  if (check.error) return check.error

  const { id } = await params
  const body = await request.json().catch(() => null)

  const updates: Record<string, unknown> = {}
  if (body?.role !== undefined) {
    if (!ROLES.includes(body.role)) {
      return Response.json({ message: 'Role tidak valid.' }, { status: 400 })
    }
    updates.role = body.role
  }
  if (body?.active !== undefined) {
    updates.active = Boolean(body.active)
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ message: 'Tidak ada perubahan.' }, { status: 400 })
  }

  const admin = createAdminClient()
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

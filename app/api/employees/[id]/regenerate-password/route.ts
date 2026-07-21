import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/require-admin'
import { generatePassword } from '@/lib/password'

// POST /api/employees/:id/regenerate-password — buat password baru (khusus Admin).
// Password lama otomatis tidak berlaku begitu password baru diset di Supabase Auth.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const check = await requireAdmin()
  if (check.error) return check.error

  const { id } = await params
  const password = generatePassword()

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(id, { password })

  if (error) {
    return Response.json({ message: error.message }, { status: 500 })
  }

  return Response.json({ password })
}

import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/require-admin'

// PATCH /api/branches/:id — edit cabang (khusus Super Admin).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const check = await requireAdmin()
  if (check.error) return check.error

  const { id } = await params
  const body = await request.json().catch(() => null)

  const updates: Record<string, unknown> = {}
  if (body?.name !== undefined) updates.name = body.name.trim()
  if (body?.address !== undefined) updates.address = body.address?.trim() || null
  if (body?.phone !== undefined) updates.phone = body.phone?.trim() || null
  if (body?.active !== undefined) updates.active = Boolean(body.active)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('branches')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return Response.json({ message: error.message }, { status: 500 })
  }

  return Response.json({ branch: data })
}

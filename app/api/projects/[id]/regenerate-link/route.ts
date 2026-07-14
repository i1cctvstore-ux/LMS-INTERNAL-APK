import { createClient } from '@/lib/supabase/server'

// POST /api/projects/:id/regenerate-link — buat token tracking baru.
// Link customer yang lama (pakai token lama) otomatis 404 setelah ini.
// Tidak dibatasi khusus Admin — sama seperti policy update proyek lainnya,
// semua staf yang sudah login boleh melakukan ini.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ message: 'Belum login.' }, { status: 401 })
  }

  const { id } = await params

  // 6 byte random -> 12 karakter hex, sama seperti default kolom di migration SQL.
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  const newToken = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const { data, error } = await supabase
    .from('projects')
    .update({ tracking_token: newToken })
    .eq('id', id)
    .select('tracking_token')
    .single()

  if (error || !data) {
    return Response.json(
      { message: error?.message ?? 'Gagal membuat ulang tautan.' },
      { status: 500 },
    )
  }

  return Response.json({ tracking_token: data.tracking_token })
}

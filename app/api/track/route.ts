import { createAdminClient } from '@/lib/supabase/admin'
import { parseTrackingId } from '@/lib/projects'

// GET /api/track?id=PRJ2026-0004-a1b2c3d4e5f6
// Endpoint PUBLIK — sengaja tidak lewat requireAdmin/getUser, karena
// customer buka halaman ini tanpa login. Keamanannya bukan dari sesi
// login, tapi dari kombinasi code + token acak 12-karakter yang cuma staf
// yang tau (didapat dari tombol "Salin Tautan Customer"). Makanya pakai
// admin client (bypass RLS) tapi query-nya WAJIB match token, bukan cuma
// code — supaya tidak bisa nebak-nebak project lain cuma dari kodenya.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('id')

  if (!raw) {
    return Response.json({ message: 'Tautan tidak valid.' }, { status: 400 })
  }

  const parsed = parseTrackingId(raw)
  if (!parsed) {
    return Response.json({ message: 'Tautan tidak valid.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('*, project_technicians(profile:profiles(name))')
    .eq('code', parsed.code)
    .eq('tracking_token', parsed.token)
    .single()

  if (projectError || !project) {
    return Response.json(
      { message: 'Proyek tidak ditemukan. Tautan mungkin sudah tidak berlaku — minta tautan baru ke i1 CCTV.' },
      { status: 404 },
    )
  }

  const [{ data: logs }, { data: documents }] = await Promise.all([
    admin
      .from('project_logs')
      .select('*, created_by:profiles(name)')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false }),
    admin
      .from('project_documents')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false }),
  ])

  return Response.json({
    project: {
      code: project.code,
      customer_name: project.customer_name,
      project_name: project.project_name,
      area: project.area,
      camera_count: project.camera_count,
      eta: project.eta,
      stage: project.stage,
      created_at: project.created_at,
      technicians: (project.project_technicians ?? [])
        .map((pt: any) => pt.profile?.name)
        .filter(Boolean),
    },
    logs: (logs ?? []).map((l: any) => ({
      id: l.id,
      title: l.title,
      note: l.note,
      photo_urls: l.photo_urls ?? [],
      created_at: l.created_at,
      created_by_name: l.created_by?.name ?? null,
    })),
    documents: (documents ?? []).map((d: any) => ({
      id: d.id,
      doc_type: d.doc_type,
      description: d.description,
      file_name: d.file_name,
      file_url: d.file_url,
      file_size_kb: d.file_size_kb,
      created_at: d.created_at,
    })),
  })
}

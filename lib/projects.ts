export const STAGES = [
  'Survey',
  'Material',
  'Instalasi',
  'Testing',
  'BAST',
  'Selesai',
] as const

export type Stage = (typeof STAGES)[number]

export const DOC_TYPES = [
  'Surat Jalan',
  'Denah / Layout',
  'BOQ & Kontrak',
  'Berita Acara',
  'Lainnya',
] as const

export type Technician = {
  id: string
  name: string
}

export type Project = {
  id: string
  code: string
  customer_name: string
  project_name: string | null
  area: string
  camera_count: number | null
  eta: string | null
  stage: Stage
  tracking_token: string
  created_at: string
  updated_at: string
  technicians: Technician[]
}

export type ProjectLog = {
  id: string
  project_id: string
  title: string
  note: string | null
  photo_urls: string[]
  created_at: string
  created_by_name: string | null
}

export type ProjectDocument = {
  id: string
  project_id: string
  doc_type: string
  description: string | null
  file_name: string
  file_url: string
  file_size_kb: number | null
  created_at: string
}

export function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function formatShortDate(iso: string | null) {
  if (!iso) return '-'
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

export function formatDateTime(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const isToday = d.toDateString() === new Date().toDateString()
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  return isToday ? `Hari ini, ${time}` : `${formatShortDate(iso)}, ${time}`
}

export function isStuck(updatedAt: string, thresholdDays = 3) {
  const diffMs = Date.now() - new Date(updatedAt).getTime()
  return diffMs > thresholdDays * 24 * 60 * 60 * 1000
}

export function trackingUrl(project: Pick<Project, 'code' | 'tracking_token'>) {
  return `https://i1cctv.com/track?id=${project.code}-${project.tracking_token}`
}

/** Kelas warna badge status — pakai token tema yang sudah ada, bukan warna baru. */
export function stageBadgeClassName(stage: Stage) {
  if (stage === 'Selesai') {
    return 'bg-accent text-accent-foreground hover:bg-accent'
  }
  if (stage === 'Survey' || stage === 'Material') {
    return 'bg-secondary text-secondary-foreground hover:bg-secondary'
  }
  return 'bg-primary/10 text-primary hover:bg-primary/10'
}

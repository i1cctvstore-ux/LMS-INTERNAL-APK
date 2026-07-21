'use client'

import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Search, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MaterialFormDialog } from './material-form-dialog'
import { MaterialDetailSheet } from './material-detail-sheet'
import {
  MATERIAL_CATEGORIES,
  canManageMaterials,
  type LmsMaterial,
  type SubmissionStatus,
} from '@/lib/lms'
import type { Role } from '@/lib/employees'
import { createClient } from '@/lib/supabase/client'

type LmsMaterialsProps = {
  currentUserId: string
  currentUserRole: Role
}

function StatusIcon({ status }: { status: SubmissionStatus | null }) {
  if (status === 'approved')
    return <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
  if (status === 'pending')
    return <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  if (status === 'rejected')
    return <XCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
  return null
}

export function LmsMaterials({ currentUserId, currentUserRole }: LmsMaterialsProps) {
  const [materials, setMaterials] = useState<LmsMaterial[]>([])
  // material_id -> status pengajuan terbaru milik user ini
  const [myStatuses, setMyStatuses] = useState<Record<string, SubmissionStatus>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('Semua')
  const [selectedMaterial, setSelectedMaterial] = useState<LmsMaterial | null>(null)

  const isAdmin = canManageMaterials(currentUserRole)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const { data: materialData, error: materialError } = await supabase
      .from('lms_materials')
      .select('*')
      .order('section', { ascending: true })
      .order('created_at', { ascending: true })

    if (materialError) {
      setError('Gagal memuat data materi.')
      setLoading(false)
      return
    }

    const { data: submissionData } = await supabase
      .from('lms_submissions')
      .select('material_id, status, submitted_at')
      .eq('user_id', currentUserId)
      .order('submitted_at', { ascending: true })

    const statusMap: Record<string, SubmissionStatus> = {}
    for (const s of submissionData ?? []) {
      // urutan ascending -> entri terakhir yang ditulis adalah yang terbaru
      statusMap[s.material_id] = s.status as SubmissionStatus
    }

    setMaterials((materialData ?? []) as LmsMaterial[])
    setMyStatuses(statusMap)
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return materials.filter((m) => {
      const matchesCategory = activeCategory === 'Semua' || m.category === activeCategory
      const matchesSearch = m.title.toLowerCase().includes(search.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [materials, activeCategory, search])

  const grouped = useMemo(() => {
    const map = new Map<string, LmsMaterial[]>()
    for (const m of filtered) {
      const list = map.get(m.section) ?? []
      list.push(m)
      map.set(m.section, list)
    }
    return Array.from(map.entries())
  }, [filtered])

  function handleMaterialSaved(material: LmsMaterial) {
    setMaterials((prev) => {
      const exists = prev.some((m) => m.id === material.id)
      return exists
        ? prev.map((m) => (m.id === material.id ? material : m))
        : [...prev, material]
    })
    setSelectedMaterial(null)
  }

  function handleMaterialDeleted(id: string) {
    setMaterials((prev) => prev.filter((m) => m.id !== id))
    setSelectedMaterial(null)
  }

  function handleSubmitted() {
    if (!selectedMaterial) return
    setMyStatuses((prev) => ({ ...prev, [selectedMaterial.id]: 'pending' }))
    setSelectedMaterial(null)
  }

  const doneCount = Object.values(myStatuses).filter((s) => s === 'approved').length

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Materi</h2>
          <p className="text-sm text-muted-foreground">
            Pelajari materi dan ajukan verifikasi sesuai role kamu.
          </p>
        </div>
        {isAdmin ? (
          <MaterialFormDialog mode="add" onSaved={handleMaterialSaved} />
        ) : null}
      </div>

      {error ? (
        <p className="text-sm font-medium text-destructive">{error}</p>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            placeholder="Cari judul materi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {['Semua', ...MATERIAL_CATEGORIES].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                activeCategory === cat
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {!isAdmin ? (
        <p className="text-sm text-muted-foreground">
          {doneCount} dari {materials.length} materi sudah terverifikasi.
        </p>
      ) : null}

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Memuat…</p>
      ) : grouped.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardContent className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <BookOpen className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Belum ada materi yang cocok.
            </p>
          </CardContent>
        </Card>
      ) : (
        grouped.map(([section, items]) => (
          <div key={section} className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{section}</h3>
            <div className="flex flex-col gap-2">
              {items.map((m) => (
                <Card
                  key={m.id}
                  className="cursor-pointer border-border transition-colors hover:border-primary/40"
                  onClick={() => setSelectedMaterial(m)}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <BookOpen className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{m.title}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs font-normal">
                          {m.category}
                        </Badge>
                        {isAdmin && !m.ready_to_test ? (
                          <span className="text-xs text-muted-foreground">
                            Belum siap diujikan
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {!isAdmin ? <StatusIcon status={myStatuses[m.id] ?? null} /> : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      <MaterialDetailSheet
        material={selectedMaterial}
        currentUserRole={currentUserRole}
        mySubmissionStatus={selectedMaterial ? myStatuses[selectedMaterial.id] ?? null : null}
        onOpenChange={(open) => !open && setSelectedMaterial(null)}
        onSubmitted={handleSubmitted}
        onMaterialUpdated={handleMaterialSaved}
        onMaterialDeleted={handleMaterialDeleted}
      />
    </div>
  )
}


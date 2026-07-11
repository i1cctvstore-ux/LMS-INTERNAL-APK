'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, FolderKanban, Search, TriangleAlert } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { StageBadge } from '@/components/projects/stage-badge'
import { AddProjectDialog } from '@/components/projects/add-project-dialog'
import {
  STAGES,
  formatDateTime,
  initials,
  isStuck,
  type Project,
} from '@/lib/projects'
import { createClient } from '@/lib/supabase/client'

type ProjectManagementProps = {
  onOpenProject: (id: string) => void
}

export function ProjectManagement({ onOpenProject }: ProjectManagementProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('Semua')

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data, error: fetchError } = await supabase
      .from('projects')
      .select('*, project_technicians(profile:profiles(id, name))')
      .order('updated_at', { ascending: false })

    if (fetchError) {
      setError('Gagal memuat data proyek.')
    } else {
      const mapped: Project[] = (data ?? []).map((row: any) => ({
        ...row,
        technicians: (row.project_technicians ?? [])
          .map((pt: any) => pt.profile)
          .filter(Boolean),
      }))
      setProjects(mapped)
    }
    setLoading(false)
  }

  function addProject(project: Project) {
    setProjects((prev) => [project, ...prev])
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects.filter((p) => {
      const matchStage = stageFilter === 'Semua' || p.stage === stageFilter
      const matchSearch =
        !q ||
        p.code.toLowerCase().includes(q) ||
        p.customer_name.toLowerCase().includes(q) ||
        p.area.toLowerCase().includes(q)
      return matchStage && matchSearch
    })
  }, [projects, search, stageFilter])

  const attentionCount = projects.filter(
    (p) => p.stage !== 'Selesai' && isStuck(p.updated_at)
  ).length

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Proyek</h2>
          <p className="text-sm text-muted-foreground">
            Pantau progres pemasangan CCTV dari survey sampai serah terima.
          </p>
        </div>
        <AddProjectDialog onAdd={addProject} />
      </div>

      {error ? (
        <p className="text-sm font-medium text-destructive">{error}</p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <FolderKanban className="size-4" aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-base">Semua Proyek</CardTitle>
              <CardDescription>
                {loading
                  ? 'Memuat…'
                  : `${projects.length} proyek · ${attentionCount} butuh perhatian`}
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode, customer, atau area…"
                className="h-9 pl-8 sm:w-64"
              />
            </div>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="h-9 w-full sm:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Semua">Semua status</SelectItem>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="px-0 sm:px-6">
          {/* Tabel biasa — tampil mulai breakpoint sm ke atas */}
          <div className="hidden overflow-x-auto sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[130px]">Kode</TableHead>
                  <TableHead className="min-w-[200px]">Customer</TableHead>
                  <TableHead className="min-w-[120px]">Area</TableHead>
                  <TableHead className="min-w-[150px]">Status</TableHead>
                  <TableHead className="min-w-[110px]">Teknisi</TableHead>
                  <TableHead className="min-w-[130px]">Update Terakhir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => onOpenProject(p.id)}
                  >
                    <TableCell className="font-medium text-foreground">
                      {p.code}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-foreground">
                        {p.project_name ? `${p.project_name} — ` : ''}
                        {p.customer_name}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.area}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <StageBadge stage={p.stage} />
                        {p.stage !== 'Selesai' && isStuck(p.updated_at) ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                            <TriangleAlert className="size-3" aria-hidden="true" />
                            Diam beberapa hari
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex -space-x-2">
                        {p.technicians.slice(0, 3).map((t) => (
                          <Avatar key={t.id} className="size-7 border-2 border-card">
                            <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                              {initials(t.name)}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(p.updated_at)}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Belum ada proyek yang cocok.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          {/* List card bertumpuk — tampil di bawah breakpoint sm (mobile) */}
          <div className="flex flex-col gap-3 px-4 sm:hidden">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenProject(p.id)}
                className="block w-full text-left"
              >
                <Card className="gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {p.code}
                      </p>
                      <p className="truncate font-medium text-foreground">
                        {p.project_name ? `${p.project_name} — ` : ''}
                        {p.customer_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{p.area}</p>
                    </div>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <StageBadge stage={p.stage} />
                    <div className="flex -space-x-2">
                      {p.technicians.slice(0, 3).map((t) => (
                        <Avatar key={t.id} className="size-6 border-2 border-card">
                          <AvatarFallback className="bg-primary/10 text-[9px] font-semibold text-primary">
                            {initials(t.name)}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                  </div>
                  {p.stage !== 'Selesai' && isStuck(p.updated_at) ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                      <TriangleAlert className="size-3" aria-hidden="true" />
                      Diam beberapa hari
                    </span>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Update terakhir: {formatDateTime(p.updated_at)}
                  </p>
                </Card>
              </button>
            ))}
            {!loading && filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Belum ada proyek yang cocok.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

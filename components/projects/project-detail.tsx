'use client'

import { useEffect, useState } from 'react'
import {
  Camera as CameraIcon,
  ChevronLeft,
  Copy,
  FileText,
  Pencil,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { StageBadge } from '@/components/projects/stage-badge'
import { StageTracker } from '@/components/projects/stage-tracker'
import { AddLogDialog } from '@/components/projects/add-log-dialog'
import { AddDocumentDialog } from '@/components/projects/add-document-dialog'
import { EditProjectInfoDialog } from '@/components/projects/edit-project-info-dialog'
import {
  formatDateTime,
  formatShortDate,
  initials,
  trackingUrl,
  type Project,
  type ProjectDocument,
  type ProjectLog,
  type Stage,
} from '@/lib/projects'
import { createClient } from '@/lib/supabase/client'

type ProjectDetailProps = {
  projectId: string
  onBack: () => void
}

export function ProjectDetail({ projectId, onBack }: ProjectDetailProps) {
  const [project, setProject] = useState<Project | null>(null)
  const [logs, setLogs] = useState<ProjectLog[]>([])
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function loadAll() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const [{ data: projectRow, error: projectError }, { data: logRows }, { data: docRows }] =
      await Promise.all([
        supabase
          .from('projects')
          .select('*, project_technicians(profile:profiles(id, name))')
          .eq('id', projectId)
          .single(),
        supabase
          .from('project_logs')
          .select('*, created_by:profiles(name)')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('project_documents')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ])

    if (projectError || !projectRow) {
      setError('Proyek tidak ditemukan.')
      setLoading(false)
      return
    }

    setProject({
      ...projectRow,
      technicians: (projectRow.project_technicians ?? [])
        .map((pt: any) => pt.profile)
        .filter(Boolean),
    })
    setLogs(
      (logRows ?? []).map((l: any) => ({
        ...l,
        created_by_name: l.created_by?.name ?? null,
      }))
    )
    setDocuments(docRows ?? [])
    setLoading(false)
  }

  async function handleStageChange(stage: Stage) {
    if (!project) return
    const previous = project
    setProject({ ...project, stage })
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('projects')
      .update({ stage })
      .eq('id', project.id)
    if (updateError) {
      setProject(previous)
      setError('Gagal mengubah status proyek.')
    }
  }

  function handleLogAdded(log: ProjectLog) {
    setLogs((prev) => [log, ...prev])
  }

  function handleDocumentAdded(doc: ProjectDocument) {
    setDocuments((prev) => [doc, ...prev])
  }

  function handleProjectUpdated(updated: Partial<Project>) {
    setProject((prev) => (prev ? { ...prev, ...updated } : prev))
  }

  async function copyTrackingLink() {
    if (!project) return
    await navigator.clipboard.writeText(trackingUrl(project))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <p className="text-sm text-muted-foreground">Memuat proyek…</p>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <button
          type="button"
          onClick={onBack}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> Semua Proyek
        </button>
        <p className="text-sm font-medium text-destructive">
          {error ?? 'Proyek tidak ditemukan.'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> Semua Proyek
        </button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">
              {project.code}
            </p>
            <h2 className="text-xl font-bold text-foreground">
              {project.project_name
                ? `${project.project_name} — ${project.customer_name}`
                : project.customer_name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {project.area}
              {project.camera_count ? ` · ${project.camera_count} titik kamera` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <EditProjectInfoDialog
              project={project}
              onUpdated={handleProjectUpdated}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Edit Info
                </Button>
              }
            />
            <Button size="sm" onClick={copyTrackingLink}>
              <Copy className="size-3.5" />
              {copied ? 'Tersalin!' : 'Salin Tautan Customer'}
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Status Proyek</CardTitle>
            <StageBadge stage={project.stage} />
          </div>
        </CardHeader>
        <CardContent>
          <StageTracker currentStage={project.stage} onChange={handleStageChange} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Target Selesai</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {formatShortDate(project.eta)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Dibuat</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {formatShortDate(project.created_at)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Teknisi</p>
          <div className="mt-1 flex -space-x-2">
            {project.technicians.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada</p>
            ) : (
              project.technicians.map((t) => (
                <Avatar key={t.id} className="size-7 border-2 border-card">
                  <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                    {initials(t.name)}
                  </AvatarFallback>
                </Avatar>
              ))
            )}
          </div>
        </Card>
      </div>

      <Tabs defaultValue="log">
        <TabsList>
          <TabsTrigger value="log">Log Aktivitas</TabsTrigger>
          <TabsTrigger value="dokumen">Dokumen</TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">Log Aktivitas</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {logs.length} entri tercatat
                </p>
              </div>
              <AddLogDialog projectId={project.id} onAdded={handleLogAdded} />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {logs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Belum ada log aktivitas.
                </p>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col gap-1 border-b border-border pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {log.title}
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(log.created_at)}
                      </span>
                    </div>
                    {log.note ? (
                      <p className="text-sm text-muted-foreground">{log.note}</p>
                    ) : null}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {log.created_by_name ? <span>{log.created_by_name}</span> : null}
                      {log.photo_urls.length > 0 ? (
                        <span className="flex items-center gap-1">
                          <CameraIcon className="size-3" aria-hidden="true" />
                          {log.photo_urls.length} foto
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dokumen" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">Dokumen Proyek</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {documents.length} berkas tersimpan
                </p>
              </div>
              <AddDocumentDialog projectId={project.id} onAdded={handleDocumentAdded} />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {documents.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Belum ada dokumen.
                </p>
              ) : (
                documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <FileText className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {doc.doc_type} · {doc.file_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {doc.description ? `${doc.description} · ` : ''}
                        {formatDateTime(doc.created_at)}
                      </p>
                    </div>
                  </a>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

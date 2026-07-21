'use client'

import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, Search, Check, X } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { ROLE_LABELS } from '@/lib/employees'
import { SUBMISSION_STATUS_LABELS, type LmsSubmissionWithRelations } from '@/lib/lms'
import { createClient } from '@/lib/supabase/client'

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function LmsVerifikasi() {
  const [pending, setPending] = useState<LmsSubmissionWithRelations[]>([])
  const [history, setHistory] = useState<LmsSubmissionWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Dialog aksi (approve / reject) dengan catatan opsional
  const [actionTarget, setActionTarget] = useState<{
    submission: LmsSubmissionWithRelations
    type: 'approved' | 'rejected'
  } | null>(null)
  const [note, setNote] = useState('')
  const [submittingAction, setSubmittingAction] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    const supabase = createClient()

    const { data, error: fetchError } = await supabase
      .from('lms_submissions')
      .select(
        `
        *,
        material:lms_materials(id, title, category),
        employee:profiles!lms_submissions_user_id_fkey(id, name, role)
      `,
      )
      .order('submitted_at', { ascending: false })

    if (fetchError) {
      setError(
        'Gagal memuat data verifikasi. Cek nama foreign key relasi profiles di query kalau perlu disesuaikan.',
      )
      setLoading(false)
      return
    }

    const all = (data ?? []) as unknown as LmsSubmissionWithRelations[]
    setPending(all.filter((s) => s.status === 'pending'))
    setHistory(all.filter((s) => s.status !== 'pending'))
    setLoading(false)
  }

  const filteredPending = useMemo(() => {
    const q = search.toLowerCase()
    return pending.filter(
      (s) =>
        s.employee?.name.toLowerCase().includes(q) ||
        s.material?.title.toLowerCase().includes(q),
    )
  }, [pending, search])

  const filteredHistory = useMemo(() => {
    const q = search.toLowerCase()
    return history.filter(
      (s) =>
        s.employee?.name.toLowerCase().includes(q) ||
        s.material?.title.toLowerCase().includes(q),
    )
  }, [history, search])

  function openAction(submission: LmsSubmissionWithRelations, type: 'approved' | 'rejected') {
    setActionTarget({ submission, type })
    setNote('')
  }

  async function confirmAction() {
    if (!actionTarget) return
    setSubmittingAction(true)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error: updateError } = await supabase
      .from('lms_submissions')
      .update({
        status: actionTarget.type,
        review_note: note.trim() || null,
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', actionTarget.submission.id)

    if (updateError) {
      setError('Gagal menyimpan keputusan verifikasi. Coba lagi.')
      setSubmittingAction(false)
      return
    }

    setPending((prev) => prev.filter((s) => s.id !== actionTarget.submission.id))
    setHistory((prev) => [
      { ...actionTarget.submission, status: actionTarget.type, review_note: note.trim() || null },
      ...prev,
    ])
    setSubmittingAction(false)
    setActionTarget(null)
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Verifikasi &amp; Soal Uji</h2>
        <p className="text-sm text-muted-foreground">
          Tinjau pengajuan verifikasi materi dari karyawan.
        </p>
      </div>

      {error ? (
        <p className="text-sm font-medium text-destructive">{error}</p>
      ) : null}

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          placeholder="Cari nama karyawan atau materi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-base">Menunggu Verifikasi</CardTitle>
              <CardDescription>
                {loading ? 'Memuat…' : `${filteredPending.length} pengajuan`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {!loading && filteredPending.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Tidak ada pengajuan yang menunggu.
            </p>
          ) : (
            filteredPending.map((s) => (
              <Card key={s.id} className="border-border">
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                        {s.employee ? initials(s.employee.name) : '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="truncate font-medium text-foreground">
                        {s.employee?.name ?? 'Karyawan tidak diketahui'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.employee ? ROLE_LABELS[s.employee.role] : ''} ·{' '}
                        {s.material?.title ?? 'Materi dihapus'}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {formatDate(s.submitted_at)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive"
                      onClick={() => openAction(s, 'rejected')}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                      Tolak
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => openAction(s, 'approved')}
                    >
                      <Check className="size-3.5" aria-hidden="true" />
                      Verifikasi
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riwayat Verifikasi</CardTitle>
          <CardDescription>
            {loading ? 'Memuat…' : `${filteredHistory.length} riwayat`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {!loading && filteredHistory.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada riwayat verifikasi.
            </p>
          ) : (
            filteredHistory.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 border-b border-border py-3 last:border-0"
              >
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {s.employee ? initials(s.employee.name) : '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-medium text-foreground">
                    {s.employee?.name ?? 'Karyawan tidak diketahui'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.material?.title ?? 'Materi dihapus'}
                  </p>
                </div>
                <Badge
                  variant={s.status === 'approved' ? 'default' : 'destructive'}
                  className={
                    s.status === 'approved'
                      ? 'bg-primary/10 text-primary hover:bg-primary/10'
                      : ''
                  }
                >
                  {SUBMISSION_STATUS_LABELS[s.status]}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!actionTarget} onOpenChange={(o) => !o && setActionTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionTarget?.type === 'approved'
                ? 'Verifikasi pengajuan ini?'
                : 'Tolak pengajuan ini?'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              {actionTarget?.submission.employee?.name} —{' '}
              {actionTarget?.submission.material?.title}
            </p>
            <Textarea
              placeholder={
                actionTarget?.type === 'rejected'
                  ? 'Catatan alasan penolakan (opsional, akan membantu karyawan belajar ulang)'
                  : 'Catatan tambahan (opsional)'
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setActionTarget(null)}
              disabled={submittingAction}
            >
              Batal
            </Button>
            <Button onClick={confirmAction} disabled={submittingAction}>
              {submittingAction ? 'Menyimpan…' : 'Ya, Lanjut'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

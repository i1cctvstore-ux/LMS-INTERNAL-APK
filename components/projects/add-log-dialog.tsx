'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import type { ProjectLog } from '@/lib/projects'

type AddLogDialogProps = {
  projectId: string
  onAdded: (log: ProjectLog) => void
}

export function AddLogDialog({ projectId, onAdded }: AddLogDialogProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!title.trim()) {
      setError('Judul log wajib diisi.')
      return
    }
    setSubmitting(true)
    setError(null)
    const supabase = createClient()

    const { data, error: insertError } = await supabase
      .from('project_logs')
      .insert({
        project_id: projectId,
        title: title.trim(),
        note: note.trim() || null,
      })
      .select('*, created_by:profiles(name)')
      .single()

    await supabase
      .from('projects')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', projectId)

    if (insertError || !data) {
      setError('Gagal menyimpan log. Coba lagi.')
      setSubmitting(false)
      return
    }

    onAdded({ ...data, created_by_name: data.created_by?.name ?? null })
    setSubmitting(false)
    setOpen(false)
    setTitle('')
    setNote('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="size-4" aria-hidden="true" />
        Tambah Log
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Log Aktivitas</DialogTitle>
          <DialogDescription>
            Catat progres terbaru di lapangan supaya histori proyek tetap
            lengkap.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="log-title">Judul</Label>
            <Input
              id="log-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="mis. Instalasi kamera lantai 2 selesai"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="log-note">Catatan (opsional)</Label>
            <Textarea
              id="log-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="mis. 4 unit dome camera terpasang"
              rows={3}
            />
          </div>
          {error ? (
            <p className="text-sm font-medium text-destructive">{error}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Menyimpan…' : 'Simpan Log'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

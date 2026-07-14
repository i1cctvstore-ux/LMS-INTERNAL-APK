'use client'

import { useState } from 'react'
import { ImagePlus, Plus, X } from 'lucide-react'
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
import {
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  MAX_DOCUMENT_FILE_SIZE_MB,
  type ProjectLog,
} from '@/lib/projects'

type AddLogDialogProps = {
  projectId: string
  onAdded: (log: ProjectLog) => void
}

export function AddLogDialog({ projectId, onAdded }: AddLogDialogProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handlePickPhotos(fileList: FileList | null) {
    if (!fileList) return
    const picked = Array.from(fileList)
    const tooBig = picked.find((f) => f.size > MAX_DOCUMENT_FILE_SIZE_BYTES)
    if (tooBig) {
      setError(
        `"${tooBig.name}" melebihi ${MAX_DOCUMENT_FILE_SIZE_MB}MB. Pilih ulang foto yang ukurannya lebih kecil.`
      )
      return
    }
    setError(null)
    setPhotos((prev) => [...prev, ...picked])
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    if (!title.trim()) {
      setError('Judul log wajib diisi.')
      return
    }
    setSubmitting(true)
    setError(null)
    const supabase = createClient()

    // Upload semua foto dulu (kalau ada), baru insert log-nya sekali jalan
    // dengan photo_urls sudah terisi — biar tidak ada log "setengah jadi"
    // kalau salah satu upload gagal di tengah jalan.
    const photoUrls: string[] = []
    for (let i = 0; i < photos.length; i++) {
      setUploadStatus(`Mengunggah foto ${i + 1}/${photos.length}…`)
      const file = photos[i]
      const path = `${projectId}/logs/${Date.now()}-${i}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(path, file)

      if (uploadError) {
        setError(
          'Gagal mengunggah foto. Pastikan bucket "project-files" sudah dibuat di Supabase Storage.'
        )
        setSubmitting(false)
        setUploadStatus('')
        return
      }

      const { data: publicUrl } = supabase.storage
        .from('project-files')
        .getPublicUrl(path)
      photoUrls.push(publicUrl.publicUrl)
    }
    setUploadStatus('')

    const { data, error: insertError } = await supabase
      .from('project_logs')
      .insert({
        project_id: projectId,
        title: title.trim(),
        note: note.trim() || null,
        photo_urls: photoUrls,
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
    setPhotos([])
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
            lengkap. Foto yang diunggah di sini juga ikut tampil di halaman
            tracking customer.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto">
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

          <div className="flex flex-col gap-2">
            <Label>Foto (opsional)</Label>
            <div className="flex flex-wrap gap-2">
              {photos.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-black/60 text-white"
                    aria-label={`Hapus ${file.name}`}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </div>
              ))}

              <label className="flex size-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted">
                <ImagePlus className="size-4" aria-hidden="true" />
                <span className="text-[10px]">Tambah</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handlePickPhotos(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Maksimal {MAX_DOCUMENT_FILE_SIZE_MB}MB per foto.
            </p>
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
            {submitting ? uploadStatus || 'Menyimpan…' : 'Simpan Log'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

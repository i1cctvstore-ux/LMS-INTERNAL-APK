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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import {
  DOC_TYPES,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  MAX_DOCUMENT_FILE_SIZE_MB,
  type ProjectDocument,
} from '@/lib/projects'

type AddDocumentDialogProps = {
  projectId: string
  onAdded: (doc: ProjectDocument) => void
}

export function AddDocumentDialog({ projectId, onAdded }: AddDocumentDialogProps) {
  const [open, setOpen] = useState(false)
  const [docType, setDocType] = useState<string>(DOC_TYPES[0])
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!file) {
      setError('Pilih berkas yang mau diunggah.')
      return
    }
    if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
      setError(`Ukuran berkas maksimal ${MAX_DOCUMENT_FILE_SIZE_MB}MB.`)
      return
    }
    setSubmitting(true)
    setError(null)
    const supabase = createClient()

    const path = `${projectId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(path, file)

    if (uploadError) {
      setError(
        'Gagal mengunggah berkas. Pastikan bucket "project-files" sudah dibuat di Supabase Storage.'
      )
      setSubmitting(false)
      return
    }

    const { data: publicUrl } = supabase.storage
      .from('project-files')
      .getPublicUrl(path)

    const { data, error: insertError } = await supabase
      .from('project_documents')
      .insert({
        project_id: projectId,
        doc_type: docType,
        description: description.trim() || null,
        file_name: file.name,
        file_url: publicUrl.publicUrl,
        file_size_kb: Math.round(file.size / 1024),
      })
      .select()
      .single()

    if (insertError || !data) {
      setError('Gagal menyimpan data dokumen.')
      setSubmitting(false)
      return
    }

    onAdded(data)
    setSubmitting(false)
    setOpen(false)
    setDescription('')
    setFile(null)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="size-4" aria-hidden="true" />
        Tambah Dokumen
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Dokumen Proyek</DialogTitle>
          <DialogDescription>
            Unggah surat jalan, denah, BOQ, atau berkas resmi lain terkait
            proyek ini.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Jenis Dokumen</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="doc-desc">Keterangan (opsional)</Label>
            <Input
              id="doc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="mis. Pengiriman material tahap 2"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="doc-file">Berkas</Label>
            <Input
              id="doc-file"
              type="file"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null
                if (picked && picked.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
                  setError(`Ukuran berkas maksimal ${MAX_DOCUMENT_FILE_SIZE_MB}MB.`)
                  setFile(null)
                  e.target.value = ''
                  return
                }
                setError(null)
                setFile(picked)
              }}
            />
            <p className="text-xs text-muted-foreground">
              Maksimal {MAX_DOCUMENT_FILE_SIZE_MB}MB per berkas.
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
            {submitting ? 'Mengunggah…' : 'Simpan Dokumen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

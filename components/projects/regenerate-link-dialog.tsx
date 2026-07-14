'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type RegenerateLinkDialogProps = {
  projectId: string
  onRegenerated: (newToken: string) => void
}

export function RegenerateLinkDialog({
  projectId,
  onRegenerated,
}: RegenerateLinkDialogProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setError(null)
  }

  async function handleConfirm() {
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/projects/${projectId}/regenerate-link`, {
      method: 'POST',
    })
    const body = await res.json().catch(() => null)
    setLoading(false)

    if (!res.ok) {
      setError(body?.message ?? 'Gagal membuat ulang tautan.')
      return
    }

    onRegenerated(body.tracking_token)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm" />
        }
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
        Generate Ulang Link
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buat Ulang Tautan Customer?</DialogTitle>
          <DialogDescription>
            Tautan lama yang sudah pernah dibagikan akan langsung tidak
            berlaku (404 kalau dibuka). Pakai ini kalau tautan lama sudah
            tersebar ke pihak yang tidak seharusnya, atau mau dibagikan ulang
            ke customer yang berbeda. Setelah dibuat, klik &ldquo;Salin
            Tautan Customer&rdquo; lagi untuk dapat link yang baru.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
          >
            Batal
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Memproses…' : 'Ya, Buat Ulang'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

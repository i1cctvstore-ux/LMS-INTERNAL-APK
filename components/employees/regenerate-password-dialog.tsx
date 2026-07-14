'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
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
import { PasswordDisplay } from '@/components/employees/password-display'
import type { Employee } from '@/lib/employees'

type RegeneratePasswordDialogProps = {
  employee: Employee
}

export function RegeneratePasswordDialog({
  employee,
}: RegeneratePasswordDialogProps) {
  const [open, setOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setConfirmed(false)
      setPassword('')
      setError(null)
    }
  }

  async function handleConfirm() {
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/employees/${employee.id}/regenerate-password`, {
      method: 'POST',
    })
    const body = await res.json().catch(() => null)
    setLoading(false)

    if (!res.ok) {
      setError(body?.message ?? 'Gagal membuat ulang password.')
      return
    }

    setPassword(body.password)
    setConfirmed(true)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Buat ulang password untuk ${employee.name}`}
          />
        }
      >
        <KeyRound className="size-4" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {confirmed ? 'Password Baru Dibuat' : 'Buat Ulang Password?'}
          </DialogTitle>
          <DialogDescription>
            {confirmed
              ? `Password lama untuk ${employee.name} tidak berlaku lagi. Salin password baru di bawah ini.`
              : `Password lama milik ${employee.name} (${employee.email}) akan diganti dan tidak bisa dipakai lagi. Lanjutkan?`}
          </DialogDescription>
        </DialogHeader>

        {confirmed ? (
          <PasswordDisplay password={password} />
        ) : null}

        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : null}

        <DialogFooter className="mt-2 gap-2 sm:gap-0">
          {confirmed ? (
            <Button type="button" onClick={() => handleOpenChange(false)}>
              Selesai
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Batal
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={loading}>
                {loading ? 'Memproses…' : 'Ya, Buat Ulang'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

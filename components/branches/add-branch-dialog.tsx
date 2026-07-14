'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Branch } from '@/lib/branches'

type AddBranchDialogProps = {
  onAdd: (branch: Branch) => void
}

export function AddBranchDialog({ onAdd }: AddBranchDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setName('')
    setAddress('')
    setPhone('')
    setError(null)
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Nama cabang wajib diisi.')
      return
    }
    setSaving(true)
    setError(null)

    const res = await fetch('/api/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), address, phone }),
    })
    const body = await res.json().catch(() => null)
    setSaving(false)

    if (!res.ok) {
      setError(body?.message ?? 'Gagal menambah cabang.')
      return
    }

    onAdd(body.branch)
    setOpen(false)
    resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" aria-hidden="true" />
        Cabang Baru
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Cabang</DialogTitle>
          <DialogDescription>
            Karyawan dan proyek nanti di-assign ke salah satu cabang ini.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="branch-name">Nama Cabang</Label>
            <Input
              id="branch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. i1 CCTV — Solo"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="branch-address">Alamat (opsional)</Label>
            <Input
              id="branch-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="mis. Jl. Slamet Riyadi No. 1"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="branch-phone">Telepon (opsional)</Label>
            <Input
              id="branch-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="mis. 0271-xxxxxxx"
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
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan Cabang'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

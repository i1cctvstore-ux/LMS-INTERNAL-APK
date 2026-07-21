'use client'

import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordDisplay } from '@/components/employees/password-display'
import { generatePassword } from '@/lib/password'
import { ROLES, ROLE_LABELS, type Employee, type Role } from '@/lib/employees'

type AddEmployeeDialogProps = {
  onAdd: (employee: Employee) => void
}

export function AddEmployeeDialog({ onAdd }: AddEmployeeDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('teknisi')
  const [password, setPassword] = useState(() => generatePassword())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setName('')
    setEmail('')
    setRole('teknisi')
    setPassword(generatePassword())
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) resetForm()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return

    setSaving(true)
    setError(null)

    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), role, password }),
    })

    const body = await res.json().catch(() => null)
    setSaving(false)

    if (!res.ok) {
      setError(body?.message ?? 'Gagal menambah karyawan.')
      return
    }

    onAdd(body.employee)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" className="gap-2" />}>
        <UserPlus className="size-4" aria-hidden="true" />
        Tambah Karyawan
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Karyawan</DialogTitle>
          <DialogDescription>
            Isi data karyawan baru. Password otomatis dibuat untuk akun mereka.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="emp-name">Nama Lengkap</Label>
            <Input
              id="emp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="cth. Andi Wijaya"
              autoComplete="off"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="emp-email">Email</Label>
            <Input
              id="emp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cth. andi@i1cctv.com"
              autoComplete="off"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="emp-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="emp-role">
                <SelectValue placeholder="Pilih role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Password Otomatis</Label>
            <PasswordDisplay
              password={password}
              onRegenerate={() => setPassword(generatePassword())}
            />
          </div>

          {error ? (
            <p className="text-sm font-medium text-destructive">{error}</p>
          ) : null}

          <DialogFooter className="mt-2 gap-2 sm:gap-0">
            <Button type="submit" disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan Karyawan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

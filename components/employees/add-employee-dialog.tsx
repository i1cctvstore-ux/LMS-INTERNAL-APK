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
import { ROLES, ROLE_LABELS, STAFF_ROLES, type Employee, type Role } from '@/lib/employees'
import type { Branch } from '@/lib/branches'

type AddEmployeeDialogProps = {
  onAdd: (employee: Employee) => void
  // Role & cabang dari user yang sedang login. Dipakai untuk membatasi
  // pilihan role (admin cabang cuma boleh bikin staff) dan mengunci cabang
  // ke cabang admin itu sendiri.
  currentUserRole: Role
  currentUserBranchId: string | null
}

export function AddEmployeeDialog({
  onAdd,
  currentUserRole,
  currentUserBranchId,
}: AddEmployeeDialogProps) {
  const isSuperAdmin = currentUserRole === 'super_admin'
  const roleOptions = isSuperAdmin ? ROLES : STAFF_ROLES

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('teknisi')
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState<string>(currentUserBranchId ?? '')
  const [password, setPassword] = useState(() => generatePassword())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setName('')
    setEmail('')
    setRole('teknisi')
    setBranchId(currentUserBranchId ?? '')
    setPassword(generatePassword())
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      resetForm()
      // Admin cabang cuma butuh lihat daftar cabang buat nampilin nama
      // cabangnya sendiri (dropdown-nya dikunci), Super Admin butuh daftar
      // lengkap buat memilih cabang mana saja.
      if (branches.length === 0) {
        fetch('/api/branches')
          .then((res) => res.json())
          .then((body) => setBranches(body.branches ?? []))
          .catch(() => {})
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return

    setSaving(true)
    setError(null)

    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        role,
        // Kalau bukan super_admin, branch_id yang dikirim diabaikan oleh
        // API (server selalu pakai cabang Admin itu sendiri) — tetap
        // dikirim di sini cuma buat konsistensi/preview di UI.
        branch_id: isSuperAdmin ? branchId || null : currentUserBranchId,
        password,
      }),
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

  const currentBranchName = branches.find((b) => b.id === currentUserBranchId)?.name

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
                <SelectValue placeholder="Pilih role">
                  {(value: Role) => ROLE_LABELS[value]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isSuperAdmin ? (
              <p className="text-xs text-muted-foreground">
                Sebagai Admin cabang, Anda cuma bisa menambah Kasir, Gudang,
                atau Teknisi.
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="emp-branch">Cabang</Label>
            {isSuperAdmin ? (
              <>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger id="emp-branch">
                    <SelectValue placeholder="Pilih cabang">
                      {(value: string) =>
                        branches.find((b) => b.id === value)?.name ?? 'Pilih cabang'
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Bisa dikosongkan dulu, di-assign belakangan lewat halaman
                  User Role.
                </p>
              </>
            ) : (
              <>
                <Input
                  id="emp-branch"
                  value={currentBranchName ?? 'Cabang Anda'}
                  disabled
                  readOnly
                />
                <p className="text-xs text-muted-foreground">
                  Karyawan baru otomatis masuk ke cabang Anda.
                </p>
              </>
            )}
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

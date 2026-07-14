'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { AddBranchDialog } from '@/components/branches/add-branch-dialog'
import { createClient } from '@/lib/supabase/client'
import type { Branch } from '@/lib/branches'

export function BranchManagement() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBranches()
  }, [])

  async function loadBranches() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('branches').select('*').order('name')
    setBranches(data ?? [])
    setLoading(false)
  }

  async function toggleActive(id: string, active: boolean) {
    setBranches((prev) => prev.map((b) => (b.id === id ? { ...b, active } : b)))
    await fetch(`/api/branches/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    })
  }

  function addBranch(branch: Branch) {
    setBranches((prev) => [...prev, branch].sort((a, b) => a.name.localeCompare(b.name)))
  }

  function StatusToggle({ branch }: { branch: Branch }) {
    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={branch.active}
          onCheckedChange={(v) => toggleActive(branch.id, v)}
          aria-label={`Status ${branch.name}`}
        />
        <Badge
          variant={branch.active ? 'default' : 'secondary'}
          className={
            branch.active
              ? 'bg-primary/10 text-primary hover:bg-primary/10'
              : 'text-muted-foreground'
          }
        >
          {branch.active ? 'Aktif' : 'Nonaktif'}
        </Badge>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Kelola Cabang</h2>
          <p className="text-sm text-muted-foreground">
            Cabang yang aktif bisa dipilih saat menambah karyawan dan proyek.
          </p>
        </div>
        <AddBranchDialog onAdd={addBranch} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Building2 className="size-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle className="text-base">Semua Cabang</CardTitle>
            <CardDescription>
              {loading ? 'Memuat…' : `${branches.length} cabang terdaftar`}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="px-0 sm:px-6">
          {/* Tabel — sm ke atas */}
          <div className="hidden overflow-x-auto sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Cabang</TableHead>
                  <TableHead>Alamat</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium text-foreground">{b.name}</TableCell>
                    <TableCell className="text-muted-foreground">{b.address || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{b.phone || '-'}</TableCell>
                    <TableCell>
                      <StatusToggle branch={b} />
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && branches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      Belum ada cabang. Tambah dulu lewat tombol "Cabang Baru".
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          {/* List card — di bawah sm (mobile) */}
          <div className="flex flex-col gap-3 px-4 sm:hidden">
            {branches.map((b) => (
              <Card key={b.id} className="gap-2 p-4">
                <p className="font-medium text-foreground">{b.name}</p>
                {b.address ? (
                  <p className="text-xs text-muted-foreground">{b.address}</p>
                ) : null}
                {b.phone ? (
                  <p className="text-xs text-muted-foreground">{b.phone}</p>
                ) : null}
                <div className="pt-1">
                  <StatusToggle branch={b} />
                </div>
              </Card>
            ))}
            {!loading && branches.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Belum ada cabang.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

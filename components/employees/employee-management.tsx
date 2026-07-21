'use client'

import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { AddEmployeeDialog } from '@/components/employees/add-employee-dialog'
import { RegeneratePasswordDialog } from '@/components/employees/regenerate-password-dialog'
import { ROLES, ROLE_LABELS, type Employee, type Role } from '@/lib/employees'
import { createClient } from '@/lib/supabase/client'

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

type EmployeeManagementProps = {
  currentUserRole: Role
}

export function EmployeeManagement({ currentUserRole }: EmployeeManagementProps) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Halaman ini sekarang cuma bisa diakses super_admin (lihat lib/nav-config.tsx),
  // jadi di titik ini currentUserRole harusnya selalu 'super_admin'. Tetap dicek
  // eksplisit sebagai jaga-jaga kalau komponen ini dipakai ulang di tempat lain.
  const isAdmin = currentUserRole === 'super_admin'

  useEffect(() => {
    loadEmployees()
  }, [])

  async function loadEmployees() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError('Gagal memuat data karyawan.')
    } else {
      setEmployees(data ?? [])
    }
    setLoading(false)
  }

  function addEmployee(employee: Employee) {
    setEmployees((prev) => [employee, ...prev])
  }

  async function updateRole(id: string, role: Role) {
    const previous = employees
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, role } : e)))

    const res = await fetch(`/api/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })

    if (!res.ok) {
      setEmployees(previous)
      setError('Gagal mengubah role. Coba lagi.')
    }
  }

  async function toggleActive(id: string, active: boolean) {
    const previous = employees
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, active } : e)))

    const res = await fetch(`/api/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    })

    if (!res.ok) {
      setEmployees(previous)
      setError('Gagal mengubah status. Coba lagi.')
    }
  }

  const activeCount = employees.filter((e) => e.active).length

  function RoleSelect({ emp }: { emp: Employee }) {
    return (
      <Select
        value={emp.role}
        onValueChange={(v) => updateRole(emp.id, v as Role)}
        disabled={!isAdmin}
      >
        <SelectTrigger className="h-9 w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {ROLE_LABELS[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  function StatusToggle({ emp }: { emp: Employee }) {
    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={emp.active}
          onCheckedChange={(v) => toggleActive(emp.id, v)}
          aria-label={`Status ${emp.name}`}
          disabled={!isAdmin}
        />
        <Badge
          variant={emp.active ? 'default' : 'secondary'}
          className={
            emp.active
              ? 'bg-primary/10 text-primary hover:bg-primary/10'
              : 'text-muted-foreground'
          }
        >
          {emp.active ? 'Aktif' : 'Nonaktif'}
        </Badge>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Manajemen Karyawan</h2>
          <p className="text-sm text-muted-foreground">
            Kelola akun, role, dan status akses karyawan toko.
          </p>
        </div>
        {isAdmin ? <AddEmployeeDialog onAdd={addEmployee} /> : null}
      </div>

      {error ? (
        <p className="text-sm font-medium text-destructive">{error}</p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Users className="size-4" aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-base">Daftar Karyawan</CardTitle>
              <CardDescription>
                {loading
                  ? 'Memuat…'
                  : `${employees.length} total · ${activeCount} aktif`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 sm:px-6">
          {!loading && employees.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-0">
              Belum ada data karyawan.
            </p>
          ) : (
            <>
              {/* Mobile (< sm): list card bertumpuk, tanpa scroll ke samping */}
              <div className="flex flex-col gap-3 px-4 sm:hidden">
                {employees.map((emp) => (
                  <Card key={emp.id} className="border-border">
                    <CardContent className="flex flex-col gap-3 p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                            {initials(emp.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className="truncate font-medium text-foreground">
                            {emp.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {emp.email}
                          </p>
                        </div>
                        {isAdmin ? <RegeneratePasswordDialog employee={emp} /> : null}
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                        <RoleSelect emp={emp} />
                        <StatusToggle emp={emp} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* sm ke atas: tabel biasa */}
              <div className="hidden sm:block">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Karyawan</TableHead>
                        <TableHead className="min-w-[150px]">Role</TableHead>
                        <TableHead className="min-w-[130px]">Status</TableHead>
                        <TableHead className="min-w-[80px] text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map((emp) => (
                        <TableRow key={emp.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="size-9">
                                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                                  {initials(emp.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="leading-tight">
                                <p className="font-medium text-foreground">
                                  {emp.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {emp.email}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <RoleSelect emp={emp} />
                          </TableCell>
                          <TableCell>
                            <StatusToggle emp={emp} />
                          </TableCell>
                          <TableCell className="text-right">
                            {isAdmin ? <RegeneratePasswordDialog employee={emp} /> : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

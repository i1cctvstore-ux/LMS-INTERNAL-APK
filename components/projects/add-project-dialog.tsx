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
import { Checkbox } from '@/components/ui/checkbox'
import { createClient } from '@/lib/supabase/client'
import type { Project, Technician } from '@/lib/projects'

type AddProjectDialogProps = {
  onAdd: (project: Project) => void
}

type ProfileOption = { id: string; name: string }

export function AddProjectDialog({ onAdd }: AddProjectDialogProps) {
  const [open, setOpen] = useState(false)
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [selectedTechnicians, setSelectedTechnicians] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [customerName, setCustomerName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [area, setArea] = useState('')
  const [cameraCount, setCameraCount] = useState('')
  const [eta, setEta] = useState('')

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next && profiles.length === 0) {
      setLoadingProfiles(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('active', true)
        .order('name')
      setProfiles(data ?? [])
      setLoadingProfiles(false)
    }
  }

  function toggleTechnician(id: string) {
    setSelectedTechnicians((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  function resetForm() {
    setCustomerName('')
    setProjectName('')
    setArea('')
    setCameraCount('')
    setEta('')
    setSelectedTechnicians([])
    setError(null)
  }

  async function handleSubmit() {
    if (!customerName.trim() || !area.trim()) {
      setError('Nama customer dan area wajib diisi.')
      return
    }
    setSubmitting(true)
    setError(null)
    const supabase = createClient()

    const { data: code } = await supabase.rpc('next_project_code')

    const { data: inserted, error: insertError } = await supabase
      .from('projects')
      .insert({
        code,
        customer_name: customerName.trim(),
        project_name: projectName.trim() || null,
        area: area.trim(),
        camera_count: cameraCount ? Number(cameraCount) : null,
        eta: eta || null,
      })
      .select()
      .single()

    if (insertError || !inserted) {
      setError('Gagal membuat proyek. Coba lagi.')
      setSubmitting(false)
      return
    }

    if (selectedTechnicians.length > 0) {
      await supabase.from('project_technicians').insert(
        selectedTechnicians.map((profileId) => ({
          project_id: inserted.id,
          profile_id: profileId,
        }))
      )
    }

    const technicians: Technician[] = profiles
      .filter((p) => selectedTechnicians.includes(p.id))
      .map((p) => ({ id: p.id, name: p.name }))

    onAdd({ ...inserted, technicians })
    setSubmitting(false)
    setOpen(false)
    resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" aria-hidden="true" />
        Proyek Baru
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buat Proyek Baru</DialogTitle>
          <DialogDescription>
            Kode proyek dibuat otomatis. Lengkapi detail di bawah, teknisi bisa
            ditambah belakangan lewat halaman detail.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          <div className="flex flex-col gap-2">
            <Label htmlFor="customer-name">Nama Customer</Label>
            <Input
              id="customer-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="mis. PT Maju Jaya"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Nama Proyek (opsional)</Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="mis. Gudang Distribusi"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="area">Area</Label>
              <Input
                id="area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="mis. Cikarang"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="camera-count">Jumlah Kamera</Label>
              <Input
                id="camera-count"
                type="number"
                min={0}
                value={cameraCount}
                onChange={(e) => setCameraCount(e.target.value)}
                placeholder="mis. 14"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="eta">Target Selesai</Label>
            <Input
              id="eta"
              type="date"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Teknisi</Label>
            <div className="flex max-h-36 flex-col gap-2 overflow-y-auto rounded-md border border-border p-2">
              {loadingProfiles ? (
                <p className="text-sm text-muted-foreground">Memuat…</p>
              ) : profiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada karyawan aktif.
                </p>
              ) : (
                profiles.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => toggleTechnician(p.id)}
                    className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                  >
                    <Checkbox
                      checked={selectedTechnicians.includes(p.id)}
                      onCheckedChange={() => toggleTechnician(p.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {p.name}
                  </div>
                ))
              )}
            </div>
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
            {submitting ? 'Menyimpan…' : 'Simpan Proyek'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

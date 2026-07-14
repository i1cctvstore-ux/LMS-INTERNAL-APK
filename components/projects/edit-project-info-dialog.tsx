'use client'

import { useState, type ReactElement } from 'react'
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
import { createClient } from '@/lib/supabase/client'
import type { Project } from '@/lib/projects'

type EditProjectInfoDialogProps = {
  project: Project
  onUpdated: (updated: Partial<Project>) => void
  trigger: ReactElement
}

export function EditProjectInfoDialog({
  project,
  onUpdated,
  trigger,
}: EditProjectInfoDialogProps) {
  const [open, setOpen] = useState(false)
  const [customerName, setCustomerName] = useState(project.customer_name)
  const [projectName, setProjectName] = useState(project.project_name ?? '')
  const [area, setArea] = useState(project.area)
  const [cameraCount, setCameraCount] = useState(
    project.camera_count?.toString() ?? ''
  )
  const [eta, setEta] = useState(project.eta ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const supabase = createClient()

    const payload = {
      customer_name: customerName.trim(),
      project_name: projectName.trim() || null,
      area: area.trim(),
      camera_count: cameraCount ? Number(cameraCount) : null,
      eta: eta || null,
    }

    const { error: updateError } = await supabase
      .from('projects')
      .update(payload)
      .eq('id', project.id)

    if (updateError) {
      setError('Gagal menyimpan perubahan.')
      setSubmitting(false)
      return
    }

    onUpdated(payload)
    setSubmitting(false)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Detail Proyek</DialogTitle>
          <DialogDescription>
            Perubahan langsung tersimpan begitu kamu klik simpan.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-customer">Nama Customer</Label>
            <Input
              id="edit-customer"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-project-name">Nama Proyek</Label>
            <Input
              id="edit-project-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-area">Area</Label>
              <Input
                id="edit-area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-cameras">Jumlah Kamera</Label>
              <Input
                id="edit-cameras"
                type="number"
                min={0}
                value={cameraCount}
                onChange={(e) => setCameraCount(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-eta">Target Selesai</Label>
            <Input
              id="edit-eta"
              type="date"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
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
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Menyimpan…' : 'Simpan Perubahan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

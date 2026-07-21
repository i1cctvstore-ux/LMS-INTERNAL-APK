'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ROLES, ROLE_LABELS, type Role } from '@/lib/employees'
import { MATERIAL_CATEGORIES, type LmsMaterial } from '@/lib/lms'
import { createClient } from '@/lib/supabase/client'

// Role yang bisa dipilih sebagai target visibility. super_admin gak perlu
// dipilih karena selalu bisa lihat semua materi.
const TARGET_ROLE_OPTIONS = ROLES.filter((r) => r !== 'super_admin')

type MaterialFormDialogProps = {
  mode: 'add' | 'edit'
  material?: LmsMaterial
  existingQuestions?: string
  onSaved: (material: LmsMaterial, questions: string) => void
}

export function MaterialFormDialog({
  mode,
  material,
  existingQuestions,
  onSaved,
}: MaterialFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(material?.title ?? '')
  const [category, setCategory] = useState(material?.category ?? MATERIAL_CATEGORIES[0])
  const [section, setSection] = useState(material?.section ?? '')
  const [content, setContent] = useState(material?.content ?? '')
  const [questions, setQuestions] = useState(existingQuestions ?? '')
  const [readyToTest, setReadyToTest] = useState(material?.ready_to_test ?? false)
  const [targetRoles, setTargetRoles] = useState<Role[]>(material?.target_roles ?? [])

  useEffect(() => {
    if (!open) return
    setTitle(material?.title ?? '')
    setCategory(material?.category ?? MATERIAL_CATEGORIES[0])
    setSection(material?.section ?? '')
    setContent(material?.content ?? '')
    setQuestions(existingQuestions ?? '')
    setReadyToTest(material?.ready_to_test ?? false)
    setTargetRoles(material?.target_roles ?? [])
    setError(null)
  }, [open, material, existingQuestions])

  function toggleRole(role: Role, checked: boolean) {
    setTargetRoles((prev) =>
      checked ? [...prev, role] : prev.filter((r) => r !== role),
    )
  }

  async function handleSave() {
    if (!title.trim()) {
      setError('Judul materi wajib diisi.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = createClient()

    const payload = {
      title: title.trim(),
      category,
      section: section.trim() || 'Umum',
      content,
      ready_to_test: readyToTest,
      target_roles: targetRoles,
    }

    let savedMaterial: LmsMaterial | null = null

    if (mode === 'add') {
      const { data, error: insertError } = await supabase
        .from('lms_materials')
        .insert(payload)
        .select()
        .single()
      if (insertError || !data) {
        setError('Gagal menyimpan materi. Coba lagi.')
        setSaving(false)
        return
      }
      savedMaterial = data as LmsMaterial
    } else {
      const { data, error: updateError } = await supabase
        .from('lms_materials')
        .update(payload)
        .eq('id', material!.id)
        .select()
        .single()
      if (updateError || !data) {
        setError('Gagal menyimpan perubahan. Coba lagi.')
        setSaving(false)
        return
      }
      savedMaterial = data as LmsMaterial
    }

    // Soal uji disimpan terpisah (tabel lms_material_tests, RLS super_admin saja)
    const { error: testError } = await supabase
      .from('lms_material_tests')
      .upsert({ material_id: savedMaterial.id, questions })

    if (testError) {
      setError('Materi tersimpan, tapi soal uji gagal disimpan. Coba edit lagi.')
      setSaving(false)
      return
    }

    setSaving(false)
    setOpen(false)
    onSaved(savedMaterial, questions)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          mode === 'add' ? (
            <Button className="w-full justify-center gap-2 sm:w-auto" />
          ) : (
            <Button variant="outline" size="sm" className="gap-2" />
          )
        }
      >
        {mode === 'add' ? (
          <>
            <Plus className="size-4" aria-hidden="true" />
            Tambah Materi Baru
          </>
        ) : (
          <>
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'add' ? 'Tambah Materi Baru' : 'Edit Materi'}
          </DialogTitle>
          <DialogDescription>
            Isi materi bisa dilihat karyawan sesuai target akses. Soal uji hanya
            terlihat oleh Super Admin.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="material-title">Judul</Label>
            <Input
              id="material-title"
              placeholder="mis. SOP Instalasi CCTV Indoor"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Kategori</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATERIAL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="material-section">Grup / Section</Label>
              <Input
                id="material-section"
                placeholder="mis. Administrasi & Operasional"
                value={section}
                onChange={(e) => setSection(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Bisa dilihat oleh</Label>
            <div className="flex flex-wrap gap-3 rounded-lg border border-border p-3">
              {TARGET_ROLE_OPTIONS.map((role) => (
                <label
                  key={role}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <Checkbox
                    checked={targetRoles.includes(role)}
                    onCheckedChange={(checked) => toggleRole(role, checked === true)}
                  />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Tidak dicentang semua = materi terlihat oleh semua role. Super
              Admin selalu bisa melihat semua materi.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="material-content">Isi Materi</Label>
            <Textarea
              id="material-content"
              rows={5}
              placeholder="Tulis isi materi di sini..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="material-questions">
              Soal Uji (khusus Super Admin, tidak terlihat karyawan)
            </Label>
            <Textarea
              id="material-questions"
              rows={4}
              placeholder="Tulis pertanyaan uji lisan di sini..."
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={readyToTest}
              onCheckedChange={(checked) => setReadyToTest(checked === true)}
            />
            Siap diujikan (karyawan boleh mengajukan verifikasi)
          </label>

          {error ? (
            <p className="text-sm font-medium text-destructive">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

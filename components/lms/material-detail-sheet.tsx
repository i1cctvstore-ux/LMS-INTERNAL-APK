'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { MaterialFormDialog } from './material-form-dialog'
import {
  SUBMISSION_STATUS_LABELS,
  canManageMaterials,
  type LmsMaterial,
  type SubmissionStatus,
} from '@/lib/lms'
import type { Role } from '@/lib/employees'
import { createClient } from '@/lib/supabase/client'

type MaterialDetailSheetProps = {
  material: LmsMaterial | null
  currentUserRole: Role
  mySubmissionStatus: SubmissionStatus | null
  onOpenChange: (open: boolean) => void
  onSubmitted: () => void
  onMaterialUpdated: (material: LmsMaterial, questions: string) => void
  onMaterialDeleted: (id: string) => void
}

function statusBadgeVariant(status: SubmissionStatus | null) {
  if (status === 'approved') return 'default'
  if (status === 'rejected') return 'destructive'
  if (status === 'pending') return 'secondary'
  return 'outline'
}

export function MaterialDetailSheet({
  material,
  currentUserRole,
  mySubmissionStatus,
  onOpenChange,
  onSubmitted,
  onMaterialUpdated,
  onMaterialDeleted,
}: MaterialDetailSheetProps) {
  const isAdmin = canManageMaterials(currentUserRole)
  const [questions, setQuestions] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    if (!material || !isAdmin) {
      setQuestions('')
      return
    }
    let cancelled = false
    async function loadQuestions() {
      const supabase = createClient()
      const { data } = await supabase
        .from('lms_material_tests')
        .select('questions')
        .eq('material_id', material!.id)
        .maybeSingle()
      if (!cancelled) setQuestions(data?.questions ?? '')
    }
    loadQuestions()
    return () => {
      cancelled = true
    }
  }, [material, isAdmin])

  async function handleSubmitVerification() {
    if (!material) return
    setSubmitting(true)
    setError(null)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Sesi login tidak ditemukan.')
      setSubmitting(false)
      return
    }
    const { error: insertError } = await supabase.from('lms_submissions').insert({
      material_id: material.id,
      user_id: user.id,
      status: 'pending',
    })
    if (insertError) {
      setError('Gagal mengajukan verifikasi. Coba lagi.')
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    onSubmitted()
  }

  async function handleDelete() {
    if (!material) return
    const supabase = createClient()
    const { error: deleteError } = await supabase
      .from('lms_materials')
      .delete()
      .eq('id', material.id)
    if (!deleteError) {
      onMaterialDeleted(material.id)
    }
  }

  return (
    <Sheet open={!!material} onOpenChange={(o) => !o && onOpenChange(false)}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {material ? (
          <>
            <SheetHeader>
              <SheetTitle>{material.title}</SheetTitle>
              <SheetDescription>{material.category} · {material.section}</SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-4 px-4 pb-4 sm:px-6">
              <div>
                <Badge variant={statusBadgeVariant(mySubmissionStatus)}>
                  {mySubmissionStatus
                    ? SUBMISSION_STATUS_LABELS[mySubmissionStatus]
                    : 'Belum dipelajari'}
                </Badge>
                {mySubmissionStatus === 'rejected' ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pengajuan sebelumnya ditolak. Pelajari ulang lalu ajukan
                    verifikasi kembali.
                  </p>
                ) : null}
              </div>

              <p className="whitespace-pre-wrap text-sm text-foreground">
                {material.content || 'Belum ada isi materi.'}
              </p>

              {isAdmin ? (
                <div className="rounded-lg border border-dashed border-border p-3">
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">
                    Soal Uji (khusus Super Admin)
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {questions || 'Belum ada soal uji.'}
                  </p>
                </div>
              ) : null}

              {error ? (
                <p className="text-sm font-medium text-destructive">{error}</p>
              ) : null}
            </div>

            <SheetFooter className="flex-col gap-2 sm:flex-row">
              {isAdmin ? (
                <div className="flex w-full gap-2">
                  <MaterialFormDialog
                    mode="edit"
                    material={material}
                    existingQuestions={questions}
                    onSaved={onMaterialUpdated}
                  />
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button variant="outline" size="sm" className="gap-2 text-destructive" />
                      }
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      Hapus
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Hapus materi ini?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Materi &quot;{material.title}&quot; beserta riwayat
                          verifikasinya akan dihapus permanen. Tindakan ini
                          tidak bisa dibatalkan.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>
                          Ya, Hapus
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : (
                <Button
                  className="w-full justify-center"
                  disabled={
                    submitting ||
                    mySubmissionStatus === 'pending' ||
                    mySubmissionStatus === 'approved' ||
                    !material.ready_to_test
                  }
                  onClick={handleSubmitVerification}
                >
                  {submitting
                    ? 'Mengirim…'
                    : mySubmissionStatus === 'approved'
                      ? 'Sudah Terverifikasi'
                      : mySubmissionStatus === 'pending'
                        ? 'Menunggu Verifikasi'
                        : !material.ready_to_test
                          ? 'Belum Bisa Diujikan'
                          : 'Ajukan Verifikasi'}
                </Button>
              )}
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

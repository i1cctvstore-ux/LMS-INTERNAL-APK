'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { STAGES, type Stage } from '@/lib/projects'

type StageTrackerProps = {
  currentStage: Stage
  onChange: (stage: Stage) => Promise<void> | void
}

export function StageTracker({ currentStage, onChange }: StageTrackerProps) {
  const [pending, setPending] = useState<Stage | null>(null)
  const currentIndex = STAGES.indexOf(currentStage)

  return (
    <div className="flex flex-wrap gap-2">
      {STAGES.map((stage, index) => {
        const isDone = index < currentIndex
        const isCurrent = stage === currentStage
        return (
          <button
            key={stage}
            type="button"
            onClick={() => setPending(stage)}
            disabled={isCurrent}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              isCurrent
                ? 'border-primary bg-primary text-primary-foreground'
                : isDone
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-transparent text-muted-foreground hover:bg-muted'
            )}
          >
            {isDone ? <Check className="size-3" aria-hidden="true" /> : null}
            {stage}
          </button>
        )
      })}

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ubah status proyek?</AlertDialogTitle>
            <AlertDialogDescription>
              Status akan diubah menjadi &ldquo;{pending}&rdquo;. Perubahan ini
              otomatis tercatat sebagai update terakhir proyek.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPending(null)}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pending) await onChange(pending)
                setPending(null)
              }}
            >
              Ya, Ubah
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

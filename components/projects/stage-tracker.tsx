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
    <div className="w-full overflow-x-auto">
      <div className="flex min-w-max items-start">
        {STAGES.map((stage, index) => {
          const isDone = index < currentIndex
          const isCurrent = stage === currentStage
          const isLast = index === STAGES.length - 1

          return (
            <div key={stage} className="flex items-start">
              <div className="flex w-20 flex-col items-center gap-1.5 sm:w-24">
                <button
                  type="button"
                  onClick={() => setPending(stage)}
                  disabled={isCurrent}
                  aria-label={`Ubah status ke ${stage}`}
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                    isCurrent
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isDone
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-transparent text-muted-foreground hover:bg-muted'
                  )}
                >
                  {isDone ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                </button>
                <span
                  className={cn(
                    'text-center text-xs font-medium',
                    isCurrent || isDone ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {stage}
                </span>
              </div>

              {!isLast ? (
                <div
                  className={cn(
                    'mt-4 h-0.5 w-6 shrink-0 sm:w-10',
                    isDone ? 'bg-primary' : 'bg-border'
                  )}
                  aria-hidden="true"
                />
              ) : null}
            </div>
          )
        })}
      </div>

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

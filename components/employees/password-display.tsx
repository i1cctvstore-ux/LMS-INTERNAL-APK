'use client'

import { useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type PasswordDisplayProps = {
  password: string
  onRegenerate?: () => void
}

export function PasswordDisplay({ password, onRegenerate }: PasswordDisplayProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard bisa gagal di beberapa konteks; abaikan dengan aman
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <code className="select-all break-all font-mono text-sm font-semibold text-foreground">
          {password}
        </code>
        <div className="flex shrink-0 items-center gap-1">
          {onRegenerate && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onRegenerate}
              aria-label="Buat ulang password"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={handleCopy}
            aria-label="Salin password"
          >
            {copied ? (
              <Check className="size-4 text-primary" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {copied ? 'Password disalin ke clipboard.' : 'Salin dan berikan password ini kepada karyawan.'}
      </p>
    </div>
  )
}

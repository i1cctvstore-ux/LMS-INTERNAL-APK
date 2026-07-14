import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

type ModulePlaceholderProps = {
  title: string
  description: string
  icon: LucideIcon
}

export function ModulePlaceholder({
  title,
  description,
  icon: Icon,
}: ModulePlaceholderProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <Card className="border-dashed border-border">
        <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-7" aria-hidden="true" />
          </div>
          <div className="max-w-sm">
            <p className="text-base font-semibold text-foreground">
              Modul {title} siap dikembangkan
            </p>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Struktur halaman sudah tersedia. Tambahkan tabel data, form, dan
              integrasi API di sini sesuai kebutuhan.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

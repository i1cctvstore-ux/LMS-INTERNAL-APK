import {
  Wrench,
  PackagePlus,
  ShoppingCart,
  UserPlus,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Activity = {
  title: string
  detail: string
  time: string
  icon: LucideIcon
  accent: string
}

const ACTIVITIES: Activity[] = [
  {
    title: 'Servis baru diterima',
    detail: 'DVR Hikvision 8CH — a.n. Budi Santoso',
    time: '5 menit lalu',
    icon: Wrench,
    accent: 'bg-primary/10 text-primary',
  },
  {
    title: 'Transaksi penjualan',
    detail: 'Kamera Dome 5MP x2 — Rp 1.240.000',
    time: '32 menit lalu',
    icon: ShoppingCart,
    accent: 'bg-chart-4/15 text-chart-4',
  },
  {
    title: 'Stok masuk',
    detail: 'Kabel RG59 300m — restok gudang',
    time: '1 jam lalu',
    icon: PackagePlus,
    accent: 'bg-chart-2/15 text-chart-2',
  },
  {
    title: 'Peringatan stok menipis',
    detail: 'Adaptor 12V 2A tersisa 3 unit',
    time: '2 jam lalu',
    icon: AlertTriangle,
    accent: 'bg-destructive/10 text-destructive',
  },
  {
    title: 'Pengguna baru ditambahkan',
    detail: 'Rina Wijaya — role Teknisi',
    time: 'Kemarin, 16:20',
    icon: UserPlus,
    accent: 'bg-chart-3/15 text-chart-3',
  },
]

export function RecentActivity() {
  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-base">Aktivitas Terbaru</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ul className="flex flex-col">
          {ACTIVITIES.map((act, idx) => {
            const Icon = act.icon
            return (
              <li
                key={act.title}
                className={cn(
                  'flex items-start gap-3 py-3',
                  idx !== ACTIVITIES.length - 1 && 'border-b border-border',
                )}
              >
                <div
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    act.accent,
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {act.title}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {act.detail}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {act.time}
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

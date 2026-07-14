import {
  Wrench,
  PackageX,
  Wallet,
  Boxes,
  ArrowUpRight,
  ArrowDownRight,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Stat = {
  label: string
  value: string
  helper: string
  trend: 'up' | 'down'
  trendValue: string
  icon: LucideIcon
  accent: string
}

const STATS: Stat[] = [
  {
    label: 'Total Servis Aktif',
    value: '24',
    helper: 'unit dalam pengerjaan',
    trend: 'up',
    trendValue: '+8%',
    icon: Wrench,
    accent: 'bg-primary/10 text-primary',
  },
  {
    label: 'Stok Menipis',
    value: '7',
    helper: 'produk di bawah batas',
    trend: 'down',
    trendValue: '-3',
    icon: PackageX,
    accent: 'bg-destructive/10 text-destructive',
  },
  {
    label: 'Omset Hari Ini',
    value: 'Rp 4,8jt',
    helper: 'dari 12 transaksi',
    trend: 'up',
    trendValue: '+15%',
    icon: Wallet,
    accent: 'bg-chart-4/15 text-chart-4',
  },
  {
    label: 'Total Stok',
    value: '312',
    helper: 'unit tersedia',
    trend: 'up',
    trendValue: '+21',
    icon: Boxes,
    accent: 'bg-chart-2/15 text-chart-2',
  },
]

export function StatsCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {STATS.map((stat) => {
        const Icon = stat.icon
        const TrendIcon = stat.trend === 'up' ? ArrowUpRight : ArrowDownRight
        return (
          <Card key={stat.label} className="border-border">
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between">
                <div
                  className={cn(
                    'flex size-11 items-center justify-center rounded-xl',
                    stat.accent,
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <span
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                    stat.trend === 'up'
                      ? 'bg-chart-4/15 text-chart-4'
                      : 'bg-destructive/10 text-destructive',
                  )}
                >
                  <TrendIcon className="size-3" aria-hidden="true" />
                  {stat.trendValue}
                </span>
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight text-foreground">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {stat.label}
                </p>
                <p className="text-xs text-muted-foreground">{stat.helper}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

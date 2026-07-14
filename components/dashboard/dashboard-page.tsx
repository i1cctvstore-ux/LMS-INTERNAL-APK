import { StatsCards } from '@/components/dashboard/stats-cards'
import { RecentActivity } from '@/components/dashboard/recent-activity'

type DashboardPageProps = {
  userName: string
}

export function DashboardPage({ userName }: DashboardPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground text-balance">
          Selamat datang, {userName}
        </h2>
        <p className="text-sm text-muted-foreground">
          Berikut ringkasan operasional toko i1 CCTV hari ini.
        </p>
      </div>

      <StatsCards />
      <RecentActivity />
    </div>
  )
}

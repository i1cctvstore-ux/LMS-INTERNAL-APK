'use client'

import { useState } from 'react'
import { Navbar } from '@/components/navbar'
import { Sidebar } from '@/components/sidebar'
import { Footer } from '@/components/footer'
import { NAV_ITEMS, type PageKey } from '@/lib/nav-config'
import type { Role } from '@/lib/supabase/types'

type AppShellProps = {
  activePage: PageKey
  onNavigate: (page: PageKey) => void
  onLogout: () => void
  userName: string
  userEmail: string
  userRole: Role
  // 2026-09-11: branch_id user yang login -- diteruskan ke Sidebar
  // supaya menu `jakartaOnly` (Materi, Kalkulator Maintenance) bisa
  // disembunyikan buat cabang selain Jakarta. Lihat lib/nav-config.tsx.
  userBranchId?: string | null
  children: React.ReactNode
}

export function AppShell({
  activePage,
  onNavigate,
  onLogout,
  userName,
  userEmail,
  userRole,
  userBranchId,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const title = NAV_ITEMS.find((i) => i.key === activePage)?.label ?? 'Dashboard'

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar
        activePage={activePage}
        onNavigate={onNavigate}
        onLogout={onLogout}
        userRole={userRole}
        userBranchId={userBranchId}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

<div className="flex min-h-dvh flex-1 min-w-0 flex-col">
  <Navbar
    title={title}
    userName={userName}
    userEmail={userEmail}
    onOpenMenu={() => setMobileOpen(true)}
  />
  <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
  <Footer />
     </div>
    </div>
  )
}

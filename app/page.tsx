'use client'

import { useEffect, useState } from 'react'
import { LoginScreen } from '@/components/login-screen'
import { AppShell } from '@/components/app-shell'
import { DashboardPage } from '@/components/dashboard/dashboard-page'
import { ProjectsPage } from '@/components/projects/projects-page'
import { EmployeeManagement } from '@/components/employees/employee-management'
import { ModulePlaceholder } from '@/components/module-placeholder'
import { NAV_ITEMS, getVisibleNavItems, type PageKey } from '@/lib/nav-config'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/supabase/types'

export default function Page() {
  const [checking, setChecking] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [activePage, setActivePage] = useState<PageKey>('dashboard')

  useEffect(() => {
    const supabase = createClient()

    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setProfile(null)
        setChecking(false)
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setProfile(data)
      setChecking(false)
    }

    loadProfile()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadProfile()
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setProfile(null)
    setActivePage('dashboard')
  }

  if (checking) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Memuat…</p>
      </main>
    )
  }

  if (!profile) {
    return <LoginScreen onLogin={() => setChecking(true)} />
  }

  // Jaga-jaga: kalau activePage somehow menunjuk ke halaman yang tidak boleh
  // dilihat role ini (mis. 'user-role' oleh selain super_admin), render
  // dashboard sebagai gantinya. Normalnya tidak akan kejadian karena menu
  // yang tidak boleh dilihat memang tidak dirender di Sidebar.
  const visibleKeys = new Set(getVisibleNavItems(profile.role).map((i) => i.key))
  const effectivePage: PageKey = visibleKeys.has(activePage) ? activePage : 'dashboard'
  const activeItem = NAV_ITEMS.find((i) => i.key === effectivePage)

  function renderPage() {
    switch (effectivePage) {
      case 'dashboard':
        return <DashboardPage userName={profile!.name} />
      case 'proyek':
        return <ProjectsPage />
      case 'user-role':
        return <EmployeeManagement currentUserRole={profile!.role} />
      default:
        return (
          activeItem && (
            <ModulePlaceholder
              title={activeItem.label}
              description={activeItem.description}
              icon={activeItem.icon}
            />
          )
        )
    }
  }

  return (
    <AppShell
      activePage={effectivePage}
      onNavigate={setActivePage}
      onLogout={handleLogout}
      userName={profile.name}
      userEmail={profile.email}
      userRole={profile.role}
    >
      {renderPage()}
    </AppShell>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { LoginScreen } from '@/components/login-screen'
import { AppShell } from '@/components/app-shell'
import { DashboardPage } from '@/components/dashboard/dashboard-page'
import { ProjectsPage } from '@/components/projects/projects-page'
import { BranchManagement } from '@/components/branches/branch-management'
import { EmployeeManagement } from '@/components/employees/employee-management'
import ServisModule from '@/components/servis/servis-module'
import { LmsMaterials } from '@/components/lms/lms-materials'
import { LmsVerifikasi } from '@/components/lms/lms-verifikasi'
import { ModulePlaceholder } from '@/components/module-placeholder'
import { NAV_ITEMS, getVisibleNavItems, getDefaultPage, type PageKey } from '@/lib/nav-config'
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
  // dilihat role ini (mis. 'dashboard'/'proyek' oleh gudang, atau 'user-role'
  // oleh selain super_admin/admin), jatuhkan ke halaman default yang memang
  // boleh diakses role itu. Normalnya tidak akan kejadian karena menu yang
  // tidak boleh dilihat memang tidak dirender di Sidebar.
  const visibleKeys = new Set(getVisibleNavItems(profile.role).map((i) => i.key))
  const effectivePage: PageKey = visibleKeys.has(activePage) ? activePage : getDefaultPage(profile.role)
  const activeItem = NAV_ITEMS.find((i) => i.key === effectivePage)

  function renderPage() {
    switch (effectivePage) {
      case 'dashboard':
        return <DashboardPage userName={profile!.name} />
      case 'lms-materi':
        return (
          <LmsMaterials
            currentUserId={profile!.id}
            currentUserRole={profile!.role}
          />
        )
      case 'lms-verifikasi':
        return <LmsVerifikasi />
      case 'proyek':
        return <ProjectsPage />
      case 'cabang':
        return <BranchManagement />
      case 'user-role':
        return (
          <EmployeeManagement
            currentUserRole={profile!.role}
            currentUserId={profile!.id}
            currentUserBranchId={profile!.branch_id}
          />
        )
      // Modul Servis: 5 menu sidebar terpisah, semua manggil komponen yang
      // sama (ServisModule) tapi dikasih tau lagi di section mana lewat
      // prop `section` — bukan tab internal lagi.
      case 'servis-claim':
        return (
          <ServisModule
            section="claims"
            currentUserId={profile!.id}
            currentUserRole={profile!.role}
            currentUserBranchId={profile!.branch_id}
          />
        )
      case 'servis-supplier':
        return (
          <ServisModule
            section="supplier"
            currentUserId={profile!.id}
            currentUserRole={profile!.role}
            currentUserBranchId={profile!.branch_id}
          />
        )
      case 'servis-inventaris':
        return (
          <ServisModule
            section="stok"
            currentUserId={profile!.id}
            currentUserRole={profile!.role}
            currentUserBranchId={profile!.branch_id}
          />
        )
      case 'servis-kas':
        return (
          <ServisModule
            section="kas"
            currentUserId={profile!.id}
            currentUserRole={profile!.role}
            currentUserBranchId={profile!.branch_id}
          />
        )
      case 'servis-master':
        return (
          <ServisModule
            section="settings"
            currentUserId={profile!.id}
            currentUserRole={profile!.role}
            currentUserBranchId={profile!.branch_id}
          />
        )
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

'use client'

import { ShieldCheck, LogOut, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getVisibleNavItems, type PageKey } from '@/lib/nav-config'
import type { Role } from '@/lib/supabase/types'

type SidebarNavProps = {
  activePage: PageKey
  onNavigate: (page: PageKey) => void
  onLogout: () => void
  userRole: Role
}

function SidebarContent({ activePage, onNavigate, onLogout, userRole }: SidebarNavProps) {
  const visibleItems = getVisibleNavItems(userRole)

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
        <div className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-sidebar-foreground">i1 CCTV</p>
          <p className="text-xs text-sidebar-foreground/60">Internal System</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Menu utama">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive = item.key === activePage
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onLogout}
          className="w-full justify-start gap-3 text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-5" aria-hidden="true" />
          Keluar
        </Button>
      </div>
    </div>
  )
}

type SidebarProps = SidebarNavProps & {
  mobileOpen: boolean
  onCloseMobile: () => void
}

export function Sidebar({
  activePage,
  onNavigate,
  onLogout,
  userRole,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  return (
    <>
      {/* Sidebar tetap di desktop */}
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border lg:block">
        <div className="sticky top-0 h-dvh">
          <SidebarContent
            activePage={activePage}
            onNavigate={onNavigate}
            onLogout={onLogout}
            userRole={userRole}
          />
        </div>
      </aside>

      {/* Overlay + slide-out untuk HP */}
      <div
        className={cn(
          'fixed inset-0 z-50 lg:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            'absolute inset-0 bg-foreground/40 transition-opacity duration-300',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={onCloseMobile}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu navigasi"
          className={cn(
            'absolute left-0 top-0 h-full w-72 max-w-[80%] shadow-xl transition-transform duration-300 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCloseMobile}
            aria-label="Tutup menu"
            className="absolute right-3 top-3 z-10 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
          <SidebarContent
            activePage={activePage}
            onNavigate={(page) => {
              onNavigate(page)
              onCloseMobile()
            }}
            onLogout={onLogout}
            userRole={userRole}
          />
        </div>
      </div>
    </>
  )
}

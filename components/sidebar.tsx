'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, LogOut, X, ChevronDown, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getVisibleNavItems, NAV_GROUPS, type PageKey } from '@/lib/nav-config'
import type { Role } from '@/lib/supabase/types'

type SidebarNavProps = {
  activePage: PageKey
  onNavigate: (page: PageKey) => void
  onLogout: () => void
  userRole: Role
  // 2026-09-11: dipakai getVisibleNavItems() buat filter menu `jakartaOnly`
  // (Materi, Kalkulator Maintenance) -- lihat lib/nav-config.tsx.
  userBranchId?: string | null
  // 2026-09-29: mode ciut (ikon doang, tanpa label) -- CUMA dipakai versi
  // desktop (lihat komponen Sidebar di bawah). Versi mobile/drawer selalu
  // full, gak pernah diciutin, jadi prop ini default false di situ.
  collapsed?: boolean
}

function SidebarContent({ activePage, onNavigate, onLogout, userRole, userBranchId, collapsed = false }: SidebarNavProps) {
  const visibleItems = getVisibleNavItems(userRole, userBranchId)
  const visibleKeys = new Set(visibleItems.map((i) => i.key))
  // Grup yang dibuka manual lewat klik. Grup yang sedang berisi activePage
  // selalu ikut tampil terbuka juga, walau belum pernah diklik — supaya
  // waktu pertama masuk ke salah satu sub-menunya, "folder"-nya otomatis
  // kebuka, bukan collapsed nutupin halaman yang lagi aktif.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const renderedGroupKeys = new Set<string>()

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn('flex items-center gap-3 border-b border-sidebar-border py-5', collapsed ? 'justify-center px-3' : 'px-5')}>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm font-bold text-sidebar-foreground">i1 CCTV</p>
            <p className="text-xs text-sidebar-foreground/60">Internal System</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Menu utama">
        {visibleItems.map((item) => {
          const group = NAV_GROUPS.find((g) => g.itemKeys.includes(item.key))

          if (group) {
            // Item ini bagian dari grup (mis. salah satu dari 5 menu
            // Servis) — cuma dirender SEKALI di posisi anggota pertamanya,
            // sebagai tombol folder yang bisa dibuka/tutup.
            if (renderedGroupKeys.has(group.key)) return null
            renderedGroupKeys.add(group.key)

            // Mode ciut: gak ada tempat buat nampilin folder+label, jadi
            // anggota grup dirender rata (flat) sebagai tombol ikon biasa
            // -- tetap bisa diklik langsung, cuma gak dikelompokkan.
            if (collapsed) {
              return (
                <div key={group.key} className="space-y-1">
                  {group.itemKeys
                    .filter((key) => visibleKeys.has(key))
                    .map((key) => {
                      const child = visibleItems.find((i) => i.key === key)
                      if (!child) return null
                      const ChildIcon = child.icon
                      const isActive = child.key === activePage
                      return (
                        <button
                          key={child.key}
                          type="button"
                          onClick={() => onNavigate(child.key)}
                          aria-current={isActive ? 'page' : undefined}
                          title={child.label}
                          className={cn(
                            'flex w-full items-center justify-center rounded-lg px-2 py-3 transition-colors',
                            isActive
                              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                              : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                          )}
                        >
                          <ChildIcon className="size-5 shrink-0" aria-hidden="true" />
                        </button>
                      )
                    })}
                </div>
              )
            }

            const isActiveInside = group.itemKeys.includes(activePage)
            const isOpen = isActiveInside || openGroups.has(group.key)
            const GroupIcon = group.icon

            return (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={isOpen}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition-colors',
                    'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )}
                >
                  <GroupIcon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="flex-1">{group.label}</span>
                  <ChevronDown
                    className={cn('size-4 shrink-0 transition-transform', isOpen && 'rotate-180')}
                    aria-hidden="true"
                  />
                </button>

                {isOpen && (
                  <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-3">
                    {group.itemKeys
                      .filter((key) => visibleKeys.has(key))
                      .map((key) => {
                        const child = visibleItems.find((i) => i.key === key)
                        if (!child) return null
                        const ChildIcon = child.icon
                        const isActive = child.key === activePage
                        return (
                          <button
                            key={child.key}
                            type="button"
                            onClick={() => onNavigate(child.key)}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                              'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                              isActive
                                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                                : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                            )}
                          >
                            <ChildIcon className="size-4 shrink-0" aria-hidden="true" />
                            <span>{child.label}</span>
                          </button>
                        )
                      })}
                  </div>
                )}
              </div>
            )
          }

          // Item biasa (bukan bagian dari grup mana pun).
          const Icon = item.icon

          // Item dengan externalUrl BUKAN halaman internal -- klik-nya
          // buka tab baru (target="_blank"), BUKAN manggil onNavigate()
          // buat ganti activePage. Dipakai buat link ke halaman statis
          // di luar routing app ini (mis. kalkulator publik i1cctv.com).
          if (item.externalUrl) {
            return (
              <a
                key={item.key}
                href={item.externalUrl}
                target="_blank"
                rel="noreferrer"
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg py-3 text-left text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-2' : 'px-3',
                  'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    <ExternalLink className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
                  </>
                )}
              </a>
            )
          }

          const isActive = item.key === activePage
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg py-3 text-left text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2' : 'px-3',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onLogout}
          title={collapsed ? 'Keluar' : undefined}
          className={cn('w-full text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground', collapsed ? 'justify-center px-0' : 'justify-start gap-3')}
        >
          <LogOut className="size-5" aria-hidden="true" />
          {!collapsed && 'Keluar'}
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
  userBranchId,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  // Ciut/buka SIDEBAR DESKTOP -- disimpan di localStorage per browser,
  // jadi pilihan user tetap sama walau reload/pindah menu. Cuma buat versi
  // desktop; drawer mobile gak punya mode ciut (SidebarContent di situ
  // dipanggil tanpa prop `collapsed`, jadi selalu full).
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem('sidebar-collapsed') === '1')
    } catch {
      // localStorage gak ada (mis. private browsing ketat) -- default buka.
    }
  }, [])
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem('sidebar-collapsed', next ? '1' : '0')
      } catch {
        // gagal simpan preferensi gapapa -- toggle tetap jalan untuk sesi ini.
      }
      return next
    })
  }

  return (
    <>
      {/* Sidebar tetap di desktop -- lebar berubah sesuai mode ciut */}
      <aside className={cn('hidden shrink-0 border-r border-sidebar-border transition-[width] duration-200 lg:block', collapsed ? 'w-16' : 'w-64')}>
        <div className="sticky top-0 flex h-dvh flex-col">
          <div className="min-h-0 flex-1">
            <SidebarContent
              activePage={activePage}
              onNavigate={onNavigate}
              onLogout={onLogout}
              userRole={userRole}
              userBranchId={userBranchId}
              collapsed={collapsed}
            />
          </div>
          {/* Tombol ciut/buka -- selalu di paling bawah, di luar area scroll menu. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Buka sidebar' : 'Ciutkan sidebar'}
            title={collapsed ? 'Buka sidebar' : 'Ciutkan sidebar'}
            className={cn(
              'flex shrink-0 items-center gap-2 border-t border-sidebar-border py-2.5 text-xs font-medium text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              collapsed ? 'justify-center px-0' : 'justify-end px-3',
            )}
          >
            {collapsed ? <ChevronRight className="size-4" aria-hidden="true" /> : (
              <>
                <ChevronLeft className="size-4" aria-hidden="true" />
                Ciutkan
              </>
            )}
          </button>
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
            userBranchId={userBranchId}
          />
        </div>
      </div>
    </>
  )
}

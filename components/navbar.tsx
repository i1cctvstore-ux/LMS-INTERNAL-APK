'use client'

import { Menu, ShieldCheck, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

type NavbarProps = {
  title: string
  userName: string
  userEmail: string
  onOpenMenu: () => void
}

export function Navbar({ title, userName, userEmail, onOpenMenu }: NavbarProps) {
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onOpenMenu}
          aria-label="Buka menu"
          className="lg:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </Button>

        {/* Logo toko — tampil di HP karena sidebar tersembunyi */}
        <div className="flex items-center gap-2 lg:hidden">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </div>
          <span className="text-base font-bold text-foreground">i1 CCTV</span>
        </div>

        {/* Judul halaman aktif — di desktop */}
        <h1 className="hidden text-lg font-semibold text-foreground lg:block">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-border bg-background py-1 pl-1 pr-2 sm:pr-3">
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="max-w-[9rem] text-left leading-tight sm:max-w-none">
          <p className="truncate text-sm font-medium text-foreground">
            {userName}
          </p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {userEmail}
          </p>
        </div>
        <ChevronDown
          className="hidden size-4 text-muted-foreground sm:block"
          aria-hidden="true"
        />
      </div>
    </header>
  )
}

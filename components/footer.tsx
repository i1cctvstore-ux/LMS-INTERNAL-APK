export function Footer() {
  return (
    <footer className="border-t border-border bg-card px-4 py-5">
      <div className="flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
        <p className="text-xs text-muted-foreground">
          {'\u00A9'} {new Date().getFullYear()} i1 CCTV. Seluruh hak cipta
          dilindungi.
        </p>
        <p className="text-xs text-muted-foreground">
          Sistem Internal Toko · v1.0.0
        </p>
      </div>
    </footer>
  )
}

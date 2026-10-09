/** Tanggal "hari ini" menurut jam perangkat (WIB), format YYYY-MM-DD. toISOString() memakai UTC sehingga dini hari WIB (00.00-07.00) salah jadi kemarin. */
export function todayLocalISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** "2026-10-09" -> "9 Oktober 2026". Kalau bukan format tanggal yang valid, dikembalikan apa adanya. */
export function formatTanggalID(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "")
  if (!m) return iso || ""
  const bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
  return `${Number(m[3])} ${bulan[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

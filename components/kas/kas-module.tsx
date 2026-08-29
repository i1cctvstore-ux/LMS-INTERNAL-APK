'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  SlidersHorizontal,
  Download,
  X,
  Pencil,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  AlertTriangle,
  Wallet,
} from 'lucide-react'
import type { Role } from '@/lib/supabase/types'
import { createClient } from '@/lib/supabase/client'
import {
  fetchKasBukuEntries,
  createKasBukuMasuk,
  createKasBukuSetor,
  updateKasBukuEntry,
  deleteKasBukuEntry,
  fetchKasKecilEntries,
  createKasKecilMasuk,
  createKasKecilKeluar,
  updateKasKecilEntry,
  deleteKasKecilEntry,
  fetchKasUmEntries,
  createKasUmMasuk,
  createKasUmKeluar,
  updateKasUmEntry,
  deleteKasUmEntry,
  type KasBukuEntry,
  type KasKecilEntry,
  type KasUmEntry,
  type KasMetode,
  type KasKecilKategori,
  type KasUmKategori,
} from '@/lib/kas/api'

// =====================================================
// Modul Kas: satu komponen dipakai untuk 3 halaman sidebar
// ("Buku Kas", "Kas Kecil", "Kas UM & Reimburse"), dibedakan lewat prop
// `section` — pola yang sama seperti ServisModule (5 menu, 1 komponen +
// prop `section`).
//
// Akses menu ini sudah dibatasi di lib/nav-config.tsx hanya untuk
// super_admin & admin. Di dalam komponen ini:
//   - super_admin: bisa lihat & pindah-pindah SEMUA cabang lewat tab,
//     dan satu-satunya yang boleh Edit/Hapus data.
//   - admin: terkunci ke cabangnya sendiri (branch_id di profil),
//     cuma bisa menambah data, tidak bisa ubah/hapus.
// =====================================================

type Branch = { id: string; name: string; active?: boolean }

type KasModuleProps = {
  section: 'buku' | 'kecil' | 'um'
  currentUserId: string
  currentUserName: string
  currentUserRole: Role
  currentUserBranchId: string | null
}

type RangeKey = 'today' | 'week' | 'month' | 'lastmonth' | 'custom'

const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Hari Ini',
  week: 'Minggu Ini',
  month: 'Bulan Ini',
  lastmonth: 'Bulan Lalu',
  custom: 'Custom',
}

const KATEGORI_LABEL: Record<KasKecilKategori, string> = {
  makanan: 'Makanan',
  material: 'Material',
  ongkir: 'Ongkir',
}

const KATEGORI_BADGE: Record<KasKecilKategori, string> = {
  makanan: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  material: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  ongkir: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
}

const KATEGORI_LABEL_UM: Record<KasUmKategori, string> = {
  uangmakan: 'Uang Makan',
  reimburse: 'Reimburse',
}

const KATEGORI_BADGE_UM: Record<KasUmKategori, string> = {
  uangmakan: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  reimburse: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
}

function rupiah(n: number) {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID')
}
function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function daysAgoISO(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function formatTgl(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Baris tampilan yang sudah dinormalisasi — dipakai bareng oleh tabel,
// kartu mobile, pencarian, sorting, dan export CSV, supaya logikanya
// tidak dobel antara section "buku" dan "kecil".
type DisplayRow = {
  id: string
  tanggal: string
  jenisLabel: string
  jenisBadgeClass: string
  arah: 'masuk' | 'keluar'
  primary: string
  secondary: string
  jumlah: number
  metodeLabel: string
  createdByName: string
  searchBlob: string
}

function toDisplayRows(
  section: 'buku' | 'kecil' | 'um',
  entries: (KasBukuEntry | KasKecilEntry | KasUmEntry)[],
): DisplayRow[] {
  if (section === 'buku') {
    return (entries as KasBukuEntry[]).map((e) => {
      const isMasuk = e.type === 'masuk'
      const isCash = e.metode === 'cash'
      const jenisLabel = isMasuk ? `Uang Masuk (${isCash ? 'Cash' : 'Transfer'})` : 'Setoran'
      const jenisBadgeClass = isMasuk
        ? isCash
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
          : 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200'
        : 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200'
      return {
        id: e.id,
        tanggal: e.tanggal,
        jenisLabel,
        jenisBadgeClass,
        arah: isMasuk ? 'masuk' : 'keluar',
        primary: isMasuk ? e.customerName || '-' : e.catatan || '-',
        secondary: isMasuk ? e.invoiceNo || '-' : isCash ? 'Serahkan Cash' : 'Transfer Bank',
        jumlah: e.jumlah,
        metodeLabel: isMasuk ? (isCash ? 'Cash' : 'Transfer') : isCash ? 'Serahkan Cash' : 'Transfer Bank',
        createdByName: e.createdByName,
        searchBlob: [e.customerName, e.invoiceNo, e.catatan, e.createdByName].filter(Boolean).join(' ').toLowerCase(),
      }
    })
  }
  if (section === 'um') {
    return (entries as KasUmEntry[]).map((e) => {
      const isMasuk = e.type === 'masuk'
      const jenisLabel = isMasuk ? 'Top Up Kas' : KATEGORI_LABEL_UM[e.kategori as KasUmKategori]
      const jenisBadgeClass = isMasuk
        ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200'
        : KATEGORI_BADGE_UM[e.kategori as KasUmKategori]
      return {
        id: e.id,
        tanggal: e.tanggal,
        jenisLabel,
        jenisBadgeClass,
        arah: isMasuk ? 'masuk' : 'keluar',
        // Kolom "primary" dipakai buat Nama Karyawan (bukan
        // customer/catatan kayak section lain) -- Top Up Kas gak punya
        // karyawan, jadi fallback ke catatan/"Top Up Kas".
        primary: isMasuk ? e.catatan || 'Top Up Kas' : e.karyawan || '-',
        secondary: isMasuk ? '' : e.keterangan || '',
        jumlah: e.jumlah,
        metodeLabel: '-',
        createdByName: e.createdByName,
        searchBlob: [e.catatan, e.karyawan, e.keterangan, e.createdByName].filter(Boolean).join(' ').toLowerCase(),
      }
    })
  }
  return (entries as KasKecilEntry[]).map((e) => {
    const isMasuk = e.type === 'masuk'
    const jenisLabel = isMasuk ? 'Setoran Owner' : KATEGORI_LABEL[e.kategori as KasKecilKategori]
    const jenisBadgeClass = isMasuk
      ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200'
      : KATEGORI_BADGE[e.kategori as KasKecilKategori]
    return {
      id: e.id,
      tanggal: e.tanggal,
      jenisLabel,
      jenisBadgeClass,
      arah: isMasuk ? 'masuk' : 'keluar',
      primary: isMasuk ? e.catatan || 'Setoran Owner' : e.keterangan || '-',
      secondary: '',
      jumlah: e.jumlah,
      metodeLabel: '-',
      createdByName: e.createdByName,
      searchBlob: [e.catatan, e.keterangan, e.createdByName].filter(Boolean).join(' ').toLowerCase(),
    }
  })
}

function inRange(tanggal: string, range: RangeKey, customFrom: string, customTo: string): boolean {
  const d = new Date(tanggal + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (range === 'today') return tanggal === todayISO()
  if (range === 'week') {
    const day = (today.getDay() + 6) % 7
    const monday = new Date(today)
    monday.setDate(today.getDate() - day)
    return d >= monday && d <= today
  }
  if (range === 'month') return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth()
  if (range === 'lastmonth') {
    const lm = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth()
  }
  if (range === 'custom') {
    if (!customFrom || !customTo) return true
    return tanggal >= customFrom && tanggal <= customTo
  }
  return true
}

// Komponen utama: 1 komponen dipakai untuk 2 halaman sidebar ("Buku Kas"
// dan "Kas Kecil"), dibedakan lewat prop `section` -- pola sama persis
// seperti ServisModule (folder dropdown di Sidebar, 5 menu 1 komponen).
export default function KasModule({
  section,
  currentUserId,
  currentUserName,
  currentUserRole,
  currentUserBranchId,
}: KasModuleProps) {
  const isBuku = section === 'buku'
  const isUm = section === 'um'
  const isSuperAdmin = currentUserRole === 'super_admin'
  const canManage = isSuperAdmin // edit & hapus cuma Super Admin
  const title = isBuku ? 'Buku Kas' : isUm ? 'Kas UM & Reimburse' : 'Kas Kecil'
  const rangeOptions: RangeKey[] = isBuku
    ? ['today', 'week', 'month', 'custom']
    : ['today', 'week', 'month', 'lastmonth', 'custom']

  const [branches, setBranches] = useState<Branch[]>([])
  const [activeBranchId, setActiveBranchId] = useState<string | null>(isSuperAdmin ? null : currentUserBranchId)
  const [loadingBranches, setLoadingBranches] = useState(true)

  const [entries, setEntries] = useState<(KasBukuEntry | KasKecilEntry | KasUmEntry)[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [range, setRange] = useState<RangeKey>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [sortKey, setSortKey] = useState<
    'tanggal' | 'jenis' | 'nama' | 'invoice' | 'masuk' | 'keluar' | 'metode' | 'kasir'
  >('tanggal')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [showAddMasuk, setShowAddMasuk] = useState(false)
  const [showAddOut, setShowAddOut] = useState(false) // Setor (buku) / Keluar (kecil)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [editingRow, setEditingRow] = useState<DisplayRow | null>(null)
  const [deletingRow, setDeletingRow] = useState<DisplayRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2400)
  }

  // ---------- Muat daftar cabang ----------
  // Query langsung ke Supabase (bukan lewat custom API route) --
  // konsisten sama pola query data lain di proyek ini. Tabel `branches`
  // memang dibaca oleh semua role yang sudah login (kena RLS biasa).
  useEffect(() => {
    let cancelled = false
    setLoadingBranches(true)
    const supabase = createClient()
    supabase
      .from('branches')
      .select('id, name, active')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setLoadError('Gagal memuat daftar cabang.')
          return
        }
        const active = (data ?? []).filter((b: Branch) => b.active !== false)
        setBranches(active)
        if (isSuperAdmin && !activeBranchId && active.length > 0) {
          setActiveBranchId(active[0].id)
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBranches(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- Muat data entries tiap kali cabang/section berubah ----------
  async function reload() {
    if (!activeBranchId) return
    setLoadingEntries(true)
    setLoadError(null)
    try {
      const data = isBuku
        ? await fetchKasBukuEntries(activeBranchId)
        : isUm
          ? await fetchKasUmEntries(activeBranchId)
          : await fetchKasKecilEntries(activeBranchId)
      setEntries(data)
    } catch (err: any) {
      setLoadError(err?.message || 'Gagal memuat data.')
    } finally {
      setLoadingEntries(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId, section])

  const activeBranch = branches.find((b) => b.id === activeBranchId) || null

  // ---------- Saldo ----------
  const saldo = useMemo(() => {
    if (isBuku) {
      const list = entries as KasBukuEntry[]
      const masuk = list.filter((e) => e.type === 'masuk' && e.metode === 'cash').reduce((s, e) => s + e.jumlah, 0)
      const setor = list.filter((e) => e.type === 'setor' && e.metode === 'cash').reduce((s, e) => s + e.jumlah, 0)
      return masuk - setor
    }
    const list = entries as KasKecilEntry[]
    const masuk = list.filter((e) => e.type === 'masuk').reduce((s, e) => s + e.jumlah, 0)
    const keluar = list.filter((e) => e.type === 'keluar').reduce((s, e) => s + e.jumlah, 0)
    return masuk - keluar
  }, [entries, isBuku])

  // ---------- Baris periode aktif ----------
  const periodEntries = useMemo(
    () => entries.filter((e) => inRange(e.tanggal, range, customFrom, customTo)),
    [entries, range, customFrom, customTo],
  )

  // ---------- Kartu ringkasan ----------
  const summaryCards = useMemo(() => {
    const label = RANGE_LABELS[range]
    if (isBuku) {
      const list = periodEntries as KasBukuEntry[]
      const cashIn = list.filter((e) => e.type === 'masuk' && e.metode === 'cash').reduce((s, e) => s + e.jumlah, 0)
      const cards = [{ label: `Uang Masuk Cash — ${label}`, value: rupiah(cashIn) }]
      if (isSuperAdmin) {
        const transferIn = list
          .filter((e) => e.type === 'masuk' && e.metode === 'transfer')
          .reduce((s, e) => s + e.jumlah, 0)
        const setor = list.filter((e) => e.type === 'setor').reduce((s, e) => s + e.jumlah, 0)
        cards.push({ label: `Uang Masuk Transfer — ${label}`, value: rupiah(transferIn) })
        cards.push({ label: `Setoran — ${label}`, value: rupiah(setor) })
      }
      return cards
    }
    if (isUm) {
      const list = periodEntries as KasUmEntry[]
      const masuk = list.filter((e) => e.type === 'masuk').reduce((s, e) => s + e.jumlah, 0)
      const uangmakan = list
        .filter((e) => e.type === 'keluar' && e.kategori === 'uangmakan')
        .reduce((s, e) => s + e.jumlah, 0)
      const reimburse = list
        .filter((e) => e.type === 'keluar' && e.kategori === 'reimburse')
        .reduce((s, e) => s + e.jumlah, 0)
      return [
        { label: `Top Up Kas — ${label}`, value: rupiah(masuk) },
        { label: `Uang Makan — ${label}`, value: rupiah(uangmakan) },
        { label: `Reimburse — ${label}`, value: rupiah(reimburse) },
      ]
    }
    const list = periodEntries as KasKecilEntry[]
    const masuk = list.filter((e) => e.type === 'masuk').reduce((s, e) => s + e.jumlah, 0)
    const makanan = list
      .filter((e) => e.type === 'keluar' && e.kategori === 'makanan')
      .reduce((s, e) => s + e.jumlah, 0)
    const material = list
      .filter((e) => e.type === 'keluar' && e.kategori === 'material')
      .reduce((s, e) => s + e.jumlah, 0)
    const ongkir = list.filter((e) => e.type === 'keluar' && e.kategori === 'ongkir').reduce((s, e) => s + e.jumlah, 0)
    return [
      { label: `Setoran Owner — ${label}`, value: rupiah(masuk) },
      { label: `Makanan — ${label}`, value: rupiah(makanan) },
      { label: `Material — ${label}`, value: rupiah(material) },
      { label: `Ongkir — ${label}`, value: rupiah(ongkir) },
    ]
  }, [periodEntries, isBuku, isUm, isSuperAdmin, range])

  // ---------- Baris tabel: filter periode + cari + sort ----------
  const displayRows = useMemo(() => {
    const rows = toDisplayRows(section, periodEntries)
    const q = searchTerm.trim().toLowerCase()
    const filtered = q ? rows.filter((r) => r.searchBlob.includes(q)) : rows
    const dir = sortDir === 'asc' ? 1 : -1
    // Sama kayak mockup: tiap kolom bisa disortir sendiri-sendiri, bukan
    // cuma Tanggal & Jumlah. "Masuk"/"Keluar" pakai -1 buat baris yang
    // bukan arah itu, biar baris kosong ("-") selalu ke bawah pas di-sort.
    const accessor = (r: DisplayRow): string | number => {
      switch (sortKey) {
        case 'jenis':
          return r.jenisLabel
        case 'nama':
          return r.primary
        case 'invoice':
          return r.secondary
        case 'masuk':
          return r.arah === 'masuk' ? r.jumlah : -1
        case 'keluar':
          return r.arah === 'keluar' ? r.jumlah : -1
        case 'metode':
          return r.metodeLabel
        case 'kasir':
          return r.createdByName
        default:
          return r.tanggal
      }
    }
    return filtered.slice().sort((a, b) => {
      const va = accessor(a)
      const vb = accessor(b)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return cmp !== 0 ? cmp * dir : 0
    })
  }, [section, periodEntries, searchTerm, sortKey, sortDir])

  function toggleSort(
    key: 'tanggal' | 'jenis' | 'nama' | 'invoice' | 'masuk' | 'keluar' | 'metode' | 'kasir',
  ) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'tanggal' || key === 'masuk' || key === 'keluar' ? 'desc' : 'asc')
    }
  }

  // ---------- Form tambah: Uang Masuk (buku) ----------
  const [mTanggal, setMTanggal] = useState(todayISO())
  const [mMetode, setMMetode] = useState<KasMetode>('cash')
  const [mCustomer, setMCustomer] = useState('')
  const [mInvoice, setMInvoice] = useState('')
  const [mJumlah, setMJumlah] = useState('')
  const [mCatatan, setMCatatan] = useState('') // dipakai untuk kas kecil "masuk"

  function openAddMasuk() {
    setMTanggal(todayISO())
    setMMetode('cash')
    setMCustomer('')
    setMInvoice('')
    setMJumlah('')
    setMCatatan('')
    setShowAddMasuk(true)
  }

  // ---------- Form tambah: Setor (buku) / Keluar (kecil) / UM-Reimburse (um) ----------
  const [sTanggal, setSTanggal] = useState(todayISO())
  const [sMetode, setSMetode] = useState<KasMetode>('cash')
  const [sCatatan, setSCatatan] = useState('')
  const [sKategori, setSKategori] = useState<KasKecilKategori>('makanan')
  const [sKategoriUm, setSKategoriUm] = useState<KasUmKategori>('uangmakan')
  const [sKaryawan, setSKaryawan] = useState('')
  const [sKeterangan, setSKeterangan] = useState('')
  const [sJumlah, setSJumlah] = useState('')

  function openAddOut() {
    setSTanggal(todayISO())
    setSMetode('cash')
    setSCatatan('')
    setSKategori('makanan')
    setSKategoriUm('uangmakan')
    setSKaryawan('')
    setSKeterangan('')
    setSJumlah('')
    setShowAddOut(true)
  }

  // ---------- Alur konfirmasi sebelum simpan ----------
  type PendingSave = { kind: 'masuk' | 'out'; summary: [string, string, boolean?][] ; warning?: string }
  const [pending, setPending] = useState<PendingSave | null>(null)

  function confirmAddMasuk() {
    const jumlah = Number(mJumlah)
    if (!mTanggal || !jumlah) {
      showToast('Lengkapi dulu tanggal dan jumlah')
      return
    }
    if (isBuku && (!mCustomer.trim() || !mInvoice.trim())) {
      showToast('Lengkapi dulu semua field')
      return
    }
    setShowAddMasuk(false)
    const rows: [string, string, boolean?][] = isBuku
      ? [
          ['Tanggal', formatTgl(mTanggal)],
          ['Metode', mMetode === 'cash' ? 'Cash' : 'Transfer'],
          ['Customer', mCustomer],
          ['No. Invoice', mInvoice],
          ['Jumlah', rupiah(jumlah), true],
        ]
      : [
          ['Tanggal', formatTgl(mTanggal)],
          ['Catatan', mCatatan || '-'],
          ['Jumlah', rupiah(jumlah), true],
        ]
    setPending({ kind: 'masuk', summary: rows })
    setShowConfirm(true)
  }

  function confirmAddOut() {
    const jumlah = Number(sJumlah)
    if (!sTanggal || !jumlah) {
      showToast('Lengkapi dulu tanggal dan jumlah')
      return
    }
    if (!isBuku && !isUm && !sKeterangan.trim()) {
      showToast('Lengkapi dulu semua field')
      return
    }
    if (isUm && !sKaryawan.trim()) {
      showToast('Lengkapi dulu nama karyawan')
      return
    }
    setShowAddOut(false)
    let warning: string | undefined
    if (isBuku && sMetode === 'cash' && jumlah > saldo) {
      warning = `Nilai setoran (${rupiah(jumlah)}) lebih besar dari saldo kas tunai saat ini (${rupiah(saldo)}). Cek lagi sebelum lanjut — tetap bisa disimpan kalau memang sudah benar.`
    }
    if (!isBuku && jumlah > saldo) {
      warning = `Nilai pengeluaran (${rupiah(jumlah)}) lebih besar dari saldo ${isUm ? 'kas UM & Reimburse' : 'kas kecil'} saat ini (${rupiah(saldo)}). Cek lagi sebelum lanjut — tetap bisa disimpan kalau memang sudah benar.`
    }
    const rows: [string, string, boolean?][] = isBuku
      ? [
          ['Tanggal', formatTgl(sTanggal)],
          ['Metode', sMetode === 'cash' ? 'Serahkan Cash' : 'Transfer Bank'],
          ['Catatan', sCatatan || '-'],
          ['Jumlah', rupiah(jumlah), true],
        ]
      : isUm
        ? [
            ['Tanggal', formatTgl(sTanggal)],
            ['Kategori', KATEGORI_LABEL_UM[sKategoriUm]],
            ['Nama Karyawan', sKaryawan],
            ['Keterangan', sKeterangan || '-'],
            ['Jumlah', rupiah(jumlah), true],
          ]
        : [
            ['Tanggal', formatTgl(sTanggal)],
            ['Kategori', KATEGORI_LABEL[sKategori]],
            ['Keterangan', sKeterangan],
            ['Jumlah', rupiah(jumlah), true],
          ]
    setPending({ kind: 'out', summary: rows, warning })
    setShowConfirm(true)
  }

  async function handleConfirmSave() {
    if (!pending || !activeBranchId) return
    setSaving(true)
    try {
      if (pending.kind === 'masuk') {
        if (isBuku) {
          await createKasBukuMasuk({
            branchId: activeBranchId,
            tanggal: mTanggal,
            metode: mMetode,
            customerName: mCustomer.trim(),
            invoiceNo: mInvoice.trim(),
            jumlah: Number(mJumlah),
            createdBy: currentUserId,
            createdByName: currentUserName,
          })
        } else if (isUm) {
          await createKasUmMasuk({
            branchId: activeBranchId,
            tanggal: mTanggal,
            catatan: mCatatan.trim(),
            jumlah: Number(mJumlah),
            createdBy: currentUserId,
            createdByName: currentUserName,
          })
        } else {
          await createKasKecilMasuk({
            branchId: activeBranchId,
            tanggal: mTanggal,
            catatan: mCatatan.trim(),
            jumlah: Number(mJumlah),
            createdBy: currentUserId,
            createdByName: currentUserName,
          })
        }
        showToast(isBuku ? 'Uang masuk tercatat' : isUm ? 'Top up kas tercatat' : 'Setoran tercatat')
      } else {
        if (isBuku) {
          await createKasBukuSetor({
            branchId: activeBranchId,
            tanggal: sTanggal,
            metode: sMetode,
            catatan: sCatatan.trim(),
            jumlah: Number(sJumlah),
            createdBy: currentUserId,
            createdByName: currentUserName,
          })
          showToast('Setoran tercatat')
        } else if (isUm) {
          await createKasUmKeluar({
            branchId: activeBranchId,
            tanggal: sTanggal,
            kategori: sKategoriUm,
            karyawan: sKaryawan.trim(),
            keterangan: sKeterangan.trim(),
            jumlah: Number(sJumlah),
            createdBy: currentUserId,
            createdByName: currentUserName,
          })
          showToast('Data tercatat')
        } else {
          await createKasKecilKeluar({
            branchId: activeBranchId,
            tanggal: sTanggal,
            kategori: sKategori,
            keterangan: sKeterangan.trim(),
            jumlah: Number(sJumlah),
            createdBy: currentUserId,
            createdByName: currentUserName,
          })
          showToast('Pengeluaran tercatat')
        }
      }
      setShowConfirm(false)
      setPending(null)
      await reload()
    } catch (err: any) {
      showToast(err?.message || 'Gagal menyimpan data')
    } finally {
      setSaving(false)
    }
  }

  // ---------- Edit (Super Admin) ----------
  const [eTanggal, setETanggal] = useState('')
  const [eMetode, setEMetode] = useState<KasMetode>('cash')
  const [eCustomer, setECustomer] = useState('')
  const [eInvoice, setEInvoice] = useState('')
  const [eCatatan, setECatatan] = useState('')
  const [eKategori, setEKategori] = useState<KasKecilKategori>('makanan')
  const [eKategoriUm, setEKategoriUm] = useState<KasUmKategori>('uangmakan')
  const [eKaryawan, setEKaryawan] = useState('')
  const [eKeterangan, setEKeterangan] = useState('')
  const [eJumlah, setEJumlah] = useState('')

  function openEdit(row: DisplayRow) {
    const raw = entries.find((e) => e.id === row.id)
    if (!raw) return
    setEditingRow(row)
    setETanggal(raw.tanggal)
    setEJumlah(String(raw.jumlah))
    if (isBuku) {
      const b = raw as KasBukuEntry
      setEMetode(b.metode)
      setECustomer(b.customerName || '')
      setEInvoice(b.invoiceNo || '')
      setECatatan(b.catatan || '')
    } else if (isUm) {
      const u = raw as KasUmEntry
      setECatatan(u.catatan || '')
      setEKategoriUm((u.kategori as KasUmKategori) || 'uangmakan')
      setEKaryawan(u.karyawan || '')
      setEKeterangan(u.keterangan || '')
    } else {
      const k = raw as KasKecilEntry
      setECatatan(k.catatan || '')
      setEKategori((k.kategori as KasKecilKategori) || 'makanan')
      setEKeterangan(k.keterangan || '')
    }
  }

  async function handleSaveEdit() {
    if (!editingRow) return
    const raw = entries.find((e) => e.id === editingRow.id)
    if (!raw) return
    setSaving(true)
    try {
      const jumlah = Number(eJumlah)
      if (isBuku) {
        const b = raw as KasBukuEntry
        await updateKasBukuEntry(b.id, {
          tanggal: eTanggal,
          metode: eMetode,
          jumlah,
          ...(b.type === 'masuk'
            ? { customerName: eCustomer.trim(), invoiceNo: eInvoice.trim() }
            : { catatan: eCatatan.trim() }),
        })
      } else if (isUm) {
        const u = raw as KasUmEntry
        await updateKasUmEntry(u.id, {
          tanggal: eTanggal,
          jumlah,
          ...(u.type === 'masuk'
            ? { catatan: eCatatan.trim() }
            : { kategori: eKategoriUm, karyawan: eKaryawan.trim(), keterangan: eKeterangan.trim() }),
        })
      } else {
        const k = raw as KasKecilEntry
        await updateKasKecilEntry(k.id, {
          tanggal: eTanggal,
          jumlah,
          ...(k.type === 'masuk'
            ? { catatan: eCatatan.trim() }
            : { kategori: eKategori, keterangan: eKeterangan.trim() }),
        })
      }
      showToast('Perubahan disimpan')
      setEditingRow(null)
      await reload()
    } catch (err: any) {
      showToast(err?.message || 'Gagal menyimpan perubahan')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingRow) return
    setSaving(true)
    try {
      if (isBuku) await deleteKasBukuEntry(deletingRow.id)
      else if (isUm) await deleteKasUmEntry(deletingRow.id)
      else await deleteKasKecilEntry(deletingRow.id)
      showToast('Data dihapus')
      setDeletingRow(null)
      await reload()
    } catch (err: any) {
      showToast(err?.message || 'Gagal menghapus data')
    } finally {
      setSaving(false)
    }
  }

  // ---------- Export CSV ----------
  function exportCsv() {
    const rows = displayRows
    const header = isBuku
      ? ['Tanggal', 'Jenis', 'Customer/Catatan', 'No Invoice', 'Uang Masuk', 'Uang Keluar', 'Metode', 'Diinput Oleh']
      : isUm
        ? ['Tanggal', 'Jenis', 'Nama Karyawan', 'Keterangan', 'Uang Masuk', 'Uang Keluar', 'Diinput Oleh']
        : ['Tanggal', 'Jenis', 'Keterangan', 'Masuk', 'Keluar', 'Diinput Oleh']
    const body = rows.map((r) =>
      isBuku
        ? [
            r.tanggal,
            r.jenisLabel,
            r.primary,
            r.secondary,
            r.arah === 'masuk' ? r.jumlah : '',
            r.arah === 'keluar' ? r.jumlah : '',
            r.metodeLabel,
            r.createdByName,
          ]
        : isUm
          ? [
              r.tanggal,
              r.jenisLabel,
              r.primary,
              r.secondary,
              r.arah === 'masuk' ? r.jumlah : '',
              r.arah === 'keluar' ? r.jumlah : '',
              r.createdByName,
            ]
          : [
              r.tanggal,
              r.jenisLabel,
              r.primary,
              r.arah === 'masuk' ? r.jumlah : '',
              r.arah === 'keluar' ? r.jumlah : '',
              r.createdByName,
            ],
    )
    const esc = (v: any) => `"${String(v).replace(/"/g, '""')}"`
    const csv = [header, ...body].map((r) => r.map(esc).join(',')).join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${isBuku ? 'buku-kas' : isUm ? 'kas-um-reimburse' : 'kas-kecil'}-${activeBranch?.name ?? 'cabang'}-${range}-${todayISO()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setShowExport(false)
    showToast('CSV berhasil diunduh')
  }

  function exportPdf() {
    setShowExport(false)
    setTimeout(() => window.print(), 150)
  }

  // ---------- Render ----------
  if (loadingBranches) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Memuat data cabang…
      </div>
    )
  }

  if (loadError && branches.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-center">
        <p className="max-w-xs text-sm text-destructive">{loadError}</p>
      </div>
    )
  }

  if (!activeBranchId) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-center">
        <p className="max-w-xs text-sm text-muted-foreground">
          Akun Anda belum di-assign ke cabang mana pun. Hubungi Super Admin dulu sebelum bisa memakai modul {title}.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl p-4 pb-16 sm:p-6 print:p-0">
      {/* Header */}
      <header className="mb-4 print:hidden">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {isSuperAdmin ? 'Super Admin (Admin Pusat)' : `Admin · ${activeBranch?.name ?? ''}`}
        </p>
      </header>

      {/* Tab cabang — hanya Super Admin */}
      {isSuperAdmin && branches.length > 0 && (
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-muted p-1 print:hidden">
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveBranchId(b.id)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                b.id === activeBranchId
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Saldo card */}
      <div className="mb-4 rounded-xl border bg-card p-5">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Wallet className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Saldo {isBuku ? 'Kas' : isUm ? 'Kas UM & Reimburse' : 'Kas Kecil'}
            </h2>
            <p className="text-sm text-muted-foreground">
              Dihitung dari semua waktu — mewakili kas fisik yang ada sekarang
            </p>
          </div>
        </div>
        <div className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{rupiah(saldo)}</div>
      </div>

      {/* Tombol tambah */}
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        {isBuku ? (
          <>
            <button
              type="button"
              onClick={openAddMasuk}
              className="inline-flex min-w-[150px] flex-1 items-center justify-center gap-1.5 rounded-full bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700"
            >
              <Plus className="size-4" /> Tambah Uang Masuk
            </button>
            <button
              type="button"
              onClick={openAddOut}
              className="inline-flex min-w-[150px] flex-1 items-center justify-center gap-1.5 rounded-full bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800"
            >
              <ArrowUpRight className="size-4" /> Setor Uang
            </button>
          </>
        ) : isUm ? (
          <>
            <button
              type="button"
              onClick={openAddOut}
              className="inline-flex min-w-[150px] flex-1 items-center justify-center gap-1.5 rounded-full bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700"
            >
              <span className="text-base leading-none">−</span> Catat UM / Reimburse
            </button>
            <button
              type="button"
              onClick={openAddMasuk}
              className="inline-flex min-w-[150px] flex-1 items-center justify-center gap-1.5 rounded-full bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800"
            >
              <ArrowDownLeft className="size-4" /> Top Up Kas
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={openAddOut}
              className="inline-flex min-w-[150px] flex-1 items-center justify-center gap-1.5 rounded-full bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700"
            >
              <span className="text-base leading-none">−</span> Catat Pengeluaran
            </button>
            <button
              type="button"
              onClick={openAddMasuk}
              className="inline-flex min-w-[150px] flex-1 items-center justify-center gap-1.5 rounded-full bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800"
            >
              <ArrowDownLeft className="size-4" /> Setor dari Owner
            </button>
          </>
        )}
      </div>

      {/* Ringkasan periode */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 print:hidden">
        {summaryCards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-3.5">
            <div className="mb-1 text-xs text-muted-foreground">{c.label}</div>
            <div className="text-lg font-bold text-foreground">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Search + filter + export */}
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border bg-background px-3.5 py-2.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              isBuku ? 'Cari invoice, customer, penyetor...' : isUm ? 'Cari nama karyawan, keterangan...' : 'Cari keterangan, catatan...'
            }
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilter(true)}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border bg-background px-4 py-2.5 text-sm font-semibold hover:bg-muted"
        >
          <SlidersHorizontal className="size-4" /> {RANGE_LABELS[range]}
        </button>
        <button
          type="button"
          onClick={() => setShowExport(true)}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border bg-background px-4 py-2.5 text-sm font-semibold hover:bg-muted"
        >
          <Download className="size-4" /> Export
        </button>
      </div>

      {loadError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="size-4 shrink-0" /> {loadError}
        </div>
      )}

      {/* Tabel / kartu */}
      <div className="overflow-hidden rounded-xl border bg-card">
        {loadingEntries ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Memuat data…
          </div>
        ) : displayRows.length === 0 ? (
          <div className="py-14 text-center text-sm text-muted-foreground">Tidak ada data di periode ini.</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <SortableTh label="Tanggal" active={sortKey === 'tanggal'} dir={sortDir} onClick={() => toggleSort('tanggal')} />
                    <SortableTh label="Jenis" active={sortKey === 'jenis'} dir={sortDir} onClick={() => toggleSort('jenis')} />
                    <SortableTh
                      label={isBuku ? 'Customer / Catatan' : isUm ? 'Nama Karyawan' : 'Keterangan'}
                      active={sortKey === 'nama'}
                      dir={sortDir}
                      onClick={() => toggleSort('nama')}
                    />
                    {(isBuku || isUm) && (
                      <SortableTh
                        label={isBuku ? 'No Invoice' : 'Keterangan'}
                        active={sortKey === 'invoice'}
                        dir={sortDir}
                        onClick={() => toggleSort('invoice')}
                      />
                    )}
                    <SortableTh label="Uang Masuk" active={sortKey === 'masuk'} dir={sortDir} onClick={() => toggleSort('masuk')} numeric />
                    <SortableTh label="Uang Keluar" active={sortKey === 'keluar'} dir={sortDir} onClick={() => toggleSort('keluar')} numeric />
                    {isBuku && (
                      <SortableTh label="Metode" active={sortKey === 'metode'} dir={sortDir} onClick={() => toggleSort('metode')} />
                    )}
                    <SortableTh label="Diinput Oleh" active={sortKey === 'kasir'} dir={sortDir} onClick={() => toggleSort('kasir')} />
                    {canManage && <th className="whitespace-nowrap px-3.5 py-2.5 text-left font-medium">Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3.5 py-3">{formatTgl(r.tanggal)}</td>
                      <td className="whitespace-nowrap px-3.5 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.jenisBadgeClass}`}>
                          {r.jenisLabel}
                        </span>
                      </td>
                      <td className="px-3.5 py-3">{r.primary}</td>
                      {(isBuku || isUm) && <td className="whitespace-nowrap px-3.5 py-3">{r.secondary || '-'}</td>}
                      <td className="whitespace-nowrap px-3.5 py-3 text-right font-semibold tabular-nums text-emerald-700">
                        {r.arah === 'masuk' ? rupiah(r.jumlah) : '-'}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3 text-right font-semibold tabular-nums text-blue-700">
                        {r.arah === 'keluar' ? rupiah(r.jumlah) : '-'}
                      </td>
                      {isBuku && <td className="whitespace-nowrap px-3.5 py-3">{r.metodeLabel}</td>}
                      <td className="whitespace-nowrap px-3.5 py-3">{r.createdByName}</td>
                      {canManage && (
                        <td className="whitespace-nowrap px-3.5 py-3">
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEdit(r)}
                              className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                            >
                              <Pencil className="size-3.5" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingRow(r)}
                              className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              <Trash2 className="size-3.5" /> Hapus
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y md:hidden">
              {displayRows.map((r) => (
                <div key={r.id} className="p-3.5">
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-foreground">{r.primary}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.secondary ? `${r.secondary} · ` : ''}
                        {formatTgl(r.tanggal)}
                      </div>
                    </div>
                    <div
                      className={`shrink-0 font-bold tabular-nums ${r.arah === 'masuk' ? 'text-emerald-700' : 'text-blue-700'}`}
                    >
                      {r.arah === 'masuk' ? '+ ' : '− '}
                      {rupiah(r.jumlah)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${r.jenisBadgeClass}`}>
                      {r.jenisLabel}
                    </span>
                    · Diinput oleh {r.createdByName}
                  </div>
                  {canManage && (
                    <div className="mt-2 flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700"
                      >
                        <Pencil className="size-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingRow(r)}
                        className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700"
                      >
                        <Trash2 className="size-3.5" /> Hapus
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ---------------- MODALS ---------------- */}

      {/* Modal: Uang Masuk (buku) / Setor dari Owner (kecil) */}
      <Modal
        open={showAddMasuk}
        onClose={() => setShowAddMasuk(false)}
        title={isBuku ? 'Catat Uang Masuk' : isUm ? 'Top Up Kas' : 'Setor dari Owner'}
      >
        <p className="mb-4 text-xs text-muted-foreground">
          {isBuku
            ? 'Input manual, tidak tersambung otomatis ke Accurate — buat cross-check nanti.'
            : isUm
              ? 'Uang masuk ke kas UM & Reimburse, biasanya dari owner/kas pusat.'
              : 'Uang masuk ke kas kecil hanya dari setoran owner.'}
        </p>
        <Field label="Tanggal">
          <input type="date" value={mTanggal} onChange={(e) => setMTanggal(e.target.value)} className={inputCls} />
        </Field>
        {isBuku && (
          <Field label="Metode">
            <select value={mMetode} onChange={(e) => setMMetode(e.target.value as KasMetode)} className={inputCls}>
              <option value="cash">Cash</option>
              <option value="transfer">Transfer</option>
            </select>
          </Field>
        )}
        {isBuku ? (
          <>
            <Field label="Nama Customer">
              <input
                type="text"
                value={mCustomer}
                onChange={(e) => setMCustomer(e.target.value)}
                placeholder="cth. Toko Sinar Jaya"
                className={inputCls}
              />
            </Field>
            <Field label="No. Invoice">
              <input
                type="text"
                value={mInvoice}
                onChange={(e) => setMInvoice(e.target.value)}
                placeholder="cth. INV-0231"
                className={inputCls}
              />
            </Field>
          </>
        ) : (
          <Field label="Catatan (opsional)">
            <input
              type="text"
              value={mCatatan}
              onChange={(e) => setMCatatan(e.target.value)}
              placeholder="cth. Setoran awal bulan"
              className={inputCls}
            />
          </Field>
        )}
        <Field label="Jumlah (Rp)">
          <input type="number" value={mJumlah} onChange={(e) => setMJumlah(e.target.value)} placeholder="0" className={inputCls} />
        </Field>
        <ModalActions onCancel={() => setShowAddMasuk(false)} onSubmit={confirmAddMasuk} submitLabel="Simpan" />
      </Modal>

      {/* Modal: Setor Uang (buku) / Catat Pengeluaran (kecil) / UM & Reimburse (um) */}
      <Modal
        open={showAddOut}
        onClose={() => setShowAddOut(false)}
        title={isBuku ? 'Setor Uang' : isUm ? 'Catat UM / Reimburse' : 'Catat Pengeluaran'}
      >
        <p className="mb-4 text-xs text-muted-foreground">
          {isBuku
            ? 'Setor kas tunai yang terkumpul — hari ini atau akumulasi beberapa hari.'
            : 'Input manual, tidak tersambung otomatis ke Accurate — buat cross-check nanti.'}
        </p>
        <Field label="Tanggal">
          <input type="date" value={sTanggal} onChange={(e) => setSTanggal(e.target.value)} className={inputCls} />
        </Field>
        {!isBuku && !isUm && (
          <Field label="Kategori">
            <select value={sKategori} onChange={(e) => setSKategori(e.target.value as KasKecilKategori)} className={inputCls}>
              <option value="makanan">Makanan</option>
              <option value="material">Material</option>
              <option value="ongkir">Ongkir</option>
            </select>
          </Field>
        )}
        {isUm && (
          <Field label="Kategori">
            <select value={sKategoriUm} onChange={(e) => setSKategoriUm(e.target.value as KasUmKategori)} className={inputCls}>
              <option value="uangmakan">Uang Makan</option>
              <option value="reimburse">Reimburse</option>
            </select>
          </Field>
        )}
        {isUm && (
          <Field label="Nama Karyawan">
            <input
              type="text"
              value={sKaryawan}
              onChange={(e) => setSKaryawan(e.target.value)}
              placeholder="cth. Febri"
              className={inputCls}
            />
          </Field>
        )}
        {!isBuku && (
          <Field label={isUm ? 'Keterangan (opsional)' : 'Keterangan'}>
            <input
              type="text"
              value={sKeterangan}
              onChange={(e) => setSKeterangan(e.target.value)}
              placeholder={isUm ? 'cth. Parkir + uang tambahan' : 'cth. Galon + Aqua gelas 3 dus'}
              className={inputCls}
            />
          </Field>
        )}
        <Field label="Jumlah (Rp)">
          <input type="number" value={sJumlah} onChange={(e) => setSJumlah(e.target.value)} placeholder="0" className={inputCls} />
        </Field>
        {isBuku && (
          <Field label="Metode">
            <select value={sMetode} onChange={(e) => setSMetode(e.target.value as KasMetode)} className={inputCls}>
              <option value="cash">Serahkan Cash</option>
              <option value="transfer">Transfer Bank</option>
            </select>
          </Field>
        )}
        {isBuku && (
          <Field label="Catatan (opsional)">
            <input
              type="text"
              value={sCatatan}
              onChange={(e) => setSCatatan(e.target.value)}
              placeholder="cth. dipindah ke kas kecil"
              className={inputCls}
            />
          </Field>
        )}
        <ModalActions onCancel={() => setShowAddOut(false)} onSubmit={confirmAddOut} submitLabel="Simpan" />
      </Modal>

      {/* Modal: Konfirmasi */}
      <Modal
        open={showConfirm}
        onClose={() => {
          setShowConfirm(false)
          if (pending?.kind === 'masuk') setShowAddMasuk(true)
          else if (pending?.kind === 'out') setShowAddOut(true)
        }}
        title={
          pending?.kind === 'masuk'
            ? isBuku
              ? 'Konfirmasi Uang Masuk'
              : isUm
                ? 'Konfirmasi Top Up Kas'
                : 'Konfirmasi Setoran'
            : isBuku
              ? 'Konfirmasi Setoran'
              : isUm
                ? 'Konfirmasi UM / Reimburse'
                : 'Konfirmasi Pengeluaran'
        }
      >
        <p className="mb-4 text-xs text-muted-foreground">
          Cek lagi datanya sebelum disimpan — setelah tersimpan, hanya Super Admin yang bisa mengubah atau menghapus.
        </p>
        <div className="mb-4 rounded-lg border bg-muted/30 px-3.5 divide-y">
          {pending?.summary.map(([k, v, big]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="text-muted-foreground">{k}</span>
              <span className={`text-right font-semibold ${big ? 'text-lg text-indigo-600' : ''}`}>{v}</span>
            </div>
          ))}
        </div>
        {pending?.warning && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
            ⚠️ {pending.warning}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setShowConfirm(false)
              if (pending?.kind === 'masuk') setShowAddMasuk(true)
              else setShowAddOut(true)
            }}
            className="rounded-lg bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            ← Periksa Lagi
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleConfirmSave}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="size-4 animate-spin" />} Ya, Simpan
          </button>
        </div>
      </Modal>

      {/* Modal: Edit (Super Admin) */}
      <Modal
        open={!!editingRow}
        onClose={() => setEditingRow(null)}
        title={isBuku ? 'Edit Data Buku Kas' : isUm ? 'Edit Data Kas UM & Reimburse' : 'Edit Data Kas Kecil'}
      >
        {editingRow &&
          (() => {
            const raw = entries.find((e) => e.id === editingRow.id)
            if (!raw) return null
            const isMasukType = raw.type === 'masuk'
            return (
              <>
                <Field label="Tanggal">
                  <input type="date" value={eTanggal} onChange={(e) => setETanggal(e.target.value)} className={inputCls} />
                </Field>
                {isBuku && (
                  <Field label="Metode">
                    <select value={eMetode} onChange={(e) => setEMetode(e.target.value as KasMetode)} className={inputCls}>
                      {isMasukType ? (
                        <>
                          <option value="cash">Cash</option>
                          <option value="transfer">Transfer</option>
                        </>
                      ) : (
                        <>
                          <option value="cash">Serahkan Cash</option>
                          <option value="transfer">Transfer Bank</option>
                        </>
                      )}
                    </select>
                  </Field>
                )}
                {isBuku && isMasukType && (
                  <>
                    <Field label="Nama Customer">
                      <input type="text" value={eCustomer} onChange={(e) => setECustomer(e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="No. Invoice">
                      <input type="text" value={eInvoice} onChange={(e) => setEInvoice(e.target.value)} className={inputCls} />
                    </Field>
                  </>
                )}
                {isBuku && !isMasukType && (
                  <Field label="Catatan">
                    <input type="text" value={eCatatan} onChange={(e) => setECatatan(e.target.value)} className={inputCls} />
                  </Field>
                )}
                {!isBuku && isMasukType && (
                  <Field label="Catatan">
                    <input type="text" value={eCatatan} onChange={(e) => setECatatan(e.target.value)} className={inputCls} />
                  </Field>
                )}
                {isUm && !isMasukType && (
                  <>
                    <Field label="Kategori">
                      <select value={eKategoriUm} onChange={(e) => setEKategoriUm(e.target.value as KasUmKategori)} className={inputCls}>
                        <option value="uangmakan">Uang Makan</option>
                        <option value="reimburse">Reimburse</option>
                      </select>
                    </Field>
                    <Field label="Nama Karyawan">
                      <input type="text" value={eKaryawan} onChange={(e) => setEKaryawan(e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Keterangan (opsional)">
                      <input type="text" value={eKeterangan} onChange={(e) => setEKeterangan(e.target.value)} className={inputCls} />
                    </Field>
                  </>
                )}
                {!isBuku && !isUm && !isMasukType && (
                  <>
                    <Field label="Kategori">
                      <select value={eKategori} onChange={(e) => setEKategori(e.target.value as KasKecilKategori)} className={inputCls}>
                        <option value="makanan">Makanan</option>
                        <option value="material">Material</option>
                        <option value="ongkir">Ongkir</option>
                      </select>
                    </Field>
                    <Field label="Keterangan">
                      <input type="text" value={eKeterangan} onChange={(e) => setEKeterangan(e.target.value)} className={inputCls} />
                    </Field>
                  </>
                )}
                <Field label="Jumlah (Rp)">
                  <input type="number" value={eJumlah} onChange={(e) => setEJumlah(e.target.value)} className={inputCls} />
                </Field>
                <ModalActions
                  onCancel={() => setEditingRow(null)}
                  onSubmit={handleSaveEdit}
                  submitLabel="Simpan Perubahan"
                  loading={saving}
                />
              </>
            )
          })()}
      </Modal>

      {/* Modal: Hapus */}
      <Modal open={!!deletingRow} onClose={() => setDeletingRow(null)} title="Hapus Data?">
        <p className="mb-5 text-sm text-muted-foreground">
          Hapus &quot;{deletingRow?.primary}&quot;? Data yang dihapus tidak bisa dikembalikan.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeletingRow(null)}
            className="rounded-lg bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="size-4 animate-spin" />} Hapus
          </button>
        </div>
      </Modal>

      {/* Modal: Filter periode */}
      <Modal open={showFilter} onClose={() => setShowFilter(false)} title="Pilih Periode">
        <div className="mb-4 flex flex-col gap-2">
          {rangeOptions.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-lg border px-4 py-3 text-left text-sm font-medium ${
                range === r ? 'border-indigo-600 bg-indigo-50 font-bold text-indigo-700' : 'hover:bg-muted'
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="mb-4 flex flex-col gap-3">
            <Field label="Dari Tanggal">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Sampai Tanggal">
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={inputCls} />
            </Field>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowFilter(false)}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Terapkan
        </button>
      </Modal>

      {/* Modal: Export */}
      <Modal open={showExport} onClose={() => setShowExport(false)} title="Export Data">
        <p className="mb-4 text-xs text-muted-foreground">
          Export data sesuai periode & pencarian yang lagi aktif — buat cross-check manual ke Accurate.
        </p>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={exportCsv} className="rounded-lg border px-4 py-3 text-left text-sm font-medium hover:bg-muted">
            📊 Export ke Excel (CSV)
          </button>
          <button type="button" onClick={exportPdf} className="rounded-lg border px-4 py-3 text-left text-sm font-medium hover:bg-muted">
            🖨️ Cetak / Simpan sebagai PDF
          </button>
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

// ---------------- Sub-komponen kecil ----------------

const inputCls =
  'w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3.5 flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function ModalActions({
  onCancel,
  onSubmit,
  submitLabel,
  loading,
}: {
  onCancel: () => void
  onSubmit: () => void
  submitLabel: string
  loading?: boolean
}) {
  return (
    <div className="mt-1 flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="rounded-lg bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">
        Batal
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={onSubmit}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {loading && <Loader2 className="size-4 animate-spin" />} {submitLabel}
      </button>
    </div>
  )
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
  numeric,
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
  numeric?: boolean
}) {
  const Icon = active ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none whitespace-nowrap px-3.5 py-2.5 font-medium hover:text-foreground ${
        numeric ? 'text-right' : 'text-left'
      } ${active ? 'text-foreground' : ''}`}
    >
      <span className={`inline-flex items-center gap-1 ${numeric ? 'flex-row-reverse' : ''}`}>
        {label}
        <Icon className="size-3.5 opacity-60" />
      </span>
    </th>
  )
}

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4 print:hidden" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-background p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-full bg-muted p-1.5 text-muted-foreground hover:bg-muted/70">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Search, RefreshCw, Clock, CheckCircle2, XCircle, Loader2, Upload, X, PackageSearch,
  ChevronUp, ChevronDown, ChevronsUpDown, Smartphone, Monitor, FileSpreadsheet, Zap, Plus, SlidersHorizontal, RotateCcw, Check,
} from 'lucide-react'
import {
  loadAllBranches,
  loadStockMatrix,
  loadLastSyncFreshness,
  loadSyncLogAll,
  loadSupplierUploadLog,
  stockSourceForBranch,
  triggerZohoSync,
  triggerZohoSyncAll,
  triggerAccurateSync,
  triggerAccurateSyncAll,
  triggerAccurateSoloKonsi,
  searchSupplierStock,
  loadAllSuppliers,
  addSupplierQuick,
  uploadSupplierStockFile,
  resolveSupplierRows,
  buildSupplierStockRows,
  searchProductsForMapping,
  saveSupplierSkuMapping,
  bulkCreateProductsAndMap,
  normalizeSku,
  type BranchOption,
  type StockMatrixData,
  type SyncLogRow,
  type UploadLogRow,
  type SupplierStockProductResult,
  type SupplierOption,
  type ResolveResult,
  type ResolvedSupplierRow,
  type UnmappedSupplierRow,
  type ProductSearchResult,
  type FinalSupplierStockRow,
} from '@/lib/stok/api'
import {
  scanSupplierStockExcel,
  extractSupplierStockRows,
  type ScanResult,
  type QtyColumnCandidate,
  type ParsedSupplierRow,
  type GudangColumnChoice,
} from '@/lib/stok/parse-supplier-file'
import { TransferStokButton } from './transfer-stok-modal'
import { loadTransferBalanceMatrix } from '@/lib/stok/transfer-api'

type StokModuleProps = {
  currentUserRole: string
  currentUserBranchId: string | null
}

// =====================================================
// 9 "SUMBER" STOK CABANG — redesign sesuai mockup cek-stok__3_.html.
// Tiap sumber dipetakan ke salah satu dari 3 data yang SUDAH dimuat
// oleh StokCabangMatrix (matrix.physical/held, transferMatrix ="-K",
// soloTransferMatrix ="-Solo-K"), TIDAK ada tabel/kolom baru:
//   - 'main'          : product_stock fisik cabang itu dikurangi held servis
//                       (persis kolom utama yang sudah ada sekarang).
//   - 'own'           : transferMatrix (transfer manual antar cabang +
//                       item "(K)" dari akun Accurate cabang itu sendiri).
//   - 'solo'          : soloTransferMatrix (konsinyasi yang dititipkan
//                       lewat database Accurate Solo yang multi-gudang).
//   - 'own_plus_solo' : own + solo digabung jadi SATU kolom — dipakai
//                       buat Bali & Purwokerto (gak punya akun Accurate
//                       sendiri, jadi transfer manual + titipan Solo
//                       digabung jadi 1 angka "-K" nya, sesuai keputusan
//                       user 2026-08-11).
//
// branchId di-hardcode by UUID (pola yang sama dipakai di seluruh
// lib/stok/*.ts — BRANCH_STOCK_SOURCE, ZOHO_ORG_BRANCH_MAP, dst) karena
// nama cabang di tabel `branches` gak konsisten/rapi.
// =====================================================

const BR_JAKARTA = '5ad7239f-a7dd-47be-9ba2-c5667a3f76b2'
const BR_SOLO = 'ff24cbd3-f11a-4f12-b658-88ff40b1a8e3'
const BR_BALI = '9b4c7834-2e20-4416-8163-2faff97294c0'
const BR_PWT = '4c97b2cb-cf88-4e13-84c0-2f2cb8d9b612'

type SourceKind = 'main' | 'own' | 'solo' | 'own_plus_solo'
type CabangSource = {
  code: string
  label: string
  group: string
  branchId: string
  kind: SourceKind
  /** true = TIDAK dihitung ke Total kota maupun Total keseluruhan, cuma buat cross-check. */
  excludeTotal: boolean
}

const CABANG_SOURCES: CabangSource[] = [
  { code: 'jkt', label: 'JKT', group: 'Jakarta', branchId: BR_JAKARTA, kind: 'main', excludeTotal: false },
  { code: 'jkt_k', label: 'JKT-K', group: 'Jakarta', branchId: BR_JAKARTA, kind: 'own', excludeTotal: false },
  { code: 'jkt_k_solo', label: 'JKT-K-SOLO', group: 'Jakarta', branchId: BR_JAKARTA, kind: 'solo', excludeTotal: true },
  { code: 'solo_z', label: 'SOLO-Z', group: 'Solo', branchId: BR_SOLO, kind: 'main', excludeTotal: false },
  { code: 'solo_cv', label: 'SOLO-CV', group: 'Solo', branchId: BR_SOLO, kind: 'own', excludeTotal: false },
  { code: 'bali_z', label: 'BALI-Z', group: 'Bali', branchId: BR_BALI, kind: 'main', excludeTotal: false },
  { code: 'bali_k', label: 'BALI-K', group: 'Bali', branchId: BR_BALI, kind: 'own_plus_solo', excludeTotal: false },
  { code: 'pwt', label: 'PWT', group: 'Purwokerto', branchId: BR_PWT, kind: 'main', excludeTotal: false },
  { code: 'pwt_k', label: 'PWT-K', group: 'Purwokerto', branchId: BR_PWT, kind: 'own_plus_solo', excludeTotal: false },
]

const CITY_GROUPS = ['Jakarta', 'Solo', 'Bali', 'Purwokerto'] as const
const CITY_SHORT: Record<string, string> = { Jakarta: 'JKT', Solo: 'SOLO', Bali: 'BALI', Purwokerto: 'PWT' }

function sourcesInGroup(group: string): CabangSource[] {
  return CABANG_SOURCES.filter((s) => s.group === group)
}

const inputCls =
  'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400'
const btnPrimaryCls = 'rounded-full bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-40'
const btnSecondaryCls = 'rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-medium'

function fmtDateTime(iso: string | null) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtRelative(iso: string | null) {
  if (!iso) return null
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'baru saja'
  if (min < 60) return `${min} menit lalu`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} jam lalu`
  const day = Math.floor(hr / 24)
  return `${day} hari lalu`
}

function SyncStatusBadge({ status }: { status: SyncLogRow['status'] }) {
  if (status === 'success')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
        <CheckCircle2 size={11} /> Sukses
      </span>
    )
  if (status === 'error')
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <XCircle size={11} /> Gagal
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      <Loader2 size={11} className="animate-spin" /> Berjalan
    </span>
  )
}

// ---------- Riwayat: sync otomatis lintas cabang + upload Stok Supplier ----------
type CombinedHistoryEntry =
  | { type: 'sync'; at: string; data: SyncLogRow }
  | { type: 'upload'; at: string; data: UploadLogRow }

function RiwayatModal({
  syncLogs,
  uploadLogs,
  onClose,
}: {
  syncLogs: SyncLogRow[]
  uploadLogs: UploadLogRow[]
  onClose: () => void
}) {
  // Riwayat Stok Cabang (sync Zoho/Accurate) dan Riwayat Stok Supplier
  // (upload manual) sengaja DIPISAH jadi 2 tab -- sama kayak Stok Cabang
  // & Stok Supplier di halaman utama yang emang udah dipisah, biar
  // riwayatnya juga nggak kecampur.
  const [historyTab, setHistoryTab] = useState<'cabang' | 'supplier'>('cabang')

  const cabangEntries: CombinedHistoryEntry[] = [...syncLogs]
    .map((d) => ({ type: 'sync' as const, at: d.startedAt, data: d }))
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
  const supplierEntries: CombinedHistoryEntry[] = [...uploadLogs]
    .map((d) => ({ type: 'upload' as const, at: d.uploadedAt, data: d }))
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
  const combined = historyTab === 'cabang' ? cabangEntries : supplierEntries

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-start sm:items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Riwayat Stok</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pt-4 flex gap-2">
          <button
            onClick={() => setHistoryTab('cabang')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${historyTab === 'cabang' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Stok Cabang
          </button>
          <button
            onClick={() => setHistoryTab('supplier')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${historyTab === 'supplier' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Stok Supplier
          </button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-2">
          {combined.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Belum ada riwayat.</p>}
          {combined.map((entry) => {
            if (entry.type === 'sync') {
              const log = entry.data
              return (
                <div key={`sync-${log.id}`} className="border border-slate-200 rounded-2xl p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-700 capitalize">Sync {log.source}</span>
                    <SyncStatusBadge status={log.status} />
                  </div>
                  <div className="text-xs text-slate-400 mb-1">
                    {fmtDateTime(log.startedAt)} · {log.triggeredBy === 'manual' ? 'manual' : 'otomatis (terjadwal)'}
                  </div>
                  {log.status === 'success' && (
                    <div className="text-xs text-slate-600">
                      {log.itemsUpdated} produk diperbarui
                      {log.itemsSkipped > 0 ? `, ${log.itemsSkipped} SKU dilewati` : ''}
                    </div>
                  )}
                  {log.status === 'error' && log.errorMessage && (
                    <div className="text-xs text-red-600 mt-1 break-words">{log.errorMessage}</div>
                  )}
                </div>
              )
            }
            const log = entry.data
            return (
              <div key={`upload-${log.id}`} className="border border-slate-200 rounded-2xl p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-slate-700">Upload Stok Supplier</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                    <Upload size={11} /> Manual
                  </span>
                </div>
                <div className="text-xs text-slate-400 mb-1">{fmtDateTime(log.uploadedAt)}</div>
                <div className="text-xs text-slate-600">
                  {log.itemsUpdated} baris tersimpan
                  {log.itemsSkipped > 0 ? `, ${log.itemsSkipped} baris dilewati (SKU/supplier tidak dikenali)` : ''}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------- Upload Stok Supplier (paste massal — versi file Excel menyusul) ----------
function UnmappedRowMatcher({
  row,
  onMapped,
}: {
  row: UnmappedSupplierRow
  onMapped: (productId: string) => void
}) {
  const [query, setQuery] = useState(row.namaBarang || '')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)

  async function runSearch(q: string, autoOpen = true) {
    setQuery(q)
    if (q.trim().length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const r = await searchProductsForMapping(q)
      setResults(r)
      if (autoOpen) setOpen(true)
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    // Pre-isi hasil pencarian dari nama barang di file, TAPI dropdown-nya
    // gak langsung dibuka otomatis (biar gak numpuk kalau banyak baris
    // kebuka bareng) — baru muncul begitu baris ini di-klik/fokus.
    if (row.namaBarang) runSearch(row.namaBarang, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="p-2.5 rounded-lg border border-slate-200 bg-white">
      <div className="mb-1.5 min-w-0">
        <span className="font-mono text-[11px] text-slate-500">{row.sku}</span>
        {row.namaBarang && <span className="text-xs text-slate-400"> · {row.namaBarang}</span>}
      </div>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Cari produk yang cocok..."
          className={inputCls + ' text-xs py-1.5'}
        />
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-40 max-h-40 overflow-y-auto">
              {searching && <div className="px-2 py-1.5 text-xs text-slate-400">Mencari...</div>}
              {!searching && results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onMapped(p.id); setOpen(false) }}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-indigo-50 flex items-center justify-between gap-2"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">{p.sku}</span>
                </button>
              ))}
              {!searching && results.length === 0 && query.trim().length >= 2 && (
                <div className="px-2 py-1.5 text-xs text-slate-400">Tidak ketemu.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function UploadSupplierModal({
  suppliers,
  onClose,
  onUpload,
  onSupplierAdded,
}: {
  suppliers: SupplierOption[]
  onClose: () => void
  onUpload: (supplierId: string, resolvedRows: FinalSupplierStockRow[], skippedCount: number) => Promise<void>
  onSupplierAdded: (s: SupplierOption) => void
}) {
  const [supplierId, setSupplierId] = useState('')
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [columnDraft, setColumnDraft] = useState<{ colIndex: number; selected: boolean; gudangName: string }[] | null>(null)
  const [fileRows, setFileRows] = useState<ParsedSupplierRow[] | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState<ResolveResult | null>(null)
  const [manualMap, setManualMap] = useState<Map<string, string>>(new Map())
  const [visibleUnmapped, setVisibleUnmapped] = useState(10)
  const [bulkCreating, setBulkCreating] = useState(false)
  const [bulkConfirming, setBulkConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runExtract(f: File, s: ScanResult, columns: GudangColumnChoice[]) {
    setExtracting(true)
    setError(null)
    try {
      const r = await extractSupplierStockRows(f, s, columns)
      setFileRows(r)
    } catch (e: any) {
      setError(`Gagal baca isi file: ${e?.message || e}`)
    } finally {
      setExtracting(false)
    }
  }

  async function handleFilePick(f: File | undefined) {
    if (!f) return
    setFile(f)
    setScan(null)
    setColumnDraft(null)
    setFileRows(null)
    setError(null)
    setScanning(true)
    try {
      const result = await scanSupplierStockExcel(f)
      setScan(result)
      if (!result.ok) {
        setError(result.error || 'Format file tidak dikenali.')
      } else if (result.qtyCandidates && result.qtyCandidates.length === 1) {
        // Cuma 1 kolom kandidat — anggap flat (gak ada breakdown gudang
        // yang berarti), langsung jalan otomatis.
        const c = result.qtyCandidates[0]
        await runExtract(f, result, [{ colIndex: c.index, gudangName: '' }])
      } else if (result.qtyCandidates && result.qtyCandidates.length > 1) {
        // Lebih dari 1 — siapin draft pemilihan (semua ke-cek default,
        // nama gudang dari header, didisambiguasi kalau ada yang sama).
        const seen = new Map<string, number>()
        const draft = result.qtyCandidates.map((c) => {
          const count = (seen.get(c.header) || 0) + 1
          seen.set(c.header, count)
          const name = count > 1 ? `${c.header} (${count})` : c.header
          return { colIndex: c.index, selected: true, gudangName: name }
        })
        setColumnDraft(draft)
      }
    } catch (e: any) {
      setError(`Gagal baca file: ${e?.message || e}`)
    } finally {
      setScanning(false)
    }
  }

  async function handleConfirmColumns() {
    if (!file || !scan || !columnDraft) return
    const chosen = columnDraft.filter((c) => c.selected).map((c) => ({ colIndex: c.colIndex, gudangName: c.gudangName.trim() || `Gudang ${c.colIndex + 1}` }))
    if (chosen.length === 0) {
      setError('Pilih minimal 1 kolom gudang.')
      return
    }
    await runExtract(file, scan, chosen)
  }

  useEffect(() => {
    if (!supplierId || !fileRows || fileRows.length === 0) return
    const uniqueBySkuMap = new Map<string, { sku: string; namaBarang?: string }>()
    fileRows.forEach((r) => {
      const key = normalizeSku(r.sku)
      if (!uniqueBySkuMap.has(key)) uniqueBySkuMap.set(key, { sku: r.sku, namaBarang: r.namaBarang })
    })
    const uniqueRows = Array.from(uniqueBySkuMap.values())
    setResolving(true)
    setResolved(null)
    setManualMap(new Map())
    setVisibleUnmapped(10)
    resolveSupplierRows(supplierId, uniqueRows)
      .then(setResolved)
      .catch((e: any) => setError(`Gagal cocokkan SKU: ${e?.message || e}`))
      .finally(() => setResolving(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, fileRows])

  async function handleMapRow(row: UnmappedSupplierRow, productId: string) {
    try {
      await saveSupplierSkuMapping(supplierId, row.sku, productId)
      setManualMap((prev) => new Map(prev).set(row.sku, productId))
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  async function handleBulkCreate() {
    if (!resolved) return
    const remaining = resolved.unmapped.filter((r) => !manualMap.has(r.sku))
    if (remaining.length === 0) return
    setBulkCreating(true)
    setError(null)
    try {
      const result = await bulkCreateProductsAndMap(supplierId, remaining)
      setManualMap((prev) => {
        const next = new Map(prev)
        Object.entries(result.mappingBySku).forEach(([sku, productId]) => next.set(sku, productId))
        return next
      })
      setBulkConfirming(false)
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setBulkCreating(false)
    }
  }

  async function handleAddSupplier() {
    if (!newSupplierName.trim()) return
    try {
      const s = await addSupplierQuick(newSupplierName.trim())
      onSupplierAdded(s)
      setSupplierId(s.id)
      setAddingSupplier(false)
      setNewSupplierName('')
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  async function handleSubmit() {
    if (!supplierId || !resolved || !fileRows) return
    setSubmitting(true)
    setError(null)
    try {
      const skuToProductId = new Map<string, string>()
      resolved.mapped.forEach((r) => skuToProductId.set(normalizeSku(r.sku), r.productId))
      manualMap.forEach((productId, sku) => skuToProductId.set(normalizeSku(sku), productId))
      const { rows: finalRows, skippedCount } = buildSupplierStockRows(fileRows, skuToProductId)
      await onUpload(supplierId, finalRows, skippedCount)
      onClose()
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setSubmitting(false)
    }
  }

  const needsColumnChoice = !!columnDraft && !fileRows
  const totalResolvedCount = (resolved?.mapped.length || 0) + manualMap.size
  const canSubmit = !!supplierId && !!resolved && totalResolvedCount > 0 && !needsColumnChoice

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={submitting ? undefined : onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="font-semibold text-slate-800">Upload Stok Supplier</p>
          </div>
          <button onClick={onClose} disabled={submitting} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase mb-1.5">Pilih Supplier</div>
            <div className="bg-slate-50 rounded-2xl p-3">
              <div className="text-[11px] font-semibold text-indigo-600 mb-1.5">File ini dari supplier mana? (dari Master Data)</div>
              <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— Pilih supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {!addingSupplier ? (
                <button onClick={() => setAddingSupplier(true)} className="mt-2 text-xs text-indigo-600 font-medium hover:underline">
                  + Supplier belum ada? Tambahkan di Master Data
                </button>
              ) : (
                <div className="mt-2 flex gap-1.5">
                  <input
                    autoFocus
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    placeholder="Nama supplier baru..."
                    className={inputCls}
                  />
                  <button onClick={handleAddSupplier} className="px-3 rounded-lg bg-indigo-600 text-white text-xs font-medium shrink-0">
                    Tambah
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase mb-1.5">Upload File Stok</div>
            <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-200 rounded-2xl py-8 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30">
              <Upload size={22} className="text-slate-300" />
              <span className="text-sm text-slate-500">Tap untuk pilih file</span>
              <span className="text-[11px] text-slate-400">Excel (.xlsx, .xls) — 1 supplier per upload</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => handleFilePick(e.target.files?.[0])} />
            </label>

            {file && (
              <div className="mt-2 flex items-center justify-between gap-2 p-3 rounded-xl border border-slate-200">
                <div className="min-w-0 flex items-center gap-2">
                  <div className="size-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <FileSpreadsheet size={16} className="text-slate-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-slate-700 truncate">{file.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                      {scan?.ok && fileRows && ` · ${fileRows.length} baris terbaca (sheet "${scan.sheetName}")`}
                    </div>
                  </div>
                </div>
                {scanning || extracting ? (
                  <Loader2 size={14} className="animate-spin text-slate-400 shrink-0" />
                ) : fileRows && fileRows.length > 0 ? (
                  <span className="shrink-0 text-[11px] font-medium px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Siap</span>
                ) : needsColumnChoice ? (
                  <span className="shrink-0 text-[11px] font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">Pilih gudang</span>
                ) : (
                  <span className="shrink-0 text-[11px] font-medium px-2 py-1 rounded-full bg-red-100 text-red-700">Error</span>
                )}
              </div>
            )}

            {needsColumnChoice && columnDraft && (
              <div className="mt-2 p-3 rounded-xl border border-amber-200 bg-amber-50 space-y-2">
                <p className="text-xs font-semibold text-amber-800">
                  Ada {columnDraft.length} kolom yang mirip stok — centang yang mau dipakai, kasih nama gudangnya:
                </p>
                <div className="space-y-1.5">
                  {columnDraft.map((c, i) => (
                    <div key={c.colIndex} className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg p-2">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={(e) => {
                          const next = [...columnDraft]
                          next[i] = { ...next[i], selected: e.target.checked }
                          setColumnDraft(next)
                        }}
                      />
                      <input
                        value={c.gudangName}
                        onChange={(e) => {
                          const next = [...columnDraft]
                          next[i] = { ...next[i], gudangName: e.target.value }
                          setColumnDraft(next)
                        }}
                        placeholder="Nama gudang..."
                        className={inputCls + ' text-xs py-1'}
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleConfirmColumns}
                  disabled={extracting}
                  className="w-full px-3 py-2 rounded-full bg-indigo-600 text-white text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {extracting && <Loader2 size={12} className="animate-spin" />}
                  {extracting ? 'Memproses...' : 'Lanjut'}
                </button>
              </div>
            )}

            {resolving && (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                <Loader2 size={12} className="animate-spin" /> Mencocokkan kode barang ke katalog produk kita...
              </div>
            )}

            {resolved && !resolving && (
              <div className="mt-2 space-y-2">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  <span className="font-medium text-emerald-700">{resolved.mapped.length + manualMap.size}</span> dari{' '}
                  <span className="font-medium">{resolved.mapped.length + resolved.unmapped.length}</span> SKU otomatis cocok.
                  {resolved.unmapped.length - manualMap.size > 0 && (
                    <> {resolved.unmapped.length - manualMap.size} belum dikenali — cocokkan manual di bawah (opsional, sisanya tetap bisa di-upload sekarang).</>
                  )}
                </div>

                {resolved.unmapped.filter((r) => !manualMap.has(r.sku)).length > 0 && (
                  <>
                    {!bulkConfirming ? (
                      <button
                        onClick={() => setBulkConfirming(true)}
                        disabled={bulkCreating}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        <Plus size={12} /> Tambah semua {resolved.unmapped.filter((r) => !manualMap.has(r.sku)).length} sebagai produk baru & mapping
                      </button>
                    ) : (
                      <div className="p-3 rounded-xl border border-indigo-300 bg-indigo-50 text-xs text-indigo-800 space-y-2">
                        <p>
                          Ini akan menambahkan {resolved.unmapped.filter((r) => !manualMap.has(r.sku)).length} produk baru ke katalog
                          (SKU dari kode supplier, nama dari deskripsi barang). Yakin?
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setBulkConfirming(false)} disabled={bulkCreating} className="flex-1 px-3 py-1.5 rounded-full bg-white border border-slate-300 text-slate-600 disabled:opacity-50">
                            Batal
                          </button>
                          <button onClick={handleBulkCreate} disabled={bulkCreating} className="flex-1 px-3 py-1.5 rounded-full bg-indigo-600 text-white font-medium flex items-center justify-center gap-1.5 disabled:opacity-50">
                            {bulkCreating && <Loader2 size={12} className="animate-spin" />}
                            {bulkCreating ? 'Memproses...' : 'Ya, Tambahkan'}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {resolved.unmapped.filter((r) => !manualMap.has(r.sku)).length > 0 && (
                  <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 space-y-2 max-h-72 overflow-y-auto">
                    <p className="text-xs font-semibold text-amber-800">Atau cocokkan satu-satu ke produk yang sudah ada:</p>
                    {resolved.unmapped
                      .filter((r) => !manualMap.has(r.sku))
                      .slice(0, visibleUnmapped)
                      .map((r) => (
                        <UnmappedRowMatcher key={r.sku} row={r} onMapped={(productId) => handleMapRow(r, productId)} />
                      ))}
                    {resolved.unmapped.filter((r) => !manualMap.has(r.sku)).length > visibleUnmapped && (
                      <button
                        onClick={() => setVisibleUnmapped((v) => v + 10)}
                        className="w-full text-center text-xs text-indigo-600 font-medium py-1"
                      >
                        Tampilkan 10 lagi ({resolved.unmapped.filter((r) => !manualMap.has(r.sku)).length - visibleUnmapped} sisanya)
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-800">
            <p className="font-semibold mb-0.5">Cara kerja</p>
            <p>1 supplier diproses per upload. Sebelum data lama ditimpa, sistem otomatis simpan snapshot-nya dulu ke Riwayat.</p>
          </div>

          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-slate-100">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-3 rounded-full text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {submitting ? 'Memproses...' : 'Proses & Update Stok'}
          </button>
          {!canSubmit && !submitting && resolved && totalResolvedCount === 0 && (
            <p className="text-[11px] text-slate-400 text-center mt-1.5">
              Cocokkan minimal 1 SKU dulu (klik kotak pencarian di salah satu baris di atas, lalu pilih produknya).
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- Tab: Stok Cabang — 9 sumber dikelompokkan jadi 4 kota (Mode Simpel) ----------
type SourceCell = { qty: number; physical?: number; held?: number }
type MatrixRow = {
  productId: string
  sku: string
  name: string
  kategori: string
  subjenis: string
  sources: Record<string, SourceCell>
  cityTotal: Record<string, number>
  total: number
}

function cellDisplay(cell: SourceCell | undefined) {
  const qty = cell?.qty ?? 0
  const held = cell?.held ?? 0
  return { qty, held, physical: cell?.physical ?? qty }
}

// Sheet "Rincian" — dibuka dari tap angka kota di Mode Simpel, isinya
// breakdown per sumber/akun/gudang dalam kota itu.
function RincianSheet({
  row,
  group,
  onClose,
}: {
  row: MatrixRow
  group: string
  onClose: () => void
}) {
  const sources = sourcesInGroup(group)
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full sm:max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 flex items-center gap-1.5">
              <PackageSearch size={16} className="text-indigo-600 shrink-0" /> Rincian {group}
            </h3>
            <p className="text-xs text-slate-400 truncate mt-0.5">{row.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-2">
          {sources.map((s) => {
            const cell = cellDisplay(row.sources[s.code])
            return (
              <div key={s.code} className="flex items-center justify-between gap-2 border border-slate-200 rounded-2xl p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    {s.label}
                    {s.excludeTotal && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        cek saja, gak masuk Total
                      </span>
                    )}
                  </div>
                  {cell.held > 0 && <div className="text-[11px] text-slate-400 mt-0.5">({cell.physical}−{cell.held} ditahan servis)</div>}
                </div>
                <div className={`text-base font-semibold shrink-0 ${cell.qty < 0 ? 'text-red-600' : cell.qty === 0 ? 'text-slate-300' : 'text-slate-800'}`}>
                  {cell.qty}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FilterStokCabangModal({
  allKategoris,
  selectedKategoris,
  onChangeKategoris,
  modeDetail,
  onChangeModeDetail,
  hideZeroStock,
  onChangeHideZeroStock,
  kolomDetailCount,
  onClose,
}: {
  allKategoris: string[]
  selectedKategoris: Set<string> | null
  onChangeKategoris: (v: Set<string> | null) => void
  modeDetail: boolean
  onChangeModeDetail: (v: boolean) => void
  hideZeroStock: boolean
  onChangeHideZeroStock: (v: boolean) => void
  kolomDetailCount: number
  onClose: () => void
}) {
  // Draft lokal biar perubahan cuma keterapkan pas klik "Terapkan"
  // (bukan langsung tiap klik checkbox) — sesuai pola bottom-sheet
  // filter pada umumnya.
  const [draftKategoris, setDraftKategoris] = useState<Set<string> | null>(selectedKategoris)
  const [draftModeDetail, setDraftModeDetail] = useState(modeDetail)
  const [draftHideZero, setDraftHideZero] = useState(hideZeroStock)

  const allChecked = draftKategoris === null
  function toggleAll() {
    setDraftKategoris(null)
  }
  function toggleOne(kategori: string) {
    setDraftKategoris((prev) => {
      const base = prev === null ? new Set(allKategoris) : new Set(prev)
      if (base.has(kategori)) base.delete(kategori)
      else base.add(kategori)
      // Kalau semua kecentang lagi, balik jadi null ("Semua Kategori").
      if (base.size === allKategoris.length) return null
      return base
    })
  }

  function handleReset() {
    setDraftKategoris(null)
    setDraftModeDetail(false)
    setDraftHideZero(false)
  }

  function handleTerapkan() {
    onChangeKategoris(draftKategoris)
    onChangeModeDetail(draftModeDetail)
    onChangeHideZeroStock(draftHideZero)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full sm:max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Filter Stok Cabang</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase mb-2">Kategori</div>
            <label className="flex items-center gap-2 py-1.5 text-sm font-medium text-slate-800">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-indigo-600" />
              Semua Kategori
            </label>
            <div className="pl-1 mt-1 space-y-0.5 max-h-48 overflow-y-auto">
              {allKategoris.map((k) => (
                <label key={k} className="flex items-center gap-2 py-1 pl-3 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={allChecked || (draftKategoris?.has(k) ?? false)}
                    onChange={() => toggleOne(k)}
                    className="accent-indigo-600"
                  />
                  {k}
                </label>
              ))}
              {allKategoris.length === 0 && <p className="text-xs text-slate-400 pl-3">Belum ada kategori.</p>}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase mb-2">Tampilan</div>
            <label className="flex items-center gap-2 py-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={draftModeDetail}
                onChange={(e) => setDraftModeDetail(e.target.checked)}
                className="accent-indigo-600"
              />
              Mode Detail ({kolomDetailCount} kolom per akun/gudang)
            </label>
            <label className="flex items-center gap-2 py-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={draftHideZero}
                onChange={(e) => setDraftHideZero(e.target.checked)}
                className="accent-indigo-600"
              />
              Sembunyikan produk stok 0
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={handleReset} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>
            <RotateCcw size={13} /> Reset
          </button>
          <button onClick={handleTerapkan} className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm ${btnPrimaryCls}`}>
            <Check size={14} /> Terapkan
          </button>
        </div>
      </div>
    </div>
  )
}

function StokCabangMatrix({ isDesktopLayout, myBranchId }: { isDesktopLayout: boolean; myBranchId: string | null }) {
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [matrix, setMatrix] = useState<StockMatrixData>({ products: [], physical: {}, held: {} })
  // Saldo "-K": barang konsinyasi/transfer manual antar cabang (dari
  // tabel stock_transfers, BUKAN dari sync Zoho/Accurate). Map<branchId,
  // Map<productId, qty>>.
  const [transferMatrix, setTransferMatrix] = useState<Map<string, Map<string, number>>>(new Map())
  const [soloTransferMatrix, setSoloTransferMatrix] = useState<Map<string, Map<string, number>>>(new Map())
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(25)
  const [sortKey, setSortKey] = useState<string>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [syncingBranch, setSyncingBranch] = useState<string | null>(null)
  const [syncingAll, setSyncingAll] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [showFilter, setShowFilter] = useState(false)
  // null = "Semua Kategori" (belum ada filter aktif). Kalau diisi, cuma
  // kategori yang ada di dalam Set ini yang ditampilkan.
  const [selectedKategoris, setSelectedKategoris] = useState<Set<string> | null>(null)
  const [modeDetail, setModeDetail] = useState(false)
  const [hideZeroStock, setHideZeroStock] = useState(false)
  // Sheet Rincian, dibuka dari tap angka kota di Mode Simpel.
  const [rincian, setRincian] = useState<{ row: MatrixRow; group: string } | null>(null)

  async function loadAll() {
    setLoading(true)
    try {
      const [b, m, ls, tk] = await Promise.all([
        loadAllBranches(),
        loadStockMatrix(),
        loadLastSyncFreshness(),
        // Gak boleh sampai numbangin seluruh halaman stok utama kalau
        // fitur transfer ini kenapa-kenapa (misal migration belum
        // dijalanin) — jadi di-catch sendiri, fallback ke Map kosong.
        loadTransferBalanceMatrix().catch(() => ({ matrix: new Map(), soloMatrix: new Map() })),
      ])
      setBranches(b)
      setMatrix(m)
      setLastSync(ls)
      setTransferMatrix(tk.matrix)
      setSoloTransferMatrix(tk.soloMatrix)
    } catch (e: any) {
      setMessage(`Gagal memuat data: ${e?.message || e}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Bangun 9 sumber (jkt/jkt_k/jkt_k_solo/solo_z/solo_cv/bali_z/bali_k/
  // pwt/pwt_k) per produk dari 3 data yang sudah dimuat di atas — TIDAK
  // ada query/tabel baru. Total & Total kota mengecualikan sumber yang
  // excludeTotal (cuma JKT-K-SOLO, dipakai buat cross-check aja).
  const rows: MatrixRow[] = useMemo(() => {
    return matrix.products.map((p) => {
      const sources: Record<string, SourceCell> = {}
      CABANG_SOURCES.forEach((src) => {
        if (src.kind === 'main') {
          const physical = matrix.physical[`${src.branchId}|${p.productId}`] || 0
          const held = p.sku ? matrix.held[`${src.branchId}|${normalizeSku(p.sku)}`] || 0 : 0
          sources[src.code] = { qty: physical - held, physical, held }
        } else if (src.kind === 'own') {
          sources[src.code] = { qty: transferMatrix.get(src.branchId)?.get(p.productId) || 0 }
        } else if (src.kind === 'solo') {
          sources[src.code] = { qty: soloTransferMatrix.get(src.branchId)?.get(p.productId) || 0 }
        } else {
          const own = transferMatrix.get(src.branchId)?.get(p.productId) || 0
          const solo = soloTransferMatrix.get(src.branchId)?.get(p.productId) || 0
          sources[src.code] = { qty: own + solo }
        }
      })
      const total = CABANG_SOURCES.reduce((sum, src) => (src.excludeTotal ? sum : sum + sources[src.code].qty), 0)
      const cityTotal: Record<string, number> = {}
      CITY_GROUPS.forEach((g) => {
        cityTotal[g] = sourcesInGroup(g).reduce((sum, s) => (s.excludeTotal ? sum : sum + sources[s.code].qty), 0)
      })
      return { productId: p.productId, sku: p.sku, name: p.name, kategori: p.kategori, subjenis: p.subjenis, sources, cityTotal, total }
    })
  }, [matrix, transferMatrix, soloTransferMatrix])

  // Daftar kategori unik dari data yang ada, buat isi checkbox filter.
  const allKategoris = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => { if (r.kategori) set.add(r.kategori) })
    return Array.from(set).sort()
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let base = q ? rows.filter((r) => `${r.name} ${r.sku} ${r.kategori}`.toLowerCase().includes(q)) : rows
    if (selectedKategoris) base = base.filter((r) => selectedKategoris.has(r.kategori))
    if (hideZeroStock) base = base.filter((r) => r.total > 0)
    const sorted = [...base].sort((a, b) => {
      let av: number | string, bv: number | string
      if (sortKey === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase() }
      else if (sortKey === 'kategori') { av = a.kategori.toLowerCase(); bv = b.kategori.toLowerCase() }
      else if (sortKey === 'total') { av = a.total; bv = b.total }
      else if ((CITY_GROUPS as readonly string[]).includes(sortKey)) { av = a.cityTotal[sortKey] ?? 0; bv = b.cityTotal[sortKey] ?? 0 }
      else { av = a.sources[sortKey]?.qty ?? 0; bv = b.sources[sortKey]?.qty ?? 0 }
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return sorted
  }, [rows, query, sortKey, sortDir, selectedKategoris, hideZeroStock])

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  async function handleSyncBranch(branchId: string) {
    setSyncingBranch(branchId)
    setMessage(null)
    try {
      const source = stockSourceForBranch(branchId)
      const result = source === 'accurate' ? await triggerAccurateSync(branchId) : await triggerZohoSync(branchId)
      const r = result.results?.[0]
      if (r?.status === 'error') setMessage(`Sync gagal: ${r.message}`)
      else if (r) setMessage(`Sync selesai — ${r.itemsUpdated} produk diperbarui${r.itemsSkipped ? `, ${r.itemsSkipped} SKU dilewati` : ''}.`)
      await loadAll()
    } catch (e: any) {
      setMessage(`Sync gagal: ${e?.message || e}`)
    } finally {
      setSyncingBranch(null)
    }
  }

  async function handleSyncAll() {
    setSyncingAll(true)
    setMessage(null)
    try {
      const [zohoResult, accurateResult, accurateSoloKonsiResult] = await Promise.all([
        triggerZohoSyncAll(),
        triggerAccurateSyncAll(),
        triggerAccurateSoloKonsi().catch((e: any) => ({ results: [{ branchName: 'Solo (multi-gudang)', status: 'error', message: String(e?.message || e) }] })),
      ])
      const allResults = [...(zohoResult.results || []), ...(accurateResult.results || []), ...(accurateSoloKonsiResult.results || [])]
      const okCount = allResults.filter((r: any) => r.status === 'success').length
      const failCount = allResults.filter((r: any) => r.status === 'error').length
      setMessage(`Sync selesai — ${okCount} cabang berhasil${failCount ? `, ${failCount} gagal` : ''}.`)
      await loadAll()
    } catch (e: any) {
      setMessage(`Sync gagal: ${e?.message || e}`)
    } finally {
      setSyncingAll(false)
    }
  }

  function SortHeader({ label, sortKeyName }: { label: string; sortKeyName: string }) {
    const active = sortKey === sortKeyName
    return (
      <button onClick={() => toggleSort(sortKeyName)} className={`flex items-center gap-1 hover:text-slate-600 ${active ? 'text-slate-700' : ''}`}>
        {label}
        {active ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={11} className="text-slate-300" />}
      </button>
    )
  }

  function CellQty({ cell }: { cell: SourceCell | undefined }) {
    const d = cellDisplay(cell)
    return (
      <>
        <span className={d.qty < 0 ? 'text-red-600 font-medium' : d.qty === 0 ? 'text-slate-300' : 'text-slate-700 font-medium'}>{d.qty}</span>
        {d.held > 0 && <div className="text-[10px] text-slate-400">({d.physical}-{d.held})</div>}
      </>
    )
  }

  const zeroStockCount = rows.filter((r) => r.total <= 0).length
  const visibleRows = filtered.slice(0, visibleCount)

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setVisibleCount(25) }} placeholder="Cari tipe / SKU..." className={inputCls + ' pl-8'} />
        </div>
        <button onClick={() => setShowFilter(true)} className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnSecondaryCls}`}>
          <SlidersHorizontal size={14} />
          Filter
          {(selectedKategoris || hideZeroStock || modeDetail) && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
          )}
        </button>
        <TransferStokButton onSaved={loadAll} />
        <button
          onClick={handleSyncAll}
          disabled={syncingAll || !!syncingBranch}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnPrimaryCls}`}
        >
          {syncingAll ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {syncingAll ? 'Menyinkronkan...' : 'Sync Semua'}
        </button>
      </div>

      {message && <div className="mb-3 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-600">{message}</div>}

      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2.5 p-4 border-b border-slate-100">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <PackageSearch size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800">Daftar Stok Cabang</div>
            <div className="text-xs text-slate-400">
              {rows.length} produk · {zeroStockCount} stok 0{modeDetail ? ' · Mode Detail' : ''}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <Clock size={10} /> {lastSync ? `Diperbarui ${fmtRelative(lastSync)} — dari sync API otomatis` : 'Belum pernah sync'}
            </div>
          </div>
        </div>

        <div className="px-4 py-2 bg-slate-50 text-[11px] text-slate-500 border-b border-slate-100">
          Angka dalam kurung = (stok fisik − ditahan servis). {modeDetail
            ? 'JKT-K/SOLO-CV/BALI-K/PWT-K = transfer manual + konsinyasi akun sendiri. JKT-K-SOLO = konsinyasi dititipkan lewat Accurate Solo (cross-check, gak masuk Total).'
            : 'Tap angka kota untuk lihat rincian per akun/gudang.'} Klik header kolom untuk urutkan.
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400"><Loader2 className="inline animate-spin mr-2" size={14} /> Memuat...</div>
        ) : isDesktopLayout ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {modeDetail ? (
                <>
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[10px] text-slate-400 uppercase tracking-wide">
                      <th className="p-3" rowSpan={2}><SortHeader label="Kategori" sortKeyName="kategori" /></th>
                      <th className="p-3" rowSpan={2}><SortHeader label="Nama Produk" sortKeyName="name" /></th>
                      {CITY_GROUPS.map((g) => (
                        <th key={g} className="p-2 text-center bg-indigo-50 text-indigo-600 font-semibold" colSpan={sourcesInGroup(g).length}>
                          {g}
                        </th>
                      ))}
                      <th className="p-3" rowSpan={2}><SortHeader label="Total" sortKeyName="total" /></th>
                    </tr>
                    <tr className="border-b border-slate-100 text-center text-[10px] text-slate-400 uppercase tracking-wide">
                      {CABANG_SOURCES.map((s) => (
                        <th key={s.code} className={`p-2 ${s.excludeTotal ? 'bg-slate-50' : ''}`}>
                          <SortHeader label={s.label} sortKeyName={s.code} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <tr key={r.productId} className="border-b border-slate-50">
                        <td className="p-3 whitespace-nowrap text-xs text-indigo-600">{r.kategori || '-'}</td>
                        <td className="p-3">
                          <div className="font-medium text-slate-800">{r.name}</div>
                          {r.subjenis && <div className="text-xs text-slate-400">{r.subjenis}</div>}
                        </td>
                        {CABANG_SOURCES.map((s) => (
                          <td key={s.code} className={`p-3 text-center ${s.excludeTotal ? 'bg-slate-50/60' : ''}`}>
                            <CellQty cell={r.sources[s.code]} />
                          </td>
                        ))}
                        <td className="p-3 font-semibold text-slate-800">{r.total}</td>
                      </tr>
                    ))}
                    {visibleRows.length === 0 && (
                      <tr>
                        <td colSpan={CABANG_SOURCES.length + 3} className="p-8 text-center text-slate-400">
                          {rows.length === 0 ? 'Belum ada data stok — coba sync dulu.' : 'Tidak ada yang cocok dengan pencarian.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </>
              ) : (
                <>
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
                      <th className="p-3"><SortHeader label="Kategori" sortKeyName="kategori" /></th>
                      <th className="p-3"><SortHeader label="Nama Produk" sortKeyName="name" /></th>
                      {CITY_GROUPS.map((g) => (
                        <th key={g} className="p-3 text-center"><SortHeader label={CITY_SHORT[g]} sortKeyName={g} /></th>
                      ))}
                      <th className="p-3"><SortHeader label="Total" sortKeyName="total" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <tr key={r.productId} className="border-b border-slate-50">
                        <td className="p-3 whitespace-nowrap text-xs text-indigo-600">{r.kategori || '-'}</td>
                        <td className="p-3">
                          <div className="font-medium text-slate-800">{r.name}</div>
                          {r.subjenis && <div className="text-xs text-slate-400">{r.subjenis}</div>}
                        </td>
                        {CITY_GROUPS.map((g) => (
                          <td key={g} className="p-3 text-center">
                            <button onClick={() => setRincian({ row: r, group: g })} className="w-full hover:text-indigo-600">
                              <span className={r.cityTotal[g] < 0 ? 'text-red-600 font-medium' : r.cityTotal[g] === 0 ? 'text-slate-300' : 'text-slate-700 font-medium'}>
                                {r.cityTotal[g]}
                              </span>
                            </button>
                          </td>
                        ))}
                        <td className="p-3 font-semibold text-slate-800">{r.total}</td>
                      </tr>
                    ))}
                    {visibleRows.length === 0 && (
                      <tr>
                        <td colSpan={CITY_GROUPS.length + 3} className="p-8 text-center text-slate-400">
                          {rows.length === 0 ? 'Belum ada data stok — coba sync dulu.' : 'Tidak ada yang cocok dengan pencarian.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </>
              )}
            </table>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleRows.map((r) => (
              <div key={r.productId} className="p-4">
                <div className="text-xs text-indigo-600 mb-0.5">{r.kategori || '-'}</div>
                <div className="font-medium text-slate-800">{r.name}</div>
                {r.subjenis && <div className="text-xs text-slate-400 mb-2">{r.subjenis}</div>}
                <div className="flex flex-wrap gap-3 mt-2">
                  {modeDetail
                    ? CABANG_SOURCES.map((s) => (
                        <div key={s.code} className="text-center">
                          <div className="text-[10px] text-slate-400 uppercase">{s.label}</div>
                          <div><CellQty cell={r.sources[s.code]} /></div>
                        </div>
                      ))
                    : CITY_GROUPS.map((g) => (
                        <button key={g} onClick={() => setRincian({ row: r, group: g })} className="text-center">
                          <div className="text-[10px] text-slate-400 uppercase">{CITY_SHORT[g]}</div>
                          <div className={r.cityTotal[g] < 0 ? 'text-red-600 font-semibold' : 'text-slate-700 font-semibold'}>{r.cityTotal[g]}</div>
                        </button>
                      ))}
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 uppercase">Total</div>
                    <div className="text-slate-800 font-semibold">{r.total}</div>
                  </div>
                </div>
              </div>
            ))}
            {visibleRows.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-sm">
                {rows.length === 0 ? 'Belum ada data stok — coba sync dulu.' : 'Tidak ada yang cocok dengan pencarian.'}
              </div>
            )}
          </div>
        )}

        {visibleCount < filtered.length && (
          <div className="p-4 border-t border-slate-100 text-center">
            <button onClick={() => setVisibleCount((v) => v + 25)} className={`px-4 py-2 text-sm ${btnSecondaryCls}`}>
              Muat 25 produk lagi
            </button>
          </div>
        )}
        {filtered.length > 0 && (
          <div className="pb-4 text-center text-xs text-slate-400">
            Menampilkan {Math.min(visibleCount, filtered.length)} dari {filtered.length} produk
          </div>
        )}
      </div>

      {showFilter && (
        <FilterStokCabangModal
          allKategoris={allKategoris}
          selectedKategoris={selectedKategoris}
          onChangeKategoris={setSelectedKategoris}
          modeDetail={modeDetail}
          onChangeModeDetail={setModeDetail}
          hideZeroStock={hideZeroStock}
          onChangeHideZeroStock={setHideZeroStock}
          kolomDetailCount={CABANG_SOURCES.length}
          onClose={() => setShowFilter(false)}
        />
      )}

      {rincian && <RincianSheet row={rincian.row} group={rincian.group} onClose={() => setRincian(null)} />}
    </div>
  )
}

// ---------- Tab: Stok Supplier ----------
const LOW_STOCK_THRESHOLD = 5

function SupplierProductCard({ result }: { result: SupplierStockProductResult }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div className="font-medium text-slate-800 truncate">{result.productName}</div>
          {result.subjenis ? (
            <div className="text-xs text-slate-400 truncate">{result.subjenis}</div>
          ) : result.kategori ? (
            <div className="text-xs text-slate-400 truncate">{result.kategori}</div>
          ) : null}
        </div>
        <span className={`shrink-0 font-semibold ${result.totalQty <= 0 ? 'text-red-600' : 'text-slate-800'}`}>
          {result.totalQty <= LOW_STOCK_THRESHOLD ? '~' : ''}{result.totalQty}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {result.suppliers.map((s) => {
          const flat = s.gudangEntries.length === 1 && !s.gudangEntries[0].gudang
          return (
            <div key={s.supplierName}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">{s.supplierName}</span>
                <div className="flex items-center gap-2">
                  {flat && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                        s.totalQty <= LOW_STOCK_THRESHOLD ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {s.totalQty <= LOW_STOCK_THRESHOLD ? '⚠ LOW · cek dulu' : '✓ READY'}
                    </span>
                  )}
                  {flat && <span className="text-sm font-semibold text-slate-700">{s.totalQty}</span>}
                </div>
              </div>
              {!flat && (
                <div className="mt-0.5 space-y-0.5">
                  {s.gudangEntries.map((g, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-slate-400 pl-3">
                      <span>{g.gudang || '(tanpa nama gudang)'}</span>
                      <span className="text-slate-600 font-medium">{g.qty}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StokSupplierTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SupplierStockProductResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])

  useEffect(() => {
    loadAllSuppliers().then(setSuppliers).catch(() => {})
  }, [])

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    setSearched(true)
    try {
      const r = await searchSupplierStock(query)
      setResults(r)
    } finally {
      setSearching(false)
    }
  }

  async function handleUpload(supplierId: string, resolvedRows: FinalSupplierStockRow[], skippedCount: number) {
    const r = await uploadSupplierStockFile(supplierId, resolvedRows, skippedCount)
    setMessage(`Upload tersimpan — ${r.itemsUpdated} baris diperbarui${r.itemsSkipped ? `, ${r.itemsSkipped} baris dilewati (belum dikenali)` : ''}.`)
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Cari nama produk atau SKU..."
            className={inputCls + ' pl-8'}
          />
        </div>
        <button onClick={handleSearch} disabled={searching || !query.trim()} className={`px-4 text-sm ${btnPrimaryCls}`}>
          {searching ? <Loader2 size={14} className="animate-spin" /> : 'Cari'}
        </button>
        <button onClick={() => setShowUpload(true)} className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnSecondaryCls}`}>
          <Upload size={14} /> Upload Stok
        </button>
      </div>

      {message && <div className="mb-4 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-600">{message}</div>}

      {!searched && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <PackageSearch size={18} />
            </span>
            <div>
              <div className="text-sm font-semibold text-slate-800">Stok Supplier</div>
              <div className="text-xs text-slate-400">Cari 1 tipe untuk lihat ketersediaan di tiap supplier</div>
            </div>
          </div>
          <p className="text-center text-sm text-indigo-600 py-10">Ketik nama produk atau SKU dulu untuk mulai cari stok supplier</p>
        </div>
      )}

      {searched && !searching && results.length === 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 p-8">
          <p className="text-center text-sm text-slate-400">Tidak ada data stok supplier untuk produk ini.</p>
        </div>
      )}

      {searched && !searching && results.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {results.map((r) => (
            <SupplierProductCard key={r.productId} result={r} />
          ))}
        </div>
      )}

      {showUpload && (
        <UploadSupplierModal
          suppliers={suppliers}
          onClose={() => setShowUpload(false)}
          onUpload={handleUpload}
          onSupplierAdded={(s) => setSuppliers((prev) => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)))}
        />
      )}
    </div>
  )
}

export default function StokModule({ currentUserBranchId }: StokModuleProps) {
  const [activeTab, setActiveTab] = useState<'cabang' | 'supplier'>('cabang')
  const [viewMode, setViewMode] = useState<'mobile' | 'desktop'>('desktop')
  const [showRiwayat, setShowRiwayat] = useState(false)
  const [syncLogs, setSyncLogs] = useState<SyncLogRow[]>([])
  const [uploadLogs, setUploadLogs] = useState<UploadLogRow[]>([])

  async function openRiwayat() {
    setShowRiwayat(true)
    const [s, u] = await Promise.all([loadSyncLogAll(), loadSupplierUploadLog()])
    setSyncLogs(s)
    setUploadLogs(u)
  }

  return (
    <div className="text-slate-800">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div>
          <h1 className="font-semibold text-lg text-slate-800">Cek Stok</h1>
          <p className="text-xs text-slate-400 mt-0.5">Stok cabang & supplier — i1 CCTV</p>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4">
        <span className="text-[11px] text-slate-400 mr-1">Mode Pratinjau:</span>
        <button
          onClick={() => setViewMode('mobile')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${viewMode === 'mobile' ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-500'}`}
        >
          <Smartphone size={11} /> Mobile
        </button>
        <button
          onClick={() => setViewMode('desktop')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${viewMode === 'desktop' ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-500'}`}
        >
          <Monitor size={11} /> Desktop
        </button>
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-full w-fit">
          <button
            onClick={() => setActiveTab('cabang')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium ${activeTab === 'cabang' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            Stok Cabang
          </button>
          <button
            onClick={() => setActiveTab('supplier')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium ${activeTab === 'supplier' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}
          >
            Stok Supplier
          </button>
        </div>
        <button onClick={openRiwayat} className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnSecondaryCls}`}>
          <Clock size={14} /> Riwayat
        </button>
      </div>

      {activeTab === 'cabang' ? <StokCabangMatrix isDesktopLayout={viewMode === 'desktop'} myBranchId={currentUserBranchId} /> : <StokSupplierTab />}

      {showRiwayat && <RiwayatModal syncLogs={syncLogs} uploadLogs={uploadLogs} onClose={() => setShowRiwayat(false)} />}
    </div>
  )
}

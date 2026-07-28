'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Search, RefreshCw, Clock, CheckCircle2, XCircle, Loader2, Upload, X, PackageSearch,
  ChevronUp, ChevronDown, ChevronsUpDown, Smartphone, Monitor, FileSpreadsheet, Zap,
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
  searchSupplierStock,
  loadAllSuppliers,
  addSupplierQuick,
  uploadSupplierStockFile,
  resolveSupplierRows,
  searchProductsForMapping,
  saveSupplierSkuMapping,
  normalizeSku,
  type BranchOption,
  type StockMatrixData,
  type SyncLogRow,
  type UploadLogRow,
  type SupplierStockResult,
  type SupplierOption,
  type ResolveResult,
  type ResolvedSupplierRow,
  type UnmappedSupplierRow,
  type ProductSearchResult,
} from '@/lib/stok/api'
import { scanSupplierStockExcel, extractSupplierStockRows, type ScanResult, type QtyColumnCandidate, type ParsedSupplierRow } from '@/lib/stok/parse-supplier-file'

type StokModuleProps = {
  currentUserRole: string
  currentUserBranchId: string | null
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
  const combined: CombinedHistoryEntry[] = [
    ...syncLogs.map((d) => ({ type: 'sync' as const, at: d.startedAt, data: d })),
    ...uploadLogs.map((d) => ({ type: 'upload' as const, at: d.uploadedAt, data: d })),
  ].sort((a, b) => (b.at || '').localeCompare(a.at || ''))

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-start sm:items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Riwayat Stok</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
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
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <span className="font-mono text-[11px] text-slate-500">{row.sku}</span>
          {row.namaBarang && <span className="text-xs text-slate-400"> · {row.namaBarang}</span>}
        </div>
        <span className="shrink-0 text-xs font-medium text-slate-600">Qty {row.qty}</span>
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
  onUpload: (supplierId: string, resolvedRows: ResolvedSupplierRow[], skippedCount: number) => Promise<void>
  onSupplierAdded: (s: SupplierOption) => void
}) {
  const [supplierId, setSupplierId] = useState('')
  const [addingSupplier, setAddingSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [chosenQtyCol, setChosenQtyCol] = useState<number | null>(null)
  const [rows, setRows] = useState<ParsedSupplierRow[] | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState<ResolveResult | null>(null)
  const [manualMap, setManualMap] = useState<Map<string, string>>(new Map())
  const [visibleUnmapped, setVisibleUnmapped] = useState(10)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runResolve(sId: string, extractedRows: ParsedSupplierRow[]) {
    setResolving(true)
    setResolved(null)
    setManualMap(new Map())
    setVisibleUnmapped(10)
    try {
      const r = await resolveSupplierRows(sId, extractedRows)
      setResolved(r)
    } catch (e: any) {
      setError(`Gagal cocokkan SKU: ${e?.message || e}`)
    } finally {
      setResolving(false)
    }
  }

  async function runExtract(f: File, s: ScanResult, qtyIdx: number) {
    setExtracting(true)
    setError(null)
    try {
      const r = await extractSupplierStockRows(f, s, qtyIdx)
      setRows(r)
    } catch (e: any) {
      setError(`Gagal baca isi file: ${e?.message || e}`)
    } finally {
      setExtracting(false)
    }
  }

  useEffect(() => {
    if (supplierId && rows && rows.length > 0) {
      runResolve(supplierId, rows)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, rows])

  async function handleFilePick(f: File | undefined) {
    if (!f) return
    setFile(f)
    setScan(null)
    setChosenQtyCol(null)
    setRows(null)
    setError(null)
    setScanning(true)
    try {
      const result = await scanSupplierStockExcel(f)
      setScan(result)
      if (!result.ok) {
        setError(result.error || 'Format file tidak dikenali.')
      } else if (result.qtyCandidates && result.qtyCandidates.length === 1) {
        // cuma 1 kolom kandidat qty, langsung jalan otomatis
        const idx = result.qtyCandidates[0].index
        setChosenQtyCol(idx)
        await runExtract(f, result, idx)
      }
      // kalau kandidatnya > 1, nunggu user pilih dulu lewat UI di bawah
    } catch (e: any) {
      setError(`Gagal baca file: ${e?.message || e}`)
    } finally {
      setScanning(false)
    }
  }

  async function handlePickQtyColumn(idx: number) {
    if (!file || !scan) return
    setChosenQtyCol(idx)
    await runExtract(file, scan, idx)
  }

  async function handleMapRow(row: UnmappedSupplierRow, productId: string) {
    try {
      await saveSupplierSkuMapping(supplierId, row.sku, productId)
      setManualMap((prev) => new Map(prev).set(row.sku, productId))
    } catch (e: any) {
      setError(String(e?.message || e))
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
    if (!supplierId || !resolved) return
    setSubmitting(true)
    setError(null)
    try {
      const manualResolved: ResolvedSupplierRow[] = resolved.unmapped
        .filter((r) => manualMap.has(r.sku))
        .map((r) => ({ productId: manualMap.get(r.sku)!, qty: r.qty }))
      const allResolved = [...resolved.mapped, ...manualResolved]
      const stillSkipped = resolved.unmapped.length - manualResolved.length
      await onUpload(supplierId, allResolved, stillSkipped)
      onClose()
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setSubmitting(false)
    }
  }

  const needsColumnChoice = !!scan?.ok && (scan.qtyCandidates?.length || 0) > 1 && chosenQtyCol === null
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
                      {scan?.ok && rows && ` · ${rows.length} SKU terbaca (sheet "${scan.sheetName}")`}
                    </div>
                  </div>
                </div>
                {scanning || extracting ? (
                  <Loader2 size={14} className="animate-spin text-slate-400 shrink-0" />
                ) : rows && rows.length > 0 ? (
                  <span className="shrink-0 text-[11px] font-medium px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Siap</span>
                ) : needsColumnChoice ? (
                  <span className="shrink-0 text-[11px] font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700">Pilih kolom</span>
                ) : (
                  <span className="shrink-0 text-[11px] font-medium px-2 py-1 rounded-full bg-red-100 text-red-700">Error</span>
                )}
              </div>
            )}

            {needsColumnChoice && scan?.qtyCandidates && (
              <div className="mt-2 p-3 rounded-xl border border-amber-200 bg-amber-50">
                <p className="text-xs font-semibold text-amber-800 mb-2">
                  Ada {scan.qtyCandidates.length} kolom yang mirip stok — pilih yang mana:
                </p>
                <div className="space-y-1.5">
                  {scan.qtyCandidates.map((c: QtyColumnCandidate) => (
                    <button
                      key={c.index}
                      onClick={() => handlePickQtyColumn(c.index)}
                      className="w-full text-left px-3 py-2 rounded-lg bg-white border border-amber-200 hover:border-indigo-400 hover:bg-indigo-50 text-xs"
                    >
                      <span className="font-medium text-slate-700">Kolom {c.index + 1}{c.header ? ` ("${c.header}")` : ''}</span>
                      <span className="text-slate-400"> — contoh: {c.sample.join(', ')}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {resolving && (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                <Loader2 size={12} className="animate-spin" /> Mencocokkan kode barang STAR ke katalog produk kita...
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
                  <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 space-y-2 max-h-72 overflow-y-auto">
                    <p className="text-xs font-semibold text-amber-800">Cocokkan kode STAR ke produk kita:</p>
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

// ---------- Tab: Stok Cabang — tabel matriks lintas cabang ----------
type MatrixRow = {
  productId: string
  sku: string
  name: string
  kategori: string
  subjenis: string
  perBranch: Record<string, { physical: number; held: number; net: number }>
  total: number
}

function StokCabangMatrix({ isDesktopLayout, myBranchId }: { isDesktopLayout: boolean; myBranchId: string | null }) {
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [matrix, setMatrix] = useState<StockMatrixData>({ products: [], physical: {}, held: {} })
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(6)
  const [sortKey, setSortKey] = useState<string>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [syncingBranch, setSyncingBranch] = useState<string | null>(null)
  const [syncingAll, setSyncingAll] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true)
    try {
      const [b, m, ls] = await Promise.all([loadAllBranches(), loadStockMatrix(), loadLastSyncFreshness()])
      setBranches(b)
      setMatrix(m)
      setLastSync(ls)
    } catch (e: any) {
      setMessage(`Gagal memuat data: ${e?.message || e}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const rows: MatrixRow[] = useMemo(() => {
    return matrix.products.map((p) => {
      const perBranch: MatrixRow['perBranch'] = {}
      let total = 0
      branches.forEach((b) => {
        const physical = matrix.physical[`${b.id}|${p.productId}`] || 0
        const heldVal = p.sku ? matrix.held[`${b.id}|${normalizeSku(p.sku)}`] || 0 : 0
        const net = physical - heldVal
        perBranch[b.id] = { physical, held: heldVal, net }
        total += net
      })
      return { productId: p.productId, sku: p.sku, name: p.name, kategori: p.kategori, subjenis: p.subjenis, perBranch, total }
    })
  }, [matrix, branches])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q ? rows.filter((r) => `${r.name} ${r.sku} ${r.kategori}`.toLowerCase().includes(q)) : rows
    const sorted = [...base].sort((a, b) => {
      let av: number | string, bv: number | string
      if (sortKey === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase() }
      else if (sortKey === 'kategori') { av = a.kategori.toLowerCase(); bv = b.kategori.toLowerCase() }
      else if (sortKey === 'total') { av = a.total; bv = b.total }
      else { av = a.perBranch[sortKey]?.net ?? 0; bv = b.perBranch[sortKey]?.net ?? 0 }
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return sorted
  }, [rows, query, sortKey, sortDir])

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  async function handleSyncBranch(branchId: string) {
    setSyncingBranch(branchId)
    setMessage(null)
    try {
      const result = await triggerZohoSync(branchId)
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
      const result = await triggerZohoSyncAll()
      const okCount = (result.results || []).filter((r: any) => r.status === 'success').length
      const failCount = (result.results || []).filter((r: any) => r.status === 'error').length
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

  const zeroStockCount = rows.filter((r) => r.total <= 0).length
  const visibleRows = filtered.slice(0, visibleCount)

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setVisibleCount(6) }} placeholder="Cari tipe / SKU..." className={inputCls + ' pl-8'} />
        </div>
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
              {rows.length} produk · {zeroStockCount} stok 0
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <Clock size={10} /> {lastSync ? `Diperbarui ${fmtRelative(lastSync)} — dari sync API otomatis` : 'Belum pernah sync'}
            </div>
          </div>
        </div>

        <div className="px-4 py-2 bg-slate-50 text-[11px] text-slate-500 border-b border-slate-100">
          Angka dalam kurung = (stok fisik − ditahan servis). Klik header kolom untuk urutkan.
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400"><Loader2 className="inline animate-spin mr-2" size={14} /> Memuat...</div>
        ) : isDesktopLayout ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
                  <th className="p-3"><SortHeader label="Kategori" sortKeyName="kategori" /></th>
                  <th className="p-3"><SortHeader label="Nama Produk" sortKeyName="name" /></th>
                  {branches.map((b) => {
                    const source = stockSourceForBranch(b.id)
                    const isMine = myBranchId === b.id
                    return (
                      <th key={b.id} className={`p-3 ${isMine ? 'bg-indigo-50/60' : ''}`}>
                        <div className="flex items-center gap-1">
                          <SortHeader label={b.name.length > 10 ? b.name.slice(0, 3).toUpperCase() : b.name.toUpperCase()} sortKeyName={b.id} />
                          {source === 'zoho' && (
                            <button
                              onClick={() => handleSyncBranch(b.id)}
                              disabled={syncingAll || syncingBranch === b.id}
                              title={`Sync ${b.name} dari Zoho`}
                              className="text-slate-300 hover:text-indigo-600 disabled:opacity-50"
                            >
                              {syncingBranch === b.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                            </button>
                          )}
                        </div>
                      </th>
                    )
                  })}
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
                    {branches.map((b) => {
                      const cell = r.perBranch[b.id]
                      const isMine = myBranchId === b.id
                      return (
                        <td key={b.id} className={`p-3 ${isMine ? 'bg-indigo-50/30' : ''}`}>
                          <span className={cell.net < 0 ? 'text-red-600 font-medium' : cell.net === 0 ? 'text-slate-300' : 'text-slate-700 font-medium'}>
                            {cell.net}
                          </span>
                          {cell.held > 0 && <div className="text-[10px] text-slate-400">({cell.physical}-{cell.held})</div>}
                        </td>
                      )
                    })}
                    <td className="p-3 font-semibold text-slate-800">{r.total}</td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={branches.length + 3} className="p-8 text-center text-slate-400">
                      {rows.length === 0 ? 'Belum ada data stok — coba sync dulu.' : 'Tidak ada yang cocok dengan pencarian.'}
                    </td>
                  </tr>
                )}
              </tbody>
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
                  {branches.map((b) => {
                    const cell = r.perBranch[b.id]
                    return (
                      <div key={b.id} className="text-center">
                        <div className="text-[10px] text-slate-400 uppercase">{b.name}</div>
                        <div className={cell.net < 0 ? 'text-red-600 font-semibold' : 'text-slate-700 font-semibold'}>{cell.net}</div>
                      </div>
                    )
                  })}
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
            <button onClick={() => setVisibleCount((v) => v + 5)} className={`px-4 py-2 text-sm ${btnSecondaryCls}`}>
              Muat 5 produk lagi
            </button>
          </div>
        )}
        {filtered.length > 0 && (
          <div className="pb-4 text-center text-xs text-slate-400">
            Menampilkan {Math.min(visibleCount, filtered.length)} dari {filtered.length} produk
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Tab: Stok Supplier ----------
function StokSupplierTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SupplierStockResult[]>([])
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

  async function handleUpload(supplierId: string, resolvedRows: ResolvedSupplierRow[], skippedCount: number) {
    const r = await uploadSupplierStockFile(supplierId, resolvedRows, skippedCount)
    setMessage(`Upload tersimpan — ${r.itemsUpdated} SKU diperbarui${r.itemsSkipped ? `, ${r.itemsSkipped} SKU dilewati (belum dikenali)` : ''}.`)
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

        {!searched && (
          <p className="text-center text-sm text-indigo-600 py-10">Ketik nama produk atau SKU dulu untuk mulai cari stok supplier</p>
        )}
        {searched && !searching && results.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-10">Tidak ada data stok supplier untuk produk ini.</p>
        )}
        {searched && !searching && results.length > 0 && (
          <div className="mt-4 divide-y divide-slate-100">
            {results.map((r, i) => (
              <div key={i} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-700 truncate">{r.supplierName}</div>
                  <div className="text-xs text-slate-400 truncate">
                    {r.productName} · <span className="font-mono">{r.productSku}</span> · update {fmtDateTime(r.updatedAt)}
                  </div>
                </div>
                <span className={`shrink-0 font-semibold ${r.qty <= 0 ? 'text-red-600' : 'text-slate-800'}`}>{r.qty}</span>
              </div>
            ))}
          </div>
        )}
      </div>

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

'use client'

import { useEffect, useState } from 'react'
import { Search, RefreshCw, Clock, CheckCircle2, XCircle, Loader2, Upload, X, PackageSearch } from 'lucide-react'
import {
  loadStockForBranch,
  loadSyncLog,
  loadUploadLog,
  fetchBranchName,
  stockSourceForBranch,
  triggerZohoSync,
  searchSupplierStock,
  uploadSupplierStockPaste,
  uploadBranchStockCorrection,
  type StockRow,
  type SyncLogRow,
  type UploadLogRow,
  type SupplierStockResult,
} from '@/lib/stok/api'

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
                  <span className="font-medium text-slate-700">
                    Upload {log.kind === 'stok_supplier' ? 'Stok Supplier' : 'Koreksi Stok Cabang'}
                  </span>
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

function UploadStokModal({
  activeTab,
  onClose,
  onUploadCabang,
  onUploadSupplier,
}: {
  activeTab: 'cabang' | 'supplier'
  onClose: () => void
  onUploadCabang: (rows: { sku: string; qty: number }[]) => Promise<void>
  onUploadSupplier: (rows: { sku: string; supplierName: string; qty: number }[]) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function parseLines(): string[][] {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => (line.includes('\t') ? line.split('\t') : line.split(',')).map((c) => c.trim()))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const parsed = parseLines()
      if (activeTab === 'cabang') {
        const rows = parsed.filter((c) => c.length >= 2 && c[0]).map((c) => ({ sku: c[0], qty: Number(c[1]) || 0 }))
        if (rows.length === 0) throw new Error('Tidak ada baris valid. Format: SKU, Qty')
        await onUploadCabang(rows)
      } else {
        const rows = parsed
          .filter((c) => c.length >= 3 && c[0] && c[1])
          .map((c) => ({ sku: c[0], supplierName: c[1], qty: Number(c[2]) || 0 }))
        if (rows.length === 0) throw new Error('Tidak ada baris valid. Format: SKU, Nama Supplier, Qty')
        await onUploadSupplier(rows)
      }
      onClose()
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setSubmitting(false)
    }
  }

  const isCabang = activeTab === 'cabang'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={submitting ? undefined : onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="font-semibold text-slate-800">{isCabang ? 'Koreksi Manual Stok Cabang' : 'Upload Stok Supplier'}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {isCabang ? 'Menimpa angka dari Zoho/Accurate untuk SKU yang disebut' : 'Bisa banyak supplier sekaligus dalam satu paste'}
            </p>
          </div>
          <button onClick={onClose} disabled={submitting} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3">
          <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">
            <p className="font-medium text-slate-600 mb-1">
              Paste dari Excel/Sheets langsung bisa (kolom terbaca dari Tab), atau ketik manual pisah pakai koma.
            </p>
            <p className="font-mono text-[11px]">{isCabang ? 'SKU, Qty' : 'SKU, Nama Supplier, Qty'}</p>
            <p className="font-mono text-[11px] text-slate-400 mt-1">
              Contoh: {isCabang ? 'HIK-DVR-4CH, 12' : 'HIK-DVR-4CH, Hikvision SC Jakarta, 12'}
            </p>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            disabled={submitting}
            placeholder="Paste data di sini, satu baris per data..."
            className="w-full rounded-xl border border-slate-200 p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50"
          />
          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-full text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-30">
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !text.trim()}
            className="px-4 py-2 rounded-full text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? 'Menyimpan...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StokCabangTab({
  branchName,
  stock,
  loading,
  query,
  setQuery,
  syncing,
  onSync,
  source,
}: {
  branchName: string
  stock: StockRow[]
  loading: boolean
  query: string
  setQuery: (v: string) => void
  syncing: boolean
  onSync: () => void
  source: 'zoho' | 'accurate' | null
}) {
  const filtered = query.trim()
    ? stock.filter((s) => `${s.name} ${s.sku}`.toLowerCase().includes(query.trim().toLowerCase()))
    : stock

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama produk atau SKU..." className={inputCls + ' pl-8'} />
        </div>
        <button
          onClick={onSync}
          disabled={syncing || source !== 'zoho'}
          title={source !== 'zoho' ? 'Cabang ini belum tersambung ke Zoho Inventory' : undefined}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnPrimaryCls}`}
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {syncing ? 'Menyinkronkan...' : 'Sync dari Zoho'}
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
              <th className="p-3">Produk</th>
              <th className="p-3">SKU</th>
              <th className="p-3">Stok</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-slate-400">
                  <Loader2 className="inline animate-spin mr-2" size={14} /> Memuat...
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((row) => (
                <tr key={row.productId} className="border-b border-slate-50">
                  <td className="p-3">{row.name}</td>
                  <td className="p-3 font-mono text-xs">{row.sku}</td>
                  <td className="p-3">
                    <span className={row.qty <= 0 ? 'text-red-600 font-medium' : 'text-slate-700 font-medium'}>{row.qty}</span>
                  </td>
                </tr>
              ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-slate-400">
                  {stock.length === 0 ? 'Belum ada data stok — coba sync dulu.' : 'Tidak ada yang cocok dengan pencarian.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StokSupplierTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SupplierStockResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

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
      </div>

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
    </div>
  )
}

function StokModuleInner({ currentUserBranchId }: { currentUserBranchId: string | null }) {
  const [activeTab, setActiveTab] = useState<'cabang' | 'supplier'>('cabang')
  const [branchName, setBranchName] = useState('')
  const [stock, setStock] = useState<StockRow[]>([])
  const [syncLogs, setSyncLogs] = useState<SyncLogRow[]>([])
  const [uploadLogs, setUploadLogs] = useState<UploadLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [showRiwayat, setShowRiwayat] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  async function loadAll() {
    if (!currentUserBranchId) return
    setLoading(true)
    try {
      const [name, stockRows, syncRows, upRows] = await Promise.all([
        fetchBranchName(currentUserBranchId),
        loadStockForBranch(currentUserBranchId),
        loadSyncLog(currentUserBranchId),
        loadUploadLog(currentUserBranchId),
      ])
      setBranchName(name)
      setStock(stockRows)
      setSyncLogs(syncRows)
      setUploadLogs(upRows)
    } catch (e: any) {
      setMessage(`Gagal memuat data: ${e?.message || e}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserBranchId])

  const source = stockSourceForBranch(currentUserBranchId)

  async function handleSync() {
    if (!currentUserBranchId) return
    setSyncing(true)
    setMessage(null)
    try {
      const result = await triggerZohoSync(currentUserBranchId)
      const r = result.results?.[0]
      if (r?.status === 'error') setMessage(`Sync gagal: ${r.message}`)
      else if (r) setMessage(`Sync selesai — ${r.itemsUpdated} produk diperbarui${r.itemsSkipped ? `, ${r.itemsSkipped} SKU dilewati` : ''}.`)
      await loadAll()
    } catch (e: any) {
      setMessage(`Sync gagal: ${e?.message || e}`)
    } finally {
      setSyncing(false)
    }
  }

  async function handleUploadCabang(rows: { sku: string; qty: number }[]) {
    if (!currentUserBranchId) return
    const r = await uploadBranchStockCorrection(currentUserBranchId, rows)
    setMessage(`Koreksi tersimpan — ${r.itemsUpdated} produk diperbarui${r.itemsSkipped ? `, ${r.itemsSkipped} baris dilewati` : ''}.`)
    await loadAll()
  }

  async function handleUploadSupplier(rows: { sku: string; supplierName: string; qty: number }[]) {
    const r = await uploadSupplierStockPaste(rows)
    setMessage(`Upload tersimpan — ${r.itemsUpdated} baris diperbarui${r.itemsSkipped ? `, ${r.itemsSkipped} baris dilewati` : ''}.`)
    await loadAll()
  }

  if (!currentUserBranchId) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-slate-500 text-center px-6">
        Akun Anda belum di-assign ke cabang mana pun. Hubungi Super Admin dulu sebelum bisa memakai modul Stok.
      </div>
    )
  }

  return (
    <div className="text-slate-800">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div>
          <h1 className="font-semibold text-lg text-slate-800">Cek Stok</h1>
          <p className="text-xs text-slate-400 mt-0.5">Stok cabang & supplier — {branchName || '...'}</p>
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-full w-fit">
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

      <div className="flex justify-end gap-2 mb-4">
        <button onClick={() => setShowRiwayat(true)} className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnSecondaryCls}`}>
          <Clock size={14} /> Riwayat
        </button>
        <button onClick={() => setShowUpload(true)} className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnPrimaryCls}`}>
          <Upload size={14} /> Upload Stok
        </button>
      </div>

      {message && <div className="mb-4 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-600">{message}</div>}

      {activeTab === 'cabang' ? (
        <StokCabangTab
          branchName={branchName}
          stock={stock}
          loading={loading}
          query={query}
          setQuery={setQuery}
          syncing={syncing}
          onSync={handleSync}
          source={source}
        />
      ) : (
        <StokSupplierTab />
      )}

      {showRiwayat && <RiwayatModal syncLogs={syncLogs} uploadLogs={uploadLogs} onClose={() => setShowRiwayat(false)} />}
      {showUpload && (
        <UploadStokModal
          activeTab={activeTab}
          onClose={() => setShowUpload(false)}
          onUploadCabang={handleUploadCabang}
          onUploadSupplier={handleUploadSupplier}
        />
      )}
    </div>
  )
}

type BranchOption = { id: string; name: string; active?: boolean }

// Super Admin gak terikat 1 cabang (branch_id-nya kosong di profil) —
// jadi dia wajib pilih dulu "lagi lihat stok cabang mana", sama seperti
// pola yang sama di ServisModule. Staf biasa (branch_id sudah pasti
// terisi) langsung masuk ke StokModuleInner tanpa layar pilih ini.
export default function StokModule({ currentUserRole, currentUserBranchId }: StokModuleProps) {
  const isSuperAdmin = currentUserRole === 'super_admin'
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [activeBranchId, setActiveBranchId] = useState<string | null>(isSuperAdmin ? null : currentUserBranchId)
  const [activeBranchName, setActiveBranchName] = useState<string | null>(null)

  useEffect(() => {
    if (!isSuperAdmin) return
    fetch('/api/branches')
      .then((res) => res.json())
      .then((body) => setBranches((body.branches ?? []).filter((b: BranchOption) => b.active !== false)))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin])

  if (isSuperAdmin && !activeBranchId) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full">
          <p className="font-medium text-slate-800 mb-1">Pilih Cabang</p>
          <p className="text-sm text-slate-500 mb-4">Pilih cabang yang mau dilihat/dikelola stoknya.</p>
          <div className="flex flex-col gap-2">
            {branches.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setActiveBranchId(b.id)
                  setActiveBranchName(b.name)
                }}
                className="w-full px-4 py-2.5 text-sm rounded-2xl border border-slate-200 hover:bg-slate-50 text-left text-slate-700"
              >
                {b.name}
              </button>
            ))}
            {branches.length === 0 && <p className="text-xs text-slate-400">Memuat daftar cabang…</p>}
          </div>
        </div>
      </div>
    )
  }

  if (!activeBranchId) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-slate-500 text-center px-6">
        Akun Anda belum di-assign ke cabang mana pun. Hubungi Super Admin dulu sebelum bisa memakai modul Stok.
      </div>
    )
  }

  return (
    <div>
      {isSuperAdmin && (
        <button
          onClick={() => {
            setActiveBranchId(null)
            setActiveBranchName(null)
          }}
          className="mb-3 text-xs text-slate-400 hover:text-indigo-600 underline underline-offset-2"
        >
          Ganti cabang{activeBranchName ? ` (sekarang: ${activeBranchName})` : ''}
        </button>
      )}
      <StokModuleInner currentUserBranchId={activeBranchId} />
    </div>
  )
}

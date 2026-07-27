'use client'

import { useEffect, useState } from 'react'
import { Search, RefreshCw, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import {
  loadStockForBranch,
  loadSyncLog,
  fetchBranchName,
  stockSourceForBranch,
  triggerZohoSync,
  type StockRow,
  type SyncLogRow,
} from '@/lib/stok/api'

type StokModuleProps = {
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

function RiwayatModal({ logs, onClose }: { logs: SyncLogRow[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-start sm:items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Riwayat Sinkronisasi</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-2">
          {logs.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Belum ada riwayat sinkronisasi.</p>}
          {logs.map((log) => (
            <div key={log.id} className="border border-slate-200 rounded-2xl p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-slate-700 capitalize">{log.source}</span>
                <SyncStatusBadge status={log.status} />
              </div>
              <div className="text-xs text-slate-400 mb-1">
                {fmtDateTime(log.startedAt)} · dipicu {log.triggeredBy === 'manual' ? 'manual' : 'otomatis (terjadwal)'}
              </div>
              {log.status === 'success' && (
                <div className="text-xs text-slate-600">
                  {log.itemsUpdated} produk diperbarui
                  {log.itemsSkipped > 0 ? `, ${log.itemsSkipped} SKU dilewati (belum ada di katalog produk)` : ''}
                </div>
              )}
              {log.status === 'error' && log.errorMessage && (
                <div className="text-xs text-red-600 mt-1 break-words">{log.errorMessage}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function StokModule({ currentUserBranchId }: StokModuleProps) {
  const [branchName, setBranchName] = useState('')
  const [stock, setStock] = useState<StockRow[]>([])
  const [logs, setLogs] = useState<SyncLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [showRiwayat, setShowRiwayat] = useState(false)

  async function loadAll() {
    if (!currentUserBranchId) return
    setLoading(true)
    try {
      const [name, stockRows, logRows] = await Promise.all([
        fetchBranchName(currentUserBranchId),
        loadStockForBranch(currentUserBranchId),
        loadSyncLog(currentUserBranchId),
      ])
      setBranchName(name)
      setStock(stockRows)
      setLogs(logRows)
    } catch (e: any) {
      setSyncMessage(`Gagal memuat data: ${e?.message || e}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserBranchId])

  const source = stockSourceForBranch(branchName)

  async function handleSync() {
    if (!branchName) return
    setSyncing(true)
    setSyncMessage(null)
    try {
      const result = await triggerZohoSync(branchName)
      const r = result.results?.[0]
      if (r?.status === 'error') {
        setSyncMessage(`Sync gagal: ${r.message}`)
      } else if (r) {
        setSyncMessage(`Sync selesai — ${r.itemsUpdated} produk diperbarui${r.itemsSkipped ? `, ${r.itemsSkipped} SKU dilewati` : ''}.`)
      }
      await loadAll()
    } catch (e: any) {
      setSyncMessage(`Sync gagal: ${e?.message || e}`)
    } finally {
      setSyncing(false)
    }
  }

  const filtered = query.trim()
    ? stock.filter((s) => `${s.name} ${s.sku}`.toLowerCase().includes(query.trim().toLowerCase()))
    : stock

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
          <h1 className="font-semibold text-lg text-slate-800">Stok — {branchName || '...'}</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {source === 'zoho'
              ? 'Tersambung ke Zoho Inventory'
              : source === 'accurate'
                ? 'Belum tersambung — direncanakan pakai Accurate Online'
                : 'Belum ada sumber sinkronisasi untuk cabang ini'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama produk atau SKU..."
            className={inputCls + ' pl-8'}
          />
        </div>
        <button onClick={() => setShowRiwayat(true)} className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnSecondaryCls}`}>
          <Clock size={14} /> Riwayat
        </button>
        <button
          onClick={handleSync}
          disabled={syncing || source !== 'zoho'}
          title={source !== 'zoho' ? 'Cabang ini belum tersambung ke Zoho Inventory' : undefined}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnPrimaryCls}`}
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {syncing ? 'Menyinkronkan...' : 'Sync dari Zoho'}
        </button>
      </div>

      {syncMessage && (
        <div className="mb-4 p-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-600">{syncMessage}</div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
              <th className="p-3">Produk</th>
              <th className="p-3">SKU</th>
              <th className="p-3">Stok</th>
              <th className="p-3">Terakhir Update</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-400">
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
                  <td className="p-3 whitespace-nowrap text-xs text-slate-400">{fmtDateTime(row.updatedAt)}</td>
                </tr>
              ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-400">
                  {stock.length === 0 ? 'Belum ada data stok — coba sync dulu.' : 'Tidak ada yang cocok dengan pencarian.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showRiwayat && <RiwayatModal logs={logs} onClose={() => setShowRiwayat(false)} />}
    </div>
  )
}

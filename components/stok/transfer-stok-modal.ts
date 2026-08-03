'use client'

// Komponen: Modal "Transfer Stok Antar Cabang" + tabel riwayatnya.
// Cara pasang: import komponen ini di components/stok/stok-module.tsx,
// taruh tombol buat buka modal ini di sebelah tombol "Sync Semua" yang
// sudah ada (contoh pemasangan ada di catatan bawah file ini).

import { useEffect, useState } from 'react'
import { ArrowRightLeft, X, Loader2, Search } from 'lucide-react'
import {
  loadBranchesForTransfer,
  searchProductsForTransfer,
  createStockTransfer,
  loadTransferHistory,
  type TransferRow,
} from '@/lib/stok/transfer-api'

const inputCls =
  'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400'
const btnPrimaryCls =
  'rounded-full bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-40 px-4 py-2 text-sm'
const btnSecondaryCls =
  'rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-medium px-4 py-2 text-sm'

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function TransferStokButton({ onSaved }: { onSaved?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className={btnSecondaryCls + ' inline-flex items-center gap-1.5'}>
        <ArrowRightLeft className="w-4 h-4" />
        Transfer Stok
      </button>
      {open && <TransferStokModal onClose={() => setOpen(false)} onSaved={onSaved} />}
    </>
  )
}

function TransferStokModal({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const [tab, setTab] = useState<'form' | 'riwayat'>('form')
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [history, setHistory] = useState<TransferRow[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    loadBranchesForTransfer().then(setBranches).catch(() => {})
  }, [])

  const refreshHistory = () => {
    setLoadingHistory(true)
    loadTransferHistory()
      .then(setHistory)
      .finally(() => setLoadingHistory(false))
  }

  useEffect(() => {
    if (tab === 'riwayat') refreshHistory()
  }, [tab])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Transfer Stok Antar Cabang</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 px-5">
          <button
            onClick={() => setTab('form')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === 'form' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'
            }`}
          >
            Catat Transfer
          </button>
          <button
            onClick={() => setTab('riwayat')}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === 'riwayat' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'
            }`}
          >
            Riwayat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'form' ? (
            <TransferForm
              branches={branches}
              onSuccess={() => {
                setTab('riwayat')
                onSaved?.()
              }}
            />
          ) : (
            <HistoryList rows={history} loading={loadingHistory} />
          )}
        </div>
      </div>
    </div>
  )
}

function TransferForm({
  branches,
  onSuccess,
}: {
  branches: { id: string; name: string }[]
  onSuccess: () => void
}) {
  const [fromBranchId, setFromBranchId] = useState('')
  const [toBranchId, setToBranchId] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [productResults, setProductResults] = useState<{ id: string; sku: string; name: string }[]>([])
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; sku: string; name: string } | null>(null)
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    if (productQuery.trim().length < 2) {
      setProductResults([])
      return
    }
    const timer = setTimeout(() => {
      searchProductsForTransfer(productQuery).then(setProductResults).catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [productQuery])

  const canSubmit =
    fromBranchId && toBranchId && fromBranchId !== toBranchId && selectedProduct && Number(qty) > 0 && !submitting

  async function handleSubmit() {
    if (!canSubmit || !selectedProduct) return
    setSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await createStockTransfer({
        fromBranchId,
        toBranchId,
        productId: selectedProduct.id,
        qty: Number(qty),
        note: note.trim() || undefined,
      })
      setSuccessMsg(`Berhasil dicatat: ${qty} ${selectedProduct.name} dari cabang asal ke tujuan.`)
      // Reset form biar siap input berikutnya (transfer sering banyak produk sekaligus).
      setSelectedProduct(null)
      setProductQuery('')
      setQty('')
      setNote('')
      setTimeout(onSuccess, 900)
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal mencatat transfer.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Cabang Asal</label>
          <select value={fromBranchId} onChange={(e) => setFromBranchId(e.target.value)} className={inputCls}>
            <option value="">Pilih cabang...</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Cabang Tujuan</label>
          <select value={toBranchId} onChange={(e) => setToBranchId(e.target.value)} className={inputCls}>
            <option value="">Pilih cabang...</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {fromBranchId && toBranchId && fromBranchId === toBranchId && (
        <p className="text-xs text-red-600">Cabang asal dan tujuan harus beda.</p>
      )}

      <div className="relative">
        <label className="block text-xs font-medium text-slate-600 mb-1">Produk</label>
        {selectedProduct ? (
          <div className="flex items-center justify-between border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-slate-50">
            <span>
              {selectedProduct.sku} — {selectedProduct.name}
            </span>
            <button
              onClick={() => {
                setSelectedProduct(null)
                setProductQuery('')
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" />
              <input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Cari SKU / nama produk..."
                className={inputCls + ' pl-8'}
              />
            </div>
            {productResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {productResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProduct(p)
                      setProductResults([])
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                  >
                    <span className="text-slate-500">{p.sku}</span> — {p.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Jumlah</label>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="0"
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Catatan (opsional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="misal: No. surat jalan" className={inputCls} />
      </div>

      {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
      {successMsg && <p className="text-sm text-green-600">{successMsg}</p>}

      <button onClick={handleSubmit} disabled={!canSubmit} className={btnPrimaryCls + ' w-full flex items-center justify-center gap-2'}>
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        Catat Transfer
      </button>
    </div>
  )
}

function HistoryList({ rows, loading }: { rows: TransferRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 text-center py-10">Belum ada transfer yang dicatat.</p>
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-900">
              {r.fromBranchName} <ArrowRightLeft className="w-3 h-3 inline mx-1 text-slate-400" /> {r.toBranchName}
            </span>
            <span className="text-slate-500 text-xs">{fmtDateTime(r.createdAt)}</span>
          </div>
          <p className="text-slate-600 mt-0.5">
            {r.qty}x {r.sku} — {r.productName}
          </p>
          {r.note && <p className="text-slate-400 text-xs mt-0.5">"{r.note}"</p>}
        </div>
      ))}
    </div>
  )
}

// =====================================================
// CATATAN CARA PASANG di components/stok/stok-module.tsx:
//
// 1. Tambah import di bagian atas file:
//      import { TransferStokButton } from './transfer-stok-modal'
//
// 2. Taruh <TransferStokButton /> di baris yang sama dengan tombol
//    "Sync Semua" yang sudah ada, contoh:
//      <div className="flex items-center gap-2">
//        <TransferStokButton />
//        <button onClick={...}>Sync Semua</button>
//      </div>
//
// 3. Buat munculin kolom "-K" di tabel Daftar Stok Cabang, panggil
//    loadTransferBalanceMatrix() dari lib/stok/transfer-api.ts di
//    tempat yang sama waktu stok-module.tsx manggil loadStockMatrix()
//    dari lib/stok/api.ts, lalu render 1 kolom tambahan per cabang
//    yang isinya matrix.get(branchId)?.get(productId) ?? 0.
//    Bagian ini saya belum sambungkan otomatis karena perlu lihat
//    persis struktur tabel yang sudah ada di stok-module.tsx supaya
//    gak salah taruh — kalau mau, kirim potongan kode bagian render
//    tabelnya, saya bantu sambungkan persis.
// =====================================================

'use client'

// =====================================================
// Kalkulator estimasi Maintenance CCTV -- alat bantu INTERNAL buat staff
// ngasih gambaran harga ke customer (mendukung multi-lokasi).
//
// File aslinya (kalkulator-maintenance-workspace.html) adalah aplikasi
// React MANDIRI yang sudah di-bundle jadi 1 file HTML utuh. Di-embed
// lewat <iframe>, BUKAN ditulis ulang manual -- nulis ulang dari kode
// yang sudah di-minify beresiko salah baca formula harga (ini alat
// hitung harga BENERAN dipakai buat kasih penawaran ke customer).
// Lewat iframe, logic-nya dijamin 100% sama persis kayak file aslinya.
//
// Dua penyesuaian visual yang di-suntik lewat JS (AMAN, gak lewat
// CORS karena file-nya satu domain sama app kita, dan SAMA SEKALI
// GAK NYENTUH logic/JS aslinya):
//  1. Sembunyiin panel .ledger-sidebar bawaan file itu (biar gak
//     kesannya "app di dalam app" -- app kita udah punya sidebar
//     sendiri) & perkecil beberapa badge yang kegedean, samain warna
//     tombol biar konsisten sama app.
//  2. Auto-height: iframe-nya NGIKUTIN tinggi konten di dalamnya --
//     TIDAK ADA scroll sendiri di dalam iframe, yang scroll cuma
//     halaman app kita aja (1 scrollbar, bukan dobel).
//
// 2026-09 -- 3 tambahan (detail & alasan ada di
// lib/kalkulator/kalkulator-enhance.ts):
//  a. KOP SURAT quotation sekarang = kop app Penawaran (data cabang
//     Jakarta dari Info Cabang), dengan pilihan kop PPN / Non-PPN.
//  b. Tab langkah (1 Data proyek ... 4 Quotation) tampil juga di desktop
//     -- sebelumnya cuma ada di mobile karena sidebar (tempat navigasi
//     desktop) disembunyiin di sini.
//  c. MODE CUSTOMER: cuma dokumen quotation yang tampil (tanpa margin,
//     biaya, dan pengaturan internal) -- aman diperlihatkan ke customer.
//  d. Fix auto-height: iframe sekarang bisa MENGECIL lagi (sebelumnya
//     cuma bisa membesar karena tinggi ukurannya ikut tinggi iframe
//     itu sendiri) -- perlu supaya Mode Customer nggak ninggalin ruang
//     kosong panjang di bawah dokumen.
// =====================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { getBranch } from '@/lib/quote-builder/api'
import { LOGO_NON_PPN_BASE64, LOGO_PPN_BASE64 } from '@/components/quote-builder/QuoteEditorPage'
import {
  installEnhancements,
  resolveKop,
  type EnhanceState,
  type Enhancer,
  type KopBranch,
  type KopMode,
} from '@/lib/kalkulator/kalkulator-enhance'

// Kalkulator ini cuma dipakai cabang Jakarta (lihat `jakartaOnly` di lib/nav-config.tsx),
// jadi kopnya selalu data cabang Jakarta. (Konstanta yang sama sudah ada di nav-config,
// stok-module, dan price-list-sync -- sengaja tidak diekspor dari satu tempat, ikut pola yang ada.)
const JAKARTA_BRANCH_ID = '5ad7239f-a7dd-47be-9ba2-c5667a3f76b2'
const KOP_STORAGE_KEY = 'kalkulator-maintenance-kop'

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
              selected ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-800'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default function KalkulatorMaintenance() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const enhancerRef = useRef<Enhancer | null>(null)
  const [breakoutStyle, setBreakoutStyle] = useState<React.CSSProperties>({})

  const [kop, setKop] = useState<KopMode>('ppn')
  const [branch, setBranch] = useState<KopBranch | null>(null)
  const [branchState, setBranchState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [branchError, setBranchError] = useState('')

  // "Tampilan: Internal/Customer" DIHAPUS dari sini (2026-09-29, permintaan
  // user) -- dipindahkan jadi fitur Kalkulator Paket (lihat
  // components/paket-cctv/KalkulatorPage.tsx), yang implementasinya lebih
  // sederhana di situ (render React langsung, bukan suntik DOM ke iframe
  // beku). `view` di EnhanceState dikunci 'internal' terus -- kop surat &
  // tab langkah desktop (2 fitur lain di kalkulator-enhance.ts) TETAP jalan.
  const enhanceState: EnhanceState = { kop, view: 'internal', branch, fallbackLogoPpn: LOGO_PPN_BASE64, fallbackLogoNonPpn: LOGO_NON_PPN_BASE64 }
  const stateRef = useRef<EnhanceState>(enhanceState)
  // Harus didefinisikan SEBELUM effect refresh di bawah (effect jalan berurutan) supaya refresh membaca state terbaru.
  useEffect(() => {
    stateRef.current = enhanceState
  })

  // Pilihan kop diingat (per browser). Mode tampilan SENGAJA tidak diingat -- selalu mulai dari Internal.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KOP_STORAGE_KEY)
      if (saved === 'ppn' || saved === 'nonppn') setKop(saved)
    } catch {
      // storage diblokir -- pakai default
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getBranch(JAKARTA_BRANCH_ID)
      .then((row) => {
        if (cancelled) return
        setBranch(row as KopBranch)
        setBranchState('ready')
      })
      .catch((err: Error) => {
        if (cancelled) return
        setBranchError(err.message)
        setBranchState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Pilihan kop / data cabang berubah -> terapkan ulang ke dokumen iframe.
  useEffect(() => {
    enhancerRef.current?.refresh()
  }, [kop, branch])

  const changeKop = useCallback((next: KopMode) => {
    setKop(next)
    try {
      window.localStorage.setItem(KOP_STORAGE_KEY, next)
    } catch {
      // abaikan
    }
  }, [])

  // Breakout dari padding kiri-kanan shell app -- DIUKUR OTOMATIS dari
  // padding elemen induknya (bukan nebak angka vh/rem kayak sebelumnya,
  // yang kemarin kelewat gede & bikin overflow horizontal / scrollbar
  // di bawah). Jadi presisi pas berapa pun padding shell-nya.
  useEffect(() => {
    function updateBreakout() {
      const parent = wrapperRef.current?.parentElement
      if (!parent) return
      const cs = window.getComputedStyle(parent)
      const pl = parseFloat(cs.paddingLeft) || 0
      const pr = parseFloat(cs.paddingRight) || 0
      setBreakoutStyle({ marginLeft: -pl, marginRight: -pr, width: `calc(100% + ${pl + pr}px)` })
    }
    updateBreakout()
    window.addEventListener('resize', updateBreakout)
    return () => window.removeEventListener('resize', updateBreakout)
  }, [])

  useEffect(() => () => enhancerRef.current?.dispose(), [])

  function setupIframe() {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!iframe || !doc) return

    try {
      const style = doc.createElement('style')
      style.textContent = `
        .ledger-sidebar { display: none !important; }
        /* .app-shell aslinya min-height:100vh (= tinggi iframe itu sendiri) --
           bikin tinggi konten nggak pernah bisa lebih kecil dari tinggi iframe
           yang sekarang, jadi auto-height cuma bisa membesar. Dilepas. */
        .app-shell { min-height: 0 !important; }
        .decision-cockpit { min-height: 64px !important; margin: 10px 0 14px !important; }
        .cockpit-price strong, .cockpit-metric strong { font-size: 16px !important; }
        .cockpit-price small, .cockpit-metric small,
        .cockpit-price span, .cockpit-metric span { font-size: 8px !important; }
        .cockpit-stamp strong { font-size: 10px !important; }
        .hero-signal { padding: 8px !important; }
        .hero-signal strong { font-size: 14px !important; margin: 1px 0 !important; }
        .hero-signal span { font-size: 8px !important; }
        .hero-signal small { font-size: 9px !important; }
        .signal-icon { width: 30px !important; height: 30px !important; flex-basis: 30px !important; }
        /* Perbesar teks yang paling sering dibaca -- override
           per-elemen (bukan zoom global lagi, itu kemarin bikin
           perhitungan tinggi/scroll iframe jadi meleset). */
        body { font-size: 16px !important; }
        input, select, textarea, button { font-size: 15px !important; }
        label, .field-label, td, th, li, p { font-size: 14px !important; }
        h1, h2, h3 { font-size: 1.25em !important; }
        .hero-signal strong { font-size: 17px !important; }
        .hero-signal span, .hero-signal small { font-size: 11px !important; }
        .cockpit-price strong { font-size: 26px !important; }
        .cockpit-metric strong { font-size: 20px !important; }
        .cockpit-price small, .cockpit-metric small,
        .cockpit-price span, .cockpit-metric span { font-size: 11px !important; }
        .cockpit-signals { font-size: 11px !important; }
        .step-tabs, .payment-choice, .payment-choice b { font-size: 13px !important; }
        .quote-summary-tag, .quote-summary-label { font-size: 12px !important; }
        /* Ronde 2 -- kelas <span>/<div> kecil yang kelewat dari
           override generik (body/label/td/dst) sebelumnya, soalnya
           itu cuma nyasar ke TAG tertentu, gak nyentuh class span/div
           custom kayak ini. Cuma bagian wizard/UI interaktif yang
           dibenerin -- bagian dokumen quotation final (buat
           di-print/kirim customer) SENGAJA dibiarin, sama kayak
           keputusan warna sebelumnya (dokumen resmi wajar beda
           konvensi ukuran dari UI app). */
        .eyebrow { font-size: 12px !important; }
        .crumb { font-size: 12px !important; }
        .decision-caption { font-size: 12px !important; }
        .decision-top { font-size: 11px !important; }
        .decision-tier { font-size: 12px !important; }
        .hero-copy { font-size: 13px !important; }
        .tier-card-top { font-size: 11px !important; }
        .tier-sub { font-size: 11px !important; }
        .date-helper { font-size: 12px !important; }
        .margin-note { font-size: 12px !important; }
        .location-note { font-size: 12px !important; }
        .top-actions { font-size: 12px !important; }
        /* Samain warna tombol biar konsisten sama app (indigo-600,
           bukan navy/gold bawaan file ini). */
        .print-button { background: #4f46e5 !important; color: #fff !important; }
        .add-location { background: #eef2ff !important; color: #4f46e5 !important; }
        .step-next { background: #4f46e5 !important; }
        .step-next:hover { background: #4338ca !important; }
        .step-back { background: #eef2ff !important; color: #4f46e5 !important; }
        /* Kotak "Decision Ledger" (.decision-cockpit) tadinya blok
           navy solid gede -- beda total sama gaya app kamu yang
           kartu putih + aksen warna pastel lembut (lihat kartu-kartu
           di Dashboard: background putih, ikon di badge bulat warna
           muda). Diubah jadi kartu putih dengan border kiri indigo,
           teks gelap -- MURNI visual, gak nyentuh logic/angka. */
        .decision-cockpit {
          background: #fff !important;
          color: #1e293b !important;
          border: 1px solid #e5e7eb !important;
          border-left: 4px solid #4f46e5 !important;
          box-shadow: 0 1px 2px rgba(0,0,0,.05) !important;
        }
        .decision-cockpit strong { color: #1e1b4b !important; }
        .cockpit-price strong { color: #4f46e5 !important; }
        .cockpit-price span, .cockpit-metric span { color: #6366f1 !important; }
        .cockpit-price small, .cockpit-metric small { color: #64748b !important; }
        .cockpit-price, .cockpit-metric, .cockpit-signals { border-right-color: #e5e7eb !important; }
        .cockpit-signals { color: #64748b !important; border-color: #e5e7eb !important; }
        .cockpit-signals i { background: #4f46e5 !important; }
        .signal-icon { background: #eef2ff !important; color: #4f46e5 !important; }
        .hero-signal { background: #eef2ff !important; }
        .hero-signal strong { color: #1e1b4b !important; }
        .hero-signal span, .hero-signal small { color: #4f46e5 !important; }
        .decision-cockpit.healthy .cockpit-metric:nth-of-type(4) strong { color: #16a34a !important; }
        .decision-cockpit.risk .cockpit-metric:nth-of-type(4) strong { color: #dc2626 !important; }
        .decision-cockpit.watch .cockpit-metric:nth-of-type(4) strong { color: #d97706 !important; }
        /* Tab "Tahunan (Lunas)/6 Bulanan/Quarterly" pas ke-pilih, dan
           tombol paket yang ke-pilih -- ini bagian UI INTERNAL staff,
           beda dari styling dokumen quotation final (.quote-*,
           .print-quote, .comparison-*) yang SENGAJA dibiarin navy
           karena itu bukan tampilan app, tapi dokumen resmi buat
           customer. */
        .payment-choice.active { background: #4f46e5 !important; color: #fff !important; }
        .regular-package-actions button.active { background: #4f46e5 !important; color: #fff !important; }
        html, body { overflow: visible !important; }
      `
      doc.head.appendChild(style)
    } catch {
      // Gagal suntik CSS gapapa -- lanjut ke auto-height di bawah.
    }

    // Pasang kop surat / tab desktop (lihat lib/kalkulator/kalkulator-enhance.ts).
    enhancerRef.current?.dispose()
    enhancerRef.current = installEnhancements(doc, () => stateRef.current)

    function resize() {
      if (!iframe || !doc) return
      // Ukur tinggi konten SEBENARNYA lewat <body> (scrollHeight dokumen nggak pernah
      // lebih kecil dari tinggi iframe sendiri, jadi dulu iframe hanya bisa membesar).
      const h = Math.ceil(doc.body?.getBoundingClientRect().height || 0)
      if (h > 0) iframe.style.height = h + 'px'
    }
    resize()

    // Pantau perubahan ukuran konten (user isi form, tambah lokasi,
    // dst) biar tinggi iframe terus nyesuain -- gak numpuk jadi
    // scroll internal, tetap cuma 1 scrollbar (punya app).
    try {
      const ro = new ResizeObserver(resize)
      ro.observe(doc.body)
    } catch {
      // ResizeObserver gak tersedia (browser sangat lama) -- iframe
      // tetap kepasang tinggi awalnya, gapapa buat fallback.
    }
  }

  // Ringkasan status kop untuk baris info di bawah kontrol.
  const kopLabel = kop === 'ppn' ? 'PPN' : 'Non-PPN'
  let statusTone: 'muted' | 'warn' = 'muted'
  let statusText = ''
  if (branchState === 'loading') {
    statusText = 'Memuat kop cabang…'
  } else if (branchState === 'error') {
    statusTone = 'warn'
    statusText = `Kop cabang gagal dimuat (${branchError || 'tidak diketahui'}) — memakai kop bawaan kalkulator.`
  } else {
    const resolved = resolveKop(enhanceState)
    const missing = [!resolved.storeName && 'nama toko', !resolved.phone && 'telepon', !resolved.email && 'email', !resolved.address && 'alamat'].filter(Boolean)
    if (missing.length > 0) {
      statusTone = 'warn'
      statusText = `Kop ${kopLabel} belum lengkap (${missing.join(', ')}) — isi di menu Penawaran › Info Cabang.`
    } else {
      statusText = `Kop ${kopLabel}: ${resolved.storeName}${resolved.isBanner ? ' (logo banner)' : ''}`
    }
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Kop surat</span>
          <Segmented<KopMode>
            label="Kop surat quotation"
            value={kop}
            onChange={changeKop}
            options={[
              { value: 'nonppn', label: 'Non-PPN' },
              { value: 'ppn', label: 'PPN' },
            ]}
          />
        </div>

        <p className={`min-w-0 flex-1 text-xs ${statusTone === 'warn' ? 'text-amber-700' : 'text-slate-500'}`}>{statusText}</p>
      </div>

      <div ref={wrapperRef} style={breakoutStyle}>
        <iframe
          ref={iframeRef}
          onLoad={setupIframe}
          src="/kalkulator-maintenance-workspace.html"
          title="Kalkulator Estimasi Maintenance CCTV"
          className="block w-full border-0"
        />
      </div>
    </>
  )
}

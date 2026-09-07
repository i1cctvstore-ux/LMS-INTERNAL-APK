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
//     sendiri) & perkecil beberapa badge yang kegedean.
//  2. Auto-height: iframe-nya dibikin NGIKUTIN tinggi konten di
//     dalamnya (bukan tinggi tetap) -- jadi TIDAK ADA scroll sendiri
//     di dalam iframe, yang scroll cuma halaman app kita aja (1
//     scrollbar, bukan dobel). Tinggi ini terus dipantau
//     (ResizeObserver) supaya tetap pas walau kontennya berubah pas
//     user isi form/tambah lokasi.
// =====================================================

import { useEffect, useRef, useState } from 'react'

export default function KalkulatorMaintenance() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [breakoutStyle, setBreakoutStyle] = useState<React.CSSProperties>({})

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

  function setupIframe() {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!iframe || !doc) return

    try {
      const style = doc.createElement('style')
      style.textContent = `
        .ledger-sidebar { display: none !important; }
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
        html, body { overflow: visible !important; }
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
      `
      doc.head.appendChild(style)
    } catch {
      // Gagal suntik CSS gapapa -- lanjut ke auto-height di bawah.
    }

    function resize() {
      if (!iframe) return
      const body = doc.body
      const html = doc.documentElement
      const h = Math.max(body?.scrollHeight || 0, html?.scrollHeight || 0, body?.offsetHeight || 0, html?.offsetHeight || 0)
      if (h > 0) iframe.style.height = h + 'px'
    }
    resize()

    // Pantau perubahan ukuran konten (user isi form, tambah lokasi,
    // dst) biar tinggi iframe terus nyesuain -- gak numpuk jadi
    // scroll internal.
    try {
      const ro = new ResizeObserver(resize)
      ro.observe(doc.body)
    } catch {
      // ResizeObserver gak tersedia (browser sangat lama) -- iframe
      // tetap kepasang tinggi awalnya, gapapa buat fallback.
    }
  }

  return (
    <div ref={wrapperRef} style={breakoutStyle}>
      <iframe
        ref={iframeRef}
        onLoad={setupIframe}
        src="/kalkulator-maintenance-workspace.html"
        title="Kalkulator Estimasi Maintenance CCTV"
        className="block w-full border-0"
      />
    </div>
  )
}

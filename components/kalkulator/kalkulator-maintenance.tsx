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

import { useRef } from 'react'

export default function KalkulatorMaintenance() {
  const iframeRef = useRef<HTMLIFrameElement>(null)

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
    <iframe
      ref={iframeRef}
      onLoad={setupIframe}
      src="/kalkulator-maintenance-workspace.html"
      title="Kalkulator Estimasi Maintenance CCTV"
      className="block w-full border-0"
    />
  )
}

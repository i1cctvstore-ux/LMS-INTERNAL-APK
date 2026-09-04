'use client'

// =====================================================
// Kalkulator estimasi Maintenance CCTV -- alat bantu INTERNAL buat staff
// ngasih gambaran harga ke customer (mendukung multi-lokasi).
//
// File aslinya (kalkulator-maintenance-workspace.html) adalah aplikasi
// React MANDIRI yang sudah di-bundle jadi 1 file HTML utuh (React +
// ReactDOM + logic hitung harga yang cukup rumit -- multi-lokasi,
// beberapa komponen biaya per visit). Di-embed lewat <iframe>, BUKAN
// ditulis ulang manual -- nulis ulang dari kode yang sudah di-minify
// beresiko salah baca formula harga (ini alat hitung harga BENERAN
// dipakai buat kasih penawaran ke customer, jadi salah dikit bisa
// bikin salah kasih harga). Lewat iframe, logic-nya dijamin 100% sama
// persis kayak file aslinya.
//
// Supaya gak kelihatan kayak "app di dalam app" (sidebar kita di kiri
// luar, sidebar bawaan file ini juga ada lagi di kiri iframe), kita
// suntik 1 baris CSS ke DALAM iframe-nya lewat JS (aman, gak lewat
// CORS, karena file ini di-hosting satu domain sama app kita) buat
// nyembunyiin panel .ledger-sidebar bawaan file itu doang -- SAMA
// SEKALI GAK NYENTUH logic/JS-nya, cuma nyembunyiin 1 elemen visual.
// .app-shell di file itu display:flex, jadi begitu .ledger-sidebar
// disembunyiin, .workspace (konten utama) otomatis melebar sendiri
// ngisi ruang kosongnya -- gak perlu atur css lain.
// =====================================================

// Tinggi iframe dihitung OTOMATIS lewat JS (bukan angka vh yang
// ditebak) -- diukur dari posisi pasti elemen ini ke bawah layar,
// jadi dijamin pas berapa pun tinggi header/padding bawaan app kamu,
// tanpa perlu tau angka persisnya. Ini juga yang bikin halaman utama
// (di LUAR iframe) gak ikut-ikutan scroll lagi -- sebelumnya pakai
// 92vh yang kadang dikit kelebihan dari ruang yang beneran tersedia.
import { useEffect, useRef, useState } from 'react'

export default function KalkulatorMaintenance() {
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState<number | null>(null)

  useEffect(() => {
    function updateHeight() {
      const el = containerRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      setHeight(Math.max(300, window.innerHeight - top - 8))
    }
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  function hideEmbeddedSidebar() {
    try {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return
      const style = doc.createElement('style')
      style.textContent = `
        .ledger-sidebar { display: none !important; }
        /* Kotak "Decision Ledger" (hero-signal) & bar harga navy
           (decision-cockpit) di halaman ini ukurannya kegedean
           dibanding elemen app kita yang lain -- diperkecil di sini,
           MURNI ukuran visual doang, gak nyentuh angka/logic-nya. */
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
      `
      doc.head.appendChild(style)
    } catch {
      // Kalau gagal (mis. browser lama), gapapa -- iframe tetap
      // tampil normal, cuma sidebar bawaannya gak kesembunyiin.
    }
  }

  return (
    <div ref={containerRef} className="w-full overflow-hidden" style={{ height: height ?? '80vh' }}>
      <iframe
        ref={iframeRef}
        onLoad={hideEmbeddedSidebar}
        src="/kalkulator-maintenance-workspace.html"
        title="Kalkulator Estimasi Maintenance CCTV"
        className="h-full w-full border-0"
      />
    </div>
  )
}

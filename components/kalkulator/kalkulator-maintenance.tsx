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

import { useRef } from 'react'

export default function KalkulatorMaintenance() {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  function hideEmbeddedSidebar() {
    try {
      const doc = iframeRef.current?.contentDocument
      if (!doc) return
      const style = doc.createElement('style')
      style.textContent = '.ledger-sidebar { display: none !important; }'
      doc.head.appendChild(style)
    } catch {
      // Kalau gagal (mis. browser lama), gapapa -- iframe tetap
      // tampil normal, cuma sidebar bawaannya gak kesembunyiin.
    }
  }

  return (
    <div className="h-[92vh] w-full overflow-hidden">
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

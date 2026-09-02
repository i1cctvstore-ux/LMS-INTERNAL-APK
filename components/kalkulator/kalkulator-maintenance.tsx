'use client'

// =====================================================
// Kalkulator estimasi Maintenance CCTV -- alat bantu INTERNAL buat staff
// ngasih gambaran harga ke customer (mendukung multi-lokasi).
//
// File aslinya (kalkulator-maintenance-workspace.html) adalah aplikasi
// React MANDIRI yang sudah di-bundle jadi 1 file HTML utuh (React +
// ReactDOM ikut ke-bundle di dalamnya). Sengaja DI-EMBED APA ADANYA
// lewat <iframe>, BUKAN ditulis ulang manual jadi komponen React biasa
// -- soalnya logic hitung harganya udah lumayan rumit (multi-lokasi,
// beberapa aturan harga), dan nulis ulang manual dari kode yang sudah
// di-minify beresiko salah baca angka/aturan. Lewat iframe, logic-nya
// dijamin 100% sama persis kayak file aslinya, gak ada resiko salah
// transkripsi.
//
// File HTML-nya sendiri ada di public/kalkulator-maintenance-workspace.html
// -- di-serve langsung sama Next.js sebagai file statis, gak lewat
// routing app. Sidebar & header app internal TETAP kelihatan di
// sekeliling iframe ini (beda dari pendekatan "buka tab baru" yang
// sempat dicoba sebelumnya).
// =====================================================

export default function KalkulatorMaintenance() {
  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col p-4 sm:p-6">
      <header className="mb-3 shrink-0">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">
          Maintenance CCTV preventif · multi-lokasi
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Kalkulator Estimasi Maintenance CCTV</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border">
        <iframe
          src="/kalkulator-maintenance-workspace.html"
          title="Kalkulator Estimasi Maintenance CCTV"
          className="h-full w-full border-0"
        />
      </div>
    </div>
  )
}

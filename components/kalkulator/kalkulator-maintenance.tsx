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
    <div className="h-[85vh] overflow-hidden rounded-2xl border border-border">
      <iframe
        src="/kalkulator-maintenance-workspace.html"
        title="Kalkulator Estimasi Maintenance CCTV"
        className="h-full w-full border-0"
      />
    </div>
  )
}

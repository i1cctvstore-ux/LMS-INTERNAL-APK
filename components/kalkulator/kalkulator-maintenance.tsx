'use client'

// =====================================================
// Kalkulator estimasi Maintenance CCTV -- alat bantu INTERNAL buat staff
// ngasih gambaran harga ke customer pas ngobrol, sebelum minta penawaran
// resmi dari tim.
//
// Logic kalkulasinya di-port 1:1 dari file HTML publik
// (maintenance-cctv-calculator.html / i1cctv.com/maintenance-cctv-calculator)
// -- cuma navbar/footer publiknya dibuang & tampilannya dirapikan pakai
// gaya internal (konsisten sama modul lain kayak KasModule/StokModule),
// karena ini sekarang dipakai di dalam shell app internal, bukan halaman
// berdiri sendiri.
//
// ⚠️ TODO: WHATSAPP_NUMBER di bawah masih placeholder ("628XXXXXXXXXX"),
// sama persis kayak di file HTML aslinya -- WAJIB diganti ke nomor WA
// beneran sebelum dipakai staff, kalau enggak tombol "Chat WhatsApp"
// gak akan berfungsi.
// =====================================================

import { useMemo, useState } from 'react'
import { MessageCircle, ArrowRight, ShieldCheck } from 'lucide-react'

const WHATSAPP_NUMBER = '628XXXXXXXXXX' // TODO: ganti ke nomor WA asli i1 CCTV

type PackageId = 'basic' | 'prioritas' | 'premium'
type PaymentTermId = 'annual' | 'semiAnnual' | 'quarterly'

type PackageConfig = {
  name: string
  tagline: string
  visit: string
  target: string
  listPerPoint: number
  minimumList: number
  promoMinimumPerPoint: number
}

const PACKAGE_CONFIG: Record<PackageId, PackageConfig> = {
  basic: {
    name: 'Basic',
    tagline: 'Perawatan rutin untuk kebutuhan yang sederhana.',
    visit: '2x per tahun',
    target: 'H+3–7 hari kerja',
    listPerPoint: 187500,
    minimumList: 3000000,
    promoMinimumPerPoint: 150000,
  },
  prioritas: {
    name: 'Prioritas',
    tagline: 'Pilihan seimbang untuk sistem yang ingin tetap terpantau.',
    visit: '3x per tahun',
    target: 'H+2–5 hari kerja',
    listPerPoint: 287500,
    minimumList: 4600000,
    promoMinimumPerPoint: 230000,
  },
  premium: {
    name: 'Premium',
    tagline: 'Pemeriksaan lebih sering untuk kebutuhan prioritas.',
    visit: '4x per tahun',
    target: 'H+1–2 hari kerja',
    listPerPoint: 437500,
    minimumList: 7000000,
    promoMinimumPerPoint: 350000,
  },
}
const packageOrder: PackageId[] = ['basic', 'prioritas', 'premium']

type PaymentTerm = { label: string; invoices: number; discount: number; invoiceNote: string }

const PAYMENT_TERMS: Record<PaymentTermId, PaymentTerm> = {
  annual: { label: 'Tahunan lunas', invoices: 1, discount: 20, invoiceNote: '1 invoice' },
  semiAnnual: { label: '6 bulanan', invoices: 2, discount: 5, invoiceNote: '2 invoice' },
  quarterly: { label: 'Quarterly', invoices: 4, discount: 0, invoiceNote: '4 invoice' },
}
const termOrder: PaymentTermId[] = ['annual', 'semiAnnual', 'quarterly']

function calculateEstimate(packageId: PackageId, points: number, paymentTermId: PaymentTermId) {
  const pkg = PACKAGE_CONFIG[packageId]
  const term = PAYMENT_TERMS[paymentTermId]
  const safePoints = Math.max(0, Math.floor(Number.isFinite(points) ? points : 0))
  const listPrice = Math.max(safePoints * pkg.listPerPoint, pkg.minimumList)
  const promoFloor = Math.max(safePoints * pkg.promoMinimumPerPoint, pkg.minimumList * 0.8)
  const estimatedAnnual = Math.max(listPrice * (1 - term.discount / 100), promoFloor)
  return {
    estimatedAnnual: Math.round(estimatedAnnual),
    invoiceValue: Math.round(estimatedAnnual / term.invoices),
    monthlyEquivalent: Math.round(estimatedAnnual / 12),
  }
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

export default function KalkulatorMaintenance() {
  const [points, setPoints] = useState(16)
  const [paymentTerm, setPaymentTerm] = useState<PaymentTermId>('annual')

  const term = PAYMENT_TERMS[paymentTerm]
  const safePoints = Math.max(0, Number.isFinite(points) ? Math.floor(points) : 0)

  function buildWhatsappLink(packageId?: PackageId) {
    const packageName = packageId ? PACKAGE_CONFIG[packageId].name : 'paket Maintenance CCTV'
    const price = packageId
      ? formatRupiah(calculateEstimate(packageId, safePoints, paymentTerm).estimatedAnnual)
      : 'perlu dikonfirmasi'
    const message = `Halo i1 CCTV, saya ingin meminta penawaran resmi Maintenance CCTV.\n\nPaket: ${packageName}\nJumlah titik/kamera: ${safePoints}\nMetode pembayaran: ${term.label}\nKisaran estimasi: ${price}\n\nHarga di kalkulator ini masih berupa estimasi. Mohon dibantu konfirmasi scope dan penawaran resminya. Terima kasih.`
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
  }

  const estimates = useMemo(
    () =>
      packageOrder.map((id) => ({
        id,
        pkg: PACKAGE_CONFIG[id],
        estimate: calculateEstimate(id, safePoints, paymentTerm),
      })),
    [safePoints, paymentTerm],
  )

  return (
    <div className="mx-auto max-w-5xl p-4 pb-16 sm:p-6">
      {/* Header -- pola sama kayak header modul lain (KasModule dkk) */}
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">
          Maintenance CCTV preventif · 12 bulan
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Kalkulator Estimasi Maintenance CCTV</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Alat bantu internal buat ngasih gambaran estimasi ke customer pas lagi ngobrol. Harga final tetap butuh
          konfirmasi scope & lokasi dari tim sebelum dikirim jadi penawaran resmi.
        </p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[.78fr_1.22fr]">
        {/* Panel parameter */}
        <div className="space-y-5 rounded-2xl border border-border bg-[#14213d] p-6 text-white lg:sticky lg:top-4">
          <div className="flex items-center gap-3 border-b border-white/10 pb-5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#61a2ff]/45 bg-[#1764d7]/15">
              <ShieldCheck className="h-5 w-5 text-[#61a2ff]" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#93c5fd]">Langkah 01 / 02</p>
              <h2 className="mt-1 text-xl font-bold">Parameter kebutuhan</h2>
            </div>
          </div>

          <div>
            <label htmlFor="points" className="mb-3 block text-base font-bold">
              Jumlah titik/kamera CCTV
            </label>
            <div className="flex items-end gap-3 border-b border-[#93a4bc]/45 pb-3">
              <input
                id="points"
                inputMode="numeric"
                type="number"
                min={0}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value))}
                className="w-full bg-transparent text-4xl font-medium tracking-[-.05em] text-white outline-none placeholder:text-[#93a4bc]"
              />
              <span className="pb-1 text-lg text-[#c3cede]">titik</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#a9b7ca]">
              Masukkan 0 atau lebih. Jumlah ini menjadi dasar estimasi paket.
            </p>
          </div>

          <div className="border-t border-white/10 pt-5">
            <label className="mb-3 block text-base font-bold">Ritme pembayaran</label>
            <div className="space-y-2">
              {termOrder.map((id) => {
                const item = PAYMENT_TERMS[id]
                const active = id === paymentTerm
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPaymentTerm(id)}
                    aria-pressed={active}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                      active
                        ? 'border-[#61a2ff] bg-[#1764d7] text-white shadow-[0_4px_10px_#1764d729]'
                        : 'border-white/15 text-[#c3cede] hover:border-[#61a2ff]'
                    }`}
                  >
                    <span className="text-sm font-bold">{item.label}</span>
                    <span className="text-xs">{item.invoiceNote}</span>
                  </button>
                )
              })}
            </div>
            <p className="mt-3 text-xs leading-5 text-[#9eacbf]">
              Jumlah invoice dan total estimasi akan menyesuaikan pilihan Anda.
            </p>
          </div>

          <div className="border-l-2 border-[#f3c64d] bg-white/5 px-3 py-3 text-xs leading-5 text-[#fff4c7]">
            Belum termasuk PPN bila berlaku. Harga akhir mengikuti hasil konfirmasi scope dan lokasi.
          </div>
        </div>

        {/* Daftar paket */}
        <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Langkah 02 / 02</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-.03em] text-foreground">Bandingkan paket</h2>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
              {safePoints} titik
            </span>
          </div>

          <div className="space-y-3">
            {estimates.map(({ id, pkg, estimate }) => {
              const isRecommended = id === 'prioritas'
              return (
                <article
                  key={id}
                  className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 ${
                    isRecommended ? 'border-[#61a2ff] bg-indigo-50/40 shadow-sm' : 'border-border bg-background'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold tracking-[-.03em] text-foreground">{pkg.name}</h3>
                        {isRecommended && (
                          <span className="rounded-full bg-indigo-100 px-2 py-1 text-[9px] font-bold uppercase tracking-[.1em] text-indigo-700">
                            Paling seimbang
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{pkg.tagline}</p>
                    </div>
                    <div className="text-right">
                      <strong className="block text-lg font-extrabold tracking-[-.03em] text-foreground">
                        {formatRupiah(estimate.estimatedAnnual)}
                      </strong>
                      <span className="text-[10px] text-muted-foreground">estimasi / 12 bulan</span>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-4">
                    <span>
                      <b className="block text-foreground">{pkg.visit}</b>visit preventif
                    </span>
                    <span>
                      <b className="block text-foreground">{pkg.target}</b>target kedatangan
                    </span>
                    <span>
                      <b className="block text-foreground">{formatRupiah(estimate.invoiceValue)}</b>
                      per invoice · {term.label}
                    </span>
                    <span>
                      <b className="block text-foreground">{formatRupiah(estimate.monthlyEquivalent)}</b>setara / bulan
                    </span>
                  </div>
                  <a
                    href={buildWhatsappLink(id)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs font-bold text-indigo-600"
                  >
                    Pilih paket ini
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </article>
              )
            })}
          </div>

          <a
            href={buildWhatsappLink()}
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <MessageCircle className="h-4 w-4" />
            Chat kami untuk harga detail
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Non-Member vs Member */}
      <section className="mt-10">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Non-Member vs Member</p>
        <h2 className="mt-2 max-w-2xl text-xl font-bold leading-snug tracking-[-.03em] text-foreground">
          Service memperbaiki gangguan hari ini. Member menjaga sistem tetap terkontrol setelahnya.
        </h2>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-background shadow-sm">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-1/3 border-b border-border bg-background px-5 py-3 text-left text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">
                  {' '}
                </th>
                <th className="border-b border-border bg-muted/40 px-5 py-3 text-left align-top">
                  <span className="block text-sm font-extrabold text-foreground">Non-Member</span>
                  <span className="block text-xs font-medium text-muted-foreground">Service saat rusak</span>
                </th>
                <th className="border-b border-2 border-b-amber-400 bg-amber-50 px-5 py-3 text-left align-top">
                  <span className="block text-sm font-extrabold text-amber-800">Member</span>
                  <span className="block text-xs font-medium text-amber-700">Kontrak AMC</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                ['Kunjungan Preventive', 'Tidak terjadwal', 'Terjadwal rutin sesuai paket'],
                ['Cleaning & Health Check', 'Saat service, ditagihkan terpisah', 'Termasuk dalam kunjungan rutin'],
                ['Yang Diperiksa', 'Sesuai keluhan saat itu', 'Kamera, rekaman, storage, power & koneksi'],
                ['Respons Bantuan', 'Jadwal normal', 'Prioritas sesuai tier paket'],
                ['Corrective Ringan', 'Jasa dihitung per pekerjaan', 'Kuota sesuai paket yang dipilih'],
                ['Remote / Aplikasi HP', 'Dihitung sebagai jasa tambahan', 'Termasuk bantuan sesuai paket'],
                ['Harga Jasa & Barang', 'Harga normal', 'Harga khusus member'],
                ['Kepastian Biaya', 'Tergantung kerusakan', 'Biaya perawatan lebih terencana'],
              ].map(([label, non, member]) => (
                <tr key={label}>
                  <td className="px-5 py-3 align-top font-bold text-foreground">{label}</td>
                  <td className="px-5 py-3 align-top text-muted-foreground">{non}</td>
                  <td className="px-5 py-3 align-top bg-amber-50/40 font-semibold text-foreground">{member}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Batasan */}
      <section className="mt-10 rounded-2xl border border-border bg-muted/30 p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Batasan yang perlu diketahui</p>
        <h2 className="mt-2 max-w-xl text-xl font-bold leading-snug tracking-[-.03em] text-foreground">
          Beberapa kebutuhan memang perlu dilihat lebih dekat.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Material, sparepart, kabel, pipa, konektor, pekerjaan sipil, alat akses tinggi, perangkat pengganti, dan
          perbaikan besar dapat memerlukan penawaran terpisah agar scope dan biayanya tepat.
        </p>
        <a
          href={buildWhatsappLink()}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-indigo-600"
        >
          Minta survei / penawaran khusus
          <ArrowRight className="h-4 w-4" />
        </a>
      </section>
    </div>
  )
}

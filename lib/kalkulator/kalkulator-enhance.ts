// =====================================================
// Penyesuaian Kalkulator Maintenance CCTV (2026-09) -- TANPA menyentuh
// file HTML aslinya (public/kalkulator-maintenance-workspace.html, ±1 MB,
// React yang sudah di-bundle) dan TANPA menyentuh rumus harganya.
// Semua di sini murni "dandanan" yang disuntik ke dokumen iframe yang
// SAMA-ORIGIN (lihat components/kalkulator/kalkulator-maintenance.tsx):
//
//  1. KOP SURAT quotation = kop yang sama dengan app Penawaran (data dari
//     tabel `branches` + `branch_letterhead`, cabang Jakarta), dengan
//     PILIHAN kop PPN / Non-PPN (aturan pilih-datanya SAMA persis dengan
//     QuoteEditorPage: kop PPN pakai kolom *_ppn, kolom kosong jatuh ke
//     data non-PPN; logo banner dicetak selebar kop).
//       - Pilihan Non-PPN juga menyembunyikan baris "PPN 11%" dan "Total
//         termasuk PPN" di tabel quotation (hanya tampilan; hitungan
//         aslinya tidak diubah).
//  2. Tab langkah (1 Data proyek ... 4 Quotation) DITAMPILKAN juga di
//     desktop. Aslinya cuma tampil di layar <=760px (mobile), dan di
//     desktop navigasinya ada di sidebar bawaan -- yang sengaja
//     disembunyikan wrapper -- jadi desktop nggak punya navigasi langkah.
//  3. MODE CUSTOMER: sembunyikan semua yang sifatnya internal (margin,
//     decision ledger, biaya, pengaturan quotation, tab) dan tampilkan
//     HANYA dokumen quotation -- aman diperlihatkan ke customer. Daftar
//     elemen yang disembunyikan = daftar yang SUDAH dipakai file aslinya
//     sendiri untuk mode cetak (@media print).
//
// Semua penyuntikan ke DOM dibuat idempotent (cuma menulis kalau ada
// yang berubah) dan node buatan kita hanya DITAMBAHKAN sebagai saudara
// -- node milik React (teks, kolom tabel, dst) TIDAK diubah isinya, cuma
// diberi atribut data-* / disembunyikan lewat CSS. Itu bikin aman waktu
// React me-render ulang.
// =====================================================

export type KopMode = 'ppn' | 'nonppn'
export type ViewMode = 'internal' | 'customer'

/** Bentuk data cabang yang dipakai kop (subset dari BranchWithLetterhead di lib/quote-builder/api.ts). */
export type KopBranch = {
  name?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  signer_name?: string | null
  store_name?: string | null
  store_name_ppn?: string | null
  address_ppn?: string | null
  phone_ppn?: string | null
  email_ppn?: string | null
  logo_ppn_data?: string | null
  logo_non_ppn_data?: string | null
  logo_ppn_is_banner?: boolean | null
  logo_non_ppn_is_banner?: boolean | null
}

export type EnhanceState = {
  kop: KopMode
  view: ViewMode
  /** null = data cabang belum/gagal dimuat -> kop bawaan file (logo i1 CCTV) dibiarkan tampil. */
  branch: KopBranch | null
  /** Logo bawaan (sama dengan yang dipakai Penawaran) kalau cabang belum upload logo sendiri. */
  fallbackLogoPpn: string
  fallbackLogoNonPpn: string
}

export type ResolvedKop = {
  logo: string
  isBanner: boolean
  storeName: string
  phone: string
  email: string
  address: string
  signerName: string
}

/** Aturan pilih-data kop -- SAMA dengan `pickBranchInfo` di QuoteEditorPage: PPN -> kolom *_ppn, kosong jatuh ke data non-PPN. */
export function resolveKop(state: EnhanceState): ResolvedKop {
  const b = state.branch ?? {}
  const usesPpn = state.kop === 'ppn'
  const pick = (ppnValue?: string | null, baseValue?: string | null) =>
    ((usesPpn ? ppnValue?.trim() || baseValue?.trim() : baseValue?.trim()) || '')
  const custom = usesPpn ? b.logo_ppn_data : b.logo_non_ppn_data
  const logo = custom || (usesPpn ? state.fallbackLogoPpn : state.fallbackLogoNonPpn)
  const banner = Boolean(custom) && Boolean(usesPpn ? b.logo_ppn_is_banner : b.logo_non_ppn_is_banner)
  return {
    logo,
    isBanner: banner,
    storeName: pick(b.store_name_ppn, b.store_name),
    phone: pick(b.phone_ppn, b.phone),
    email: pick(b.email_ppn, b.email),
    address: pick(b.address_ppn, b.address),
    signerName: b.signer_name?.trim() || '',
  }
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** HTML kop surat (inline-style semua, supaya ikut ter-print lewat outerHTML). Layout mengikuti `.proposal-letterhead` di Penawaran. */
export function kopHtml(k: ResolvedKop): string {
  if (k.isBanner) {
    return `<img src="${esc(k.logo)}" alt="Kop surat" style="display:block;width:100%;height:auto">`
  }
  const missing = 'color:#c17a2f;font-style:italic'
  const line = (value: string, placeholder: string) =>
    value ? `<span>${esc(value)}</span>` : `<span style="${missing}">${esc(placeholder)}</span>`
  return (
    `<div style="display:flex;align-items:center;min-width:0">` +
    `<img src="${esc(k.logo)}" alt="Logo" style="display:block;height:48px;width:auto;max-width:100%;object-fit:contain;object-position:left center">` +
    `</div>` +
    `<div style="display:grid;align-content:center;gap:4px;color:#555;font-size:10px;line-height:1.35;text-align:right;min-width:0;max-width:62%">` +
    (k.storeName ? `<strong style="color:#1d2433;font-size:12px">${esc(k.storeName)}</strong>` : '') +
    line(k.phone, '(nomor telepon cabang belum diisi)') +
    line(k.email, '(email cabang belum diisi)') +
    line(k.address, '(alamat cabang belum diisi)') +
    `</div>`
  )
}

const STYLE_ID = 'kal-enhance-style'

// CSS-nya digabung jadi 1 <style> di <head> iframe. (Disalin juga ke jendela
// cetak oleh fungsi cetak bawaan file aslinya, yang menyalin semua <style>.)
const ENHANCE_CSS = `
/* ---- 1. Kop surat ---- */
#quotation > [data-kal-kop-block] { display:flex; justify-content:space-between; align-items:center; gap:20px; padding-bottom:10px; margin-bottom:16px; border-bottom:1px solid #aaa; }
#quotation > [data-kal-kop-block][data-kal-banner="1"] { display:block; padding-bottom:0; border-bottom:0; }
/* Logo lama (hardcode i1 CCTV) disembunyikan HANYA kalau data cabang berhasil dimuat. */
#quotation[data-kal-ready="1"] .quote-brand { display:none !important; }
#quotation[data-kal-ready="1"] .quote-header > div:first-child > p { margin-top:0 !important; }
/* Nama penanda tangan / perusahaan di bawah "Hormat kami," */
#quotation[data-kal-ready="1"] .quote-sign > div:first-child > b:not([data-kal-sign]) { display:none !important; }
/* ---- Non-PPN: baris PPN & total termasuk PPN disembunyikan (tampilan saja) ---- */
#quotation[data-kal-kop="nonppn"] tr[data-kal-ppn],
#quotation[data-kal-kop="nonppn"] .single-quote .quote-total { display:none !important; } /* mode "1 paket": blok .quote-total isinya cuma baris PPN + total termasuk PPN */

/* Layar sempit: tabel perbandingan 3 paket lebih lebar dari layar (kolom Premium terpotong) -> dokumen bisa digeser ke samping. */
@media (max-width: 760px) {
  #quotation { overflow-x: auto; }
  #quotation .compare-quote { min-width: 560px; }
}

/* ---- 2. Tab langkah di desktop (aslinya cuma tampil di layar <=760px) ---- */
@media (min-width: 761px) {
  .step-tabs { display:flex !important; gap:0 !important; margin:0 0 14px !important; background:#fff !important; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; }
  .step-tabs button { flex:1 1 0; border:0 !important; border-right:1px solid #e5e7eb !important; background:#fff !important; padding:13px 14px !important; white-space:nowrap; font-size:13px !important; font-weight:800; color:#64748b; cursor:pointer; }
  .step-tabs button:last-child { border-right:0 !important; }
  .step-tabs button:hover { background:#f8fafc !important; }
}
.step-tabs button.active { background:#4f46e5 !important; color:#fff !important; }

/* ---- 3. Mode Customer: cuma dokumen quotation ---- */
html[data-kal-view="customer"] .topbar,
html[data-kal-view="customer"] .hero-ledger,
html[data-kal-view="customer"] .decision-cockpit,
html[data-kal-view="customer"] .audit-strip,
html[data-kal-view="customer"] .step-tabs,
html[data-kal-view="customer"] .input-ledger,
html[data-kal-view="customer"] .location-ledger,
html[data-kal-view="customer"] .dashboard-grid,
html[data-kal-view="customer"] .cost-section,
html[data-kal-view="customer"] .packages-section,
html[data-kal-view="customer"] .quote-actions,
html[data-kal-view="customer"] .advanced-cost,
html[data-kal-view="customer"] .quote-settings,
html[data-kal-view="customer"] .no-print { display:none !important; }
html[data-kal-view="customer"] .print-quote { display:block !important; margin:16px auto !important; max-width:1000px; box-shadow:0 1px 3px rgba(0,0,0,.12); }
`

function ensureStyle(doc: Document) {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = ENHANCE_CSS
  doc.head.appendChild(style)
}

/** Buka langkah 4 (Quotation) lewat tab langkah bawaan (tetap ada di DOM walau disembunyikan CSS). */
export function goToQuotationStep(doc: Document): boolean {
  const buttons = Array.from(doc.querySelectorAll<HTMLButtonElement>('nav.step-tabs button'))
  const target = buttons.find((b) => /quotation/i.test(b.textContent || '')) ?? buttons[buttons.length - 1]
  if (!target) return false
  if (!target.classList.contains('active')) target.click()
  return true
}

/** Klik tombol cetak bawaan (fungsinya membuka jendela cetak dokumen quotation). */
export function triggerOriginalPrint(doc: Document): boolean {
  const btn = doc.querySelector<HTMLButtonElement>('.print-button')
  if (!btn) return false
  btn.click()
  return true
}

function applyOnce(doc: Document, state: EnhanceState) {
  ensureStyle(doc)
  const html = doc.documentElement
  if (html.getAttribute('data-kal-view') !== state.view) html.setAttribute('data-kal-view', state.view)

  const q = doc.getElementById('quotation')
  if (!q) return

  if (q.getAttribute('data-kal-kop') !== state.kop) q.setAttribute('data-kal-kop', state.kop)

  // Tandai baris PPN (kolom pertama diawali "PPN" / "Total termasuk PPN").
  q.querySelectorAll('tr').forEach((tr) => {
    const first = tr.firstElementChild?.textContent?.trim() ?? ''
    const isPpn = /^PPN\b/i.test(first) || /^Total termasuk PPN/i.test(first)
    if (isPpn && !tr.hasAttribute('data-kal-ppn')) tr.setAttribute('data-kal-ppn', '1')
  })

  if (!state.branch) {
    // Data cabang belum ada -> biarkan kop bawaan file tampil apa adanya.
    if (q.getAttribute('data-kal-ready')) q.removeAttribute('data-kal-ready')
    return
  }

  const resolved = resolveKop(state)
  const signature = JSON.stringify([state.kop, resolved])

  let block = q.querySelector<HTMLElement>(':scope > [data-kal-kop-block]')
  if (!block) {
    block = doc.createElement('div')
    block.setAttribute('data-kal-kop-block', '1')
    q.insertBefore(block, q.firstChild)
  }
  if (block.getAttribute('data-kal-sig') !== signature) {
    block.setAttribute('data-kal-sig', signature)
    block.setAttribute('data-kal-banner', resolved.isBanner ? '1' : '0')
    block.innerHTML = kopHtml(resolved)
  }

  // Penanda tangan: sisipkan <b> milik kita di sebelah <b> asli ("i1 CCTV") yang disembunyikan CSS.
  const signHost = q.querySelector<HTMLElement>('.quote-sign > div:first-child')
  if (signHost) {
    let mine = signHost.querySelector<HTMLElement>('b[data-kal-sign]')
    if (!mine) {
      mine = doc.createElement('b')
      mine.setAttribute('data-kal-sign', '1')
      signHost.appendChild(mine)
    }
    const main = resolved.signerName || resolved.storeName || 'i1 CCTV'
    const sub = resolved.signerName && resolved.storeName ? resolved.storeName : ''
    const signSig = `${main}|${sub}`
    if (mine.getAttribute('data-kal-sig') !== signSig) {
      mine.setAttribute('data-kal-sig', signSig)
      mine.innerHTML = esc(main) + (sub ? `<small style="display:block;font-size:9px;font-weight:400;color:#607089;margin-top:2px">${esc(sub)}</small>` : '')
    }
  }

  if (q.getAttribute('data-kal-ready') !== '1') q.setAttribute('data-kal-ready', '1')
}

export type Enhancer = {
  /** Panggil setiap kali state (kop/mode/data cabang) berubah. */
  refresh: () => void
  dispose: () => void
}

/**
 * Pasang penyesuaian ke dokumen iframe kalkulator. `getState` dibaca ulang
 * setiap kali dokumen berubah (React me-render ulang) supaya kop selalu
 * terpasang lagi di dokumen quotation yang baru dibuat.
 */
export function installEnhancements(doc: Document, getState: () => EnhanceState): Enhancer {
  let scheduled = false
  const run = () => {
    scheduled = false
    try {
      applyOnce(doc, getState())
    } catch {
      // Gagal menyuntik dandanan tidak boleh merusak kalkulator -- diam saja.
    }
  }
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    const win = doc.defaultView
    if (win && typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(run)
    else setTimeout(run, 0)
  }

  let observer: MutationObserver | null = null
  try {
    observer = new MutationObserver(schedule)
    observer.observe(doc.body, { childList: true, subtree: true, characterData: true })
  } catch {
    // MutationObserver tidak ada -> cukup refresh manual.
  }
  run()

  return {
    refresh: run,
    dispose: () => observer?.disconnect(),
  }
}

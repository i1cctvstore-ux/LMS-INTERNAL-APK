import * as XLSX from 'xlsx'

// =====================================================
// Parsing file Excel Stok Supplier — dijalankan di browser (client-side).
//
// File asli dari supplier ternyata bisa berantakan:
// - Ada beberapa baris judul (nama supplier, tanggal) SEBELUM baris
//   header beneran — jadi header-nya harus dicari, gak selalu row 1.
// - Bisa ada lebih dari 1 sheet, cuma salah satu yang isinya data
//   tabelnya beneran.
// - Bisa ada LEBIH DARI SATU kolom yang keliatan kayak kolom stok
//   (misal 2 kolom yang judulnya sama persis, masing-masing gudang
//   beda) — kalau ini kejadian, JANGAN ditebak sepihak, user yang
//   pilih sendiri kolom mana lewat UI.
// =====================================================

const SKU_CANDIDATES = ['sku', 'no. barang', 'no barang', 'kode barang', 'kode', 'item code', 'part number']
const DESC_CANDIDATES = ['deskripsi barang', 'nama barang', 'nama produk', 'nama item', 'produk', 'item name', 'description']
const QTY_NAME_HINTS = ['qty', 'stok', 'jumlah', 'quantity', 'stock', 'gudang', 'saldo', 'kuantitas']

function norm(s: any): string {
  return (s ?? '').toString().trim().toLowerCase()
}

function findColumn(headerRow: any[], candidates: string[]): number {
  const headers = headerRow.map(norm)
  for (const cand of candidates) {
    const idx = headers.findIndex((h) => h === cand)
    if (idx !== -1) return idx
  }
  for (const cand of candidates) {
    const idx = headers.findIndex((h) => h.includes(cand))
    if (idx !== -1) return idx
  }
  return -1
}

export type QtyColumnCandidate = { index: number; header: string; sample: number[] }

export type ScanResult = {
  ok: boolean
  error?: string
  sheetName?: string
  headerRowIndex?: number // 0-based, index ke dalam array baris hasil sheet_to_json
  skuColIndex?: number
  descColIndex?: number
  qtyCandidates?: QtyColumnCandidate[]
  allHeaders?: string[]
  totalDataRows?: number
}

// Cari sheet + baris header yang paling masuk akal. Nyoba tiap sheet,
// di tiap sheet nyoba 15 baris pertama nyari yang ada sel cocok sama
// SKU_CANDIDATES — baris itu dianggap header, baris-baris SEBELUMNYA
// (judul/tanggal) dilewatin.
export async function scanSupplierStockExcel(file: File): Promise<ScanResult> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  let best: ScanResult | null = null

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    if (data.length === 0) continue

    let headerRowIndex = -1
    let skuColIndex = -1
    for (let i = 0; i < Math.min(15, data.length); i++) {
      const idx = findColumn(data[i] || [], SKU_CANDIDATES)
      if (idx !== -1) {
        headerRowIndex = i
        skuColIndex = idx
        break
      }
    }
    if (headerRowIndex === -1) continue // sheet ini gak ketemu header SKU-nya, coba sheet lain

    const headerRow = data[headerRowIndex] || []
    const descColIndex = findColumn(headerRow, DESC_CANDIDATES)
    const bodyRows = data.slice(headerRowIndex + 1)

    // Kolom kandidat qty: semua kolom SELAIN sku & deskripsi yang
    // isinya MAYORITAS angka di baris-baris data (bukan cuma dari nama
    // headernya — karena header bisa duplikat/ambigu kayak "D3-D4").
    const numCols = headerRow.length
    const qtyCandidates: QtyColumnCandidate[] = []
    for (let c = 0; c < numCols; c++) {
      if (c === skuColIndex || c === descColIndex) continue
      const sampleVals = bodyRows.slice(0, 30).map((r) => r[c])
      const numericCount = sampleVals.filter((v) => v !== '' && v !== null && !isNaN(Number(v))).length
      if (sampleVals.length > 0 && numericCount / sampleVals.length >= 0.6) {
        qtyCandidates.push({
          index: c,
          header: String(headerRow[c] ?? `Kolom ${c + 1}`),
          sample: bodyRows.slice(0, 5).map((r) => Number(r[c]) || 0),
        })
      }
    }

    if (qtyCandidates.length === 0) continue // sheet ini gak ada kolom angka yang masuk akal, coba sheet lain

    const result: ScanResult = {
      ok: true,
      sheetName,
      headerRowIndex,
      skuColIndex,
      descColIndex: descColIndex === -1 ? undefined : descColIndex,
      qtyCandidates,
      allHeaders: headerRow.map((h) => String(h)),
      totalDataRows: bodyRows.filter((r) => norm(r[skuColIndex])).length,
    }

    // Pilih sheet dengan jumlah baris data terbanyak, kalau ada beberapa
    // sheet yang sama-sama valid (biasanya sheet "ringkasan" jauh lebih
    // pendek daripada sheet detail per-gudang).
    if (!best || (result.totalDataRows || 0) > (best.totalDataRows || 0)) {
      best = result
    }
  }

  if (!best) {
    return { ok: false, error: 'Kolom SKU / No. Barang tidak ketemu di sheet manapun dalam file ini.' }
  }
  return best
}

export type ParsedSupplierRow = { sku: string; qty: number; namaBarang?: string }

// Setelah scan (dan user milih kolom qty kalau kandidatnya lebih dari
// satu), tarik semua barisnya beneran pakai kolom yang sudah dipastikan.
export async function extractSupplierStockRows(
  file: File,
  scan: ScanResult,
  qtyColIndex: number,
): Promise<ParsedSupplierRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[scan.sheetName!]
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const bodyRows = data.slice((scan.headerRowIndex ?? 0) + 1)

  const aggregated = new Map<string, { qty: number; namaBarang?: string }>()
  bodyRows.forEach((r) => {
    const sku = String(r[scan.skuColIndex!] ?? '').trim()
    if (!sku) return
    const qty = Number(r[qtyColIndex]) || 0
    const key = sku.toLowerCase()
    const existing = aggregated.get(key) || { qty: 0 }
    existing.qty += qty
    if (scan.descColIndex !== undefined && r[scan.descColIndex]) existing.namaBarang = String(r[scan.descColIndex])
    aggregated.set(key, existing)
  })

  return Array.from(aggregated.entries()).map(([sku, v]) => ({ sku, qty: v.qty, namaBarang: v.namaBarang }))
}

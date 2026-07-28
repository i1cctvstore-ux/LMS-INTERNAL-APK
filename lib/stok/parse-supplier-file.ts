import * as XLSX from 'xlsx'

// =====================================================
// Parsing file Excel Stok Supplier — dijalankan di browser (client-side),
// gak perlu upload mentahnya ke server dulu. Kolom-kolom dikenali secara
// FLEKSIBEL (gak case-sensitive, beberapa nama alternatif) karena tiap
// supplier bisa kasih format Excel yang beda-beda.
//
// Kolom yang dikenali:
// - SKU (WAJIB) — dicoba: "sku", "kode barang", "kode"
// - Qty (WAJIB) — dicoba: "qty", "stok", "jumlah", "quantity"
// - Nama Barang (opsional, cuma buat tampilan/validasi visual)
// - Nama Gudang (opsional — kalau supplier punya beberapa gudang,
//   baris dengan SKU sama dari gudang berbeda otomatis DIJUMLAHKAN
//   jadi satu angka per SKU, karena supplier_stock cuma nyimpen 1
//   angka per supplier+produk)
// =====================================================

const COLUMN_CANDIDATES = {
  sku: ['sku', 'kode barang', 'kode', 'item code', 'part number'],
  qty: ['qty', 'stok', 'jumlah', 'quantity', 'stock', 'available stock'],
  namaBarang: ['nama barang', 'nama produk', 'nama item', 'produk', 'item name', 'description'],
  namaGudang: ['nama gudang', 'gudang', 'lokasi', 'warehouse', 'cabang gudang'],
}

function detectColumnIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) => (h || '').toString().trim().toLowerCase())
  for (const cand of candidates) {
    const idx = normalized.findIndex((h) => h === cand)
    if (idx !== -1) return idx
  }
  for (const cand of candidates) {
    const idx = normalized.findIndex((h) => h.includes(cand))
    if (idx !== -1) return idx
  }
  return -1
}

export type ParsedSupplierRow = { sku: string; qty: number; namaBarang?: string; namaGudang?: string }

export type ParsedSupplierFile = {
  rows: ParsedSupplierRow[]
  detected: { sku: boolean; qty: boolean; namaBarang: boolean; namaGudang: boolean }
  totalRowsInFile: number
  error?: string
}

export async function parseSupplierStockExcel(file: File): Promise<ParsedSupplierFile> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return { rows: [], detected: { sku: false, qty: false, namaBarang: false, namaGudang: false }, totalRowsInFile: 0, error: 'File Excel kosong / tidak ada sheet.' }
  }
  const sheet = wb.Sheets[sheetName]
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (data.length === 0) {
    return { rows: [], detected: { sku: false, qty: false, namaBarang: false, namaGudang: false }, totalRowsInFile: 0, error: 'Sheet pertama kosong.' }
  }

  const headers = (data[0] || []).map((h: any) => String(h))
  const skuIdx = detectColumnIndex(headers, COLUMN_CANDIDATES.sku)
  const qtyIdx = detectColumnIndex(headers, COLUMN_CANDIDATES.qty)
  const namaIdx = detectColumnIndex(headers, COLUMN_CANDIDATES.namaBarang)
  const gudangIdx = detectColumnIndex(headers, COLUMN_CANDIDATES.namaGudang)

  const detected = { sku: skuIdx !== -1, qty: qtyIdx !== -1, namaBarang: namaIdx !== -1, namaGudang: gudangIdx !== -1 }

  if (!detected.sku || !detected.qty) {
    return {
      rows: [],
      detected,
      totalRowsInFile: data.length - 1,
      error: `Kolom ${!detected.sku ? 'SKU' : ''}${!detected.sku && !detected.qty ? ' dan ' : ''}${!detected.qty ? 'Qty' : ''} tidak ketemu di file ini. Header yang ada: ${headers.filter(Boolean).join(', ')}`,
    }
  }

  const bodyRows = data.slice(1)
  const aggregated = new Map<string, { qty: number; namaBarang?: string; gudangSet: Set<string> }>()

  bodyRows.forEach((r) => {
    const sku = String(r[skuIdx] ?? '').trim()
    if (!sku) return
    const qty = Number(r[qtyIdx]) || 0
    const key = sku.toLowerCase()
    const existing = aggregated.get(key) || { qty: 0, gudangSet: new Set<string>() }
    existing.qty += qty
    if (detected.namaBarang && r[namaIdx]) existing.namaBarang = String(r[namaIdx])
    if (detected.namaGudang && r[gudangIdx]) existing.gudangSet.add(String(r[gudangIdx]))
    aggregated.set(key, existing)
  })

  const rows: ParsedSupplierRow[] = Array.from(aggregated.entries()).map(([sku, v]) => ({
    sku,
    qty: v.qty,
    namaBarang: v.namaBarang,
    namaGudang: v.gudangSet.size ? Array.from(v.gudangSet).join(', ') : undefined,
  }))

  return { rows, detected, totalRowsInFile: bodyRows.length }
}

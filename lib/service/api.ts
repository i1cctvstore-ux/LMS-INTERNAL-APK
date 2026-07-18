import { createClient } from '@/lib/supabase/client'

// =====================================================
// Tipe data — bentuknya SENGAJA dibuat sama persis dengan object yang
// dipakai di komponen klaim-servis-garansi.jsx aslinya (nama field
// camelCase yang sama), supaya nanti komponen itu bisa dipakai apa
// adanya, cuma sumber datanya yang diganti dari window.storage jadi
// Supabase lewat modul ini.
// =====================================================

export type ClaimStatus =
  | 'Menunggu Konfirmasi'
  | 'Baru'
  | 'Di Supplier'
  | 'Siap Diambil'
  | 'Selesai'

export type PartUsage = { partId: string; qty: number; price?: number }

export type Claim = {
  id: string
  groupId: string
  customerName: string
  customerPhone: string
  tanggalTerima: string
  brand: string
  produk: string
  produkSku: string
  snDiterima: string
  garansi: string
  jenis: string
  kelengkapan: string
  catatan: string
  snPenggantiStock: string
  biayaToko: string
  biayaJasaServis: string
  partsUsed: PartUsage[]
  stokBarangUsed: string
  fotoTandaTerimaCustomer: string | null
  status: ClaimStatus
  supplier: string
  batchId: string
  tanggalKirimSupplier: string
  tanggalKembaliSupplier: string
  hasilSupplier: string
  snPenggantiSupplier: string
  biayaSupplier: string
  sumberPenyelesaian: string
  tanggalAmbilCustomer: string
  metodeBayarAmbil: string
  stokReimbursed: boolean
  stokReimbursedBatchId: string
  stokReimbursedSupplier: string
  stokReimbursedTanggal: string
  stokReimbursedReceivedSN: string
  stokReimbursedReceivedDate: string
  updatedAt?: string
}

export type Batch = {
  id: string
  kodeBatch: string
  supplier: string
  tanggalKirim: string
  fotoResi: string | null
  fotoSuratJalanTTD: string | null
  fotoBuktiTerimaBalik: string | null
  itemIds: string[] // derived dari claims.batchId, bukan kolom tersendiri
}

export type Invoice = {
  id: string
  invoiceNo: string
  date: string
  customerName: string
  customerPhone: string
  claimIds: string[]
  lines: any[]
  total: number
  metodeBayar: string
  verified: boolean
}

export type SetoranEntry = {
  id: string
  tanggal: string
  jumlah: number
  penyetor: string
  catatan: string
}

export type Sparepart = {
  id: string
  name: string
  unit: string
  qty: number
}

export type ProductItem = {
  id: string
  sku: string
  name: string
}

export type SupplierItem = {
  id: string
  name: string
  phone: string
  address: string
}

export type StockLogEntry = {
  id: string
  type: 'masuk' | 'keluar'
  date: string
  note: string
  items: { partId: string; name: string; qty: number }[]
  claimIds: string[]
}

export type CustomerEntry = { id: string; name: string; phone: string; alamat: string }

export type ServiceSettings = {
  brands: string[]
  // "suppliers" tetap array nama (string[]) buat kompatibilitas dengan
  // kode lama (dropdown, filter, dll yang sudah ada) — sekarang nilainya
  // DIHASILKAN OTOMATIS dari supplierDetails, bukan disimpan terpisah.
  suppliers: string[]
  supplierDetails: SupplierItem[]
  spareParts: Sparepart[]
  products: ProductItem[]
  customers: CustomerEntry[]
  sparepartStockLog: StockLogEntry[]
  hiddenColumns: string[]
}

export type ServiceData = {
  claims: Claim[]
  batches: Batch[]
  settings: ServiceSettings
  invoices: Invoice[]
  setoranList: SetoranEntry[]
}

// =====================================================
// Converter: row Supabase (snake_case) <-> object komponen (camelCase)
// =====================================================

function claimFromRow(row: any): Claim {
  return {
    id: row.id,
    groupId: row.group_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone || '',
    tanggalTerima: row.tanggal_terima || '',
    brand: row.brand || '',
    produk: row.produk || '',
    produkSku: row.produk_sku || '',
    snDiterima: row.sn_diterima || '',
    garansi: row.garansi || 'Tidak',
    jenis: row.jenis || '',
    kelengkapan: row.kelengkapan || '',
    catatan: row.catatan || '',
    snPenggantiStock: row.sn_pengganti_stock || '',
    biayaToko: row.biaya_toko != null ? String(row.biaya_toko) : '',
    biayaJasaServis: row.biaya_jasa_servis != null ? String(row.biaya_jasa_servis) : '',
    partsUsed: row.parts_used || [],
    stokBarangUsed: row.stok_barang_used || '',
    fotoTandaTerimaCustomer: row.foto_tanda_terima_customer_url,
    status: row.status,
    supplier: row.supplier || '',
    batchId: row.batch_id || '',
    tanggalKirimSupplier: row.tanggal_kirim_supplier || '',
    tanggalKembaliSupplier: row.tanggal_kembali_supplier || '',
    hasilSupplier: row.hasil_supplier || '',
    snPenggantiSupplier: row.sn_pengganti_supplier || '',
    biayaSupplier: row.biaya_supplier != null ? String(row.biaya_supplier) : '',
    sumberPenyelesaian: row.sumber_penyelesaian || '',
    tanggalAmbilCustomer: row.tanggal_ambil_customer || '',
    metodeBayarAmbil: row.metode_bayar_ambil || '',
    stokReimbursed: !!row.stok_reimbursed,
    stokReimbursedBatchId: row.stok_reimbursed_batch_id || '',
    stokReimbursedSupplier: row.stok_reimbursed_supplier || '',
    stokReimbursedTanggal: row.stok_reimbursed_tanggal || '',
    stokReimbursedReceivedSN: row.stok_reimbursed_received_sn || '',
    stokReimbursedReceivedDate: row.stok_reimbursed_received_date || '',
    updatedAt: row.updated_at,
  }
}

function claimToRow(c: Partial<Claim>, branchId: string, userId?: string) {
  const row: Record<string, unknown> = { branch_id: branchId }
  if (c.id !== undefined) row.id = c.id
  if (c.groupId !== undefined) row.group_id = c.groupId
  if (c.customerName !== undefined) row.customer_name = c.customerName
  if (c.customerPhone !== undefined) row.customer_phone = c.customerPhone || null
  if (c.tanggalTerima !== undefined) row.tanggal_terima = c.tanggalTerima || null
  if (c.brand !== undefined) row.brand = c.brand || null
  if (c.produk !== undefined) row.produk = c.produk || null
  if (c.produkSku !== undefined) row.produk_sku = c.produkSku || null
  if (c.snDiterima !== undefined) row.sn_diterima = c.snDiterima || null
  if (c.garansi !== undefined) row.garansi = c.garansi || 'Tidak'
  if (c.jenis !== undefined) row.jenis = c.jenis || ''
  if (c.kelengkapan !== undefined) row.kelengkapan = c.kelengkapan || null
  if (c.catatan !== undefined) row.catatan = c.catatan || null
  if (c.snPenggantiStock !== undefined) row.sn_pengganti_stock = c.snPenggantiStock || null
  if (c.biayaToko !== undefined) row.biaya_toko = c.biayaToko === '' ? null : Number(c.biayaToko)
  if (c.biayaJasaServis !== undefined)
    row.biaya_jasa_servis = c.biayaJasaServis === '' ? null : Number(c.biayaJasaServis)
  if (c.partsUsed !== undefined) row.parts_used = c.partsUsed || []
  if (c.stokBarangUsed !== undefined) row.stok_barang_used = c.stokBarangUsed || null
  if (c.fotoTandaTerimaCustomer !== undefined)
    row.foto_tanda_terima_customer_url = c.fotoTandaTerimaCustomer || null
  if (c.status !== undefined) row.status = c.status
  if (c.supplier !== undefined) row.supplier = c.supplier || null
  if (c.batchId !== undefined) row.batch_id = c.batchId || null
  if (c.tanggalKirimSupplier !== undefined) row.tanggal_kirim_supplier = c.tanggalKirimSupplier || null
  if (c.tanggalKembaliSupplier !== undefined)
    row.tanggal_kembali_supplier = c.tanggalKembaliSupplier || null
  if (c.hasilSupplier !== undefined) row.hasil_supplier = c.hasilSupplier || null
  if (c.snPenggantiSupplier !== undefined) row.sn_pengganti_supplier = c.snPenggantiSupplier || null
  if (c.biayaSupplier !== undefined)
    row.biaya_supplier = c.biayaSupplier === '' ? null : Number(c.biayaSupplier)
  if (c.sumberPenyelesaian !== undefined) row.sumber_penyelesaian = c.sumberPenyelesaian || null
  if (c.tanggalAmbilCustomer !== undefined) row.tanggal_ambil_customer = c.tanggalAmbilCustomer || null
  if (c.metodeBayarAmbil !== undefined) row.metode_bayar_ambil = c.metodeBayarAmbil || null
  if (c.stokReimbursed !== undefined) row.stok_reimbursed = !!c.stokReimbursed
  if (c.stokReimbursedBatchId !== undefined)
    row.stok_reimbursed_batch_id = c.stokReimbursedBatchId || null
  if (c.stokReimbursedSupplier !== undefined)
    row.stok_reimbursed_supplier = c.stokReimbursedSupplier || null
  if (c.stokReimbursedTanggal !== undefined)
    row.stok_reimbursed_tanggal = c.stokReimbursedTanggal || null
  if (c.stokReimbursedReceivedSN !== undefined)
    row.stok_reimbursed_received_sn = c.stokReimbursedReceivedSN || null
  if (c.stokReimbursedReceivedDate !== undefined)
    row.stok_reimbursed_received_date = c.stokReimbursedReceivedDate || null
  if (userId) row.created_by = userId
  return row
}

function batchFromRow(row: any, itemIds: string[]): Batch {
  return {
    id: row.id,
    kodeBatch: row.kode_batch,
    supplier: row.supplier,
    tanggalKirim: row.tanggal_kirim,
    fotoResi: row.foto_resi_url,
    fotoSuratJalanTTD: row.foto_surat_jalan_ttd_url,
    fotoBuktiTerimaBalik: row.foto_bukti_terima_balik_url,
    itemIds,
  }
}

function batchToRow(b: Partial<Batch>, branchId: string, userId?: string) {
  const row: Record<string, unknown> = { branch_id: branchId }
  if (b.id !== undefined) row.id = b.id
  if (b.kodeBatch !== undefined) row.kode_batch = b.kodeBatch
  if (b.supplier !== undefined) row.supplier = b.supplier
  if (b.tanggalKirim !== undefined) row.tanggal_kirim = b.tanggalKirim
  if (b.fotoResi !== undefined) row.foto_resi_url = b.fotoResi || null
  if (b.fotoSuratJalanTTD !== undefined) row.foto_surat_jalan_ttd_url = b.fotoSuratJalanTTD || null
  if (b.fotoBuktiTerimaBalik !== undefined)
    row.foto_bukti_terima_balik_url = b.fotoBuktiTerimaBalik || null
  if (userId) row.created_by = userId
  return row
}

function invoiceFromRow(row: any): Invoice {
  return {
    id: row.id,
    invoiceNo: row.invoice_no,
    date: row.date,
    customerName: row.customer_name,
    customerPhone: row.customer_phone || '',
    claimIds: row.claim_ids || [],
    lines: row.lines || [],
    total: Number(row.total) || 0,
    metodeBayar: row.metode_bayar || '',
    verified: !!row.verified,
  }
}

function invoiceToRow(inv: Partial<Invoice>, branchId: string, userId?: string) {
  const row: Record<string, unknown> = { branch_id: branchId }
  if (inv.id !== undefined) row.id = inv.id
  if (inv.invoiceNo !== undefined) row.invoice_no = inv.invoiceNo
  if (inv.date !== undefined) row.date = inv.date
  if (inv.customerName !== undefined) row.customer_name = inv.customerName
  if (inv.customerPhone !== undefined) row.customer_phone = inv.customerPhone || null
  if (inv.claimIds !== undefined) row.claim_ids = inv.claimIds || []
  if (inv.lines !== undefined) row.lines = inv.lines || []
  if (inv.total !== undefined) row.total = inv.total || 0
  if (inv.metodeBayar !== undefined) row.metode_bayar = inv.metodeBayar || null
  if (inv.verified !== undefined) row.verified = !!inv.verified
  if (userId) row.created_by = userId
  return row
}

function setoranFromRow(row: any): SetoranEntry {
  return {
    id: row.id,
    tanggal: row.tanggal,
    jumlah: Number(row.jumlah) || 0,
    penyetor: row.penyetor || '',
    catatan: row.catatan || '',
  }
}

function setoranToRow(s: Partial<SetoranEntry>, branchId: string, userId?: string) {
  const row: Record<string, unknown> = { branch_id: branchId }
  if (s.id !== undefined) row.id = s.id
  if (s.tanggal !== undefined) row.tanggal = s.tanggal
  if (s.jumlah !== undefined) row.jumlah = s.jumlah || 0
  if (s.penyetor !== undefined) row.penyetor = s.penyetor || null
  if (s.catatan !== undefined) row.catatan = s.catatan || null
  if (userId) row.created_by = userId
  return row
}

function sparepartFromRow(row: any): Sparepart {
  return { id: row.id, name: row.name, unit: row.unit || 'pcs', qty: Number(row.qty) || 0 }
}

function sparepartToRow(p: Partial<Sparepart>, branchId: string) {
  const row: Record<string, unknown> = { branch_id: branchId }
  if (p.id !== undefined) row.id = p.id
  if (p.name !== undefined) row.name = p.name
  if (p.unit !== undefined) row.unit = p.unit || 'pcs'
  if (p.qty !== undefined) row.qty = p.qty || 0
  return row
}

function productFromRow(row: any): ProductItem {
  return { id: row.id, sku: row.sku || '', name: row.name }
}

function productToRow(p: Partial<ProductItem>, branchId: string) {
  const row: Record<string, unknown> = { branch_id: branchId }
  if (p.id !== undefined) row.id = p.id
  if (p.sku !== undefined) row.sku = p.sku || ''
  if (p.name !== undefined) row.name = p.name
  return row
}

function supplierFromRow(row: any): SupplierItem {
  return { id: row.id, name: row.name, phone: row.phone || '', address: row.address || '' }
}

function supplierToRow(s: Partial<SupplierItem>, branchId: string) {
  const row: Record<string, unknown> = { branch_id: branchId }
  if (s.id !== undefined) row.id = s.id
  if (s.name !== undefined) row.name = s.name
  if (s.phone !== undefined) row.phone = s.phone || null
  if (s.address !== undefined) row.address = s.address || null
  return row
}

function stockLogFromRow(row: any): StockLogEntry {
  return {
    id: row.id,
    type: row.type,
    date: row.tanggal,
    note: row.note || '',
    items: row.items || [],
    claimIds: row.claim_ids || [],
  }
}

function stockLogToRow(e: StockLogEntry, branchId: string, userId?: string) {
  return {
    id: e.id,
    branch_id: branchId,
    type: e.type,
    tanggal: e.date,
    note: e.note || null,
    items: e.items || [],
    claim_ids: e.claimIds || [],
    created_by: userId,
  }
}

function deriveCustomers(claims: Claim[]): CustomerEntry[] {
  const list: CustomerEntry[] = []
  const seen = new Set<string>()
  claims.forEach((c) => {
    const name = (c.customerName || '').trim()
    if (!name) return
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    list.push({ id: c.id, name, phone: (c.customerPhone || '').trim(), alamat: '' })
  })
  return list
}

// =====================================================
// Load — dipanggil sekali waktu halaman Servis dibuka (atau waktu
// super_admin ganti cabang yang lagi dilihat).
// =====================================================

export async function loadServiceData(branchId: string): Promise<ServiceData> {
  const supabase = createClient()

  const [claimsRes, batchesRes, invoicesRes, setoranRes, sparepartsRes, productsRes, suppliersRes, stockLogRes, settingsRes] =
    await Promise.all([
      supabase.from('service_claims').select('*').eq('branch_id', branchId).order('tanggal_terima', { ascending: false }),
      supabase.from('service_batches').select('*').eq('branch_id', branchId).order('tanggal_kirim', { ascending: false }),
      supabase.from('service_invoices').select('*').eq('branch_id', branchId).order('date', { ascending: false }),
      supabase.from('service_setoran').select('*').eq('branch_id', branchId).order('tanggal', { ascending: false }),
      supabase.from('service_spareparts').select('*').eq('branch_id', branchId).order('name'),
      supabase.from('service_products').select('*').eq('branch_id', branchId).order('name'),
      supabase.from('service_suppliers').select('*').eq('branch_id', branchId).order('name'),
      supabase.from('service_sparepart_stock_log').select('*').eq('branch_id', branchId).order('created_at', { ascending: false }),
      supabase.from('service_settings').select('*').eq('branch_id', branchId).maybeSingle(),
    ])

  const firstError = [claimsRes, batchesRes, invoicesRes, setoranRes, sparepartsRes, productsRes, suppliersRes, stockLogRes, settingsRes]
    .map((r) => r.error)
    .find(Boolean)
  if (firstError) throw new Error(firstError.message)

  const claimRows = claimsRes.data ?? []
  const claims = claimRows.map(claimFromRow)
  const batches = (batchesRes.data ?? []).map((row) =>
    batchFromRow(
      row,
      claimRows.filter((c) => c.batch_id === row.id).map((c) => c.id),
    ),
  )
  const invoices = (invoicesRes.data ?? []).map(invoiceFromRow)
  const setoranList = (setoranRes.data ?? []).map(setoranFromRow)
  const spareParts = (sparepartsRes.data ?? []).map(sparepartFromRow)
  const products = (productsRes.data ?? []).map(productFromRow)
  const supplierDetails = (suppliersRes.data ?? []).map(supplierFromRow)
  const sparepartStockLog = (stockLogRes.data ?? []).map(stockLogFromRow)

  const settingsRow = settingsRes.data as any
  const brands: string[] = settingsRow?.brands ?? []
  const hiddenColumns: string[] = settingsRow?.hidden_columns ?? []

  return {
    claims,
    batches,
    invoices,
    setoranList,
    settings: {
      brands,
      // suppliers (string[]) dihasilkan dari supplierDetails, bukan
      // dibaca dari kolom service_settings.suppliers lagi.
      suppliers: supplierDetails.map((s) => s.name),
      supplierDetails,
      spareParts,
      products,
      customers: deriveCustomers(claims),
      sparepartStockLog,
      hiddenColumns,
    },
  }
}

// =====================================================
// Diff generik — bandingkan array lama vs baru (identifikasi lewat id)
// buat tau baris mana yang perlu di-insert / update / delete.
// =====================================================

function diffById<T extends { id: string }>(prev: T[], next: T[]) {
  const prevMap = new Map(prev.map((x) => [x.id, x]))
  const nextMap = new Map(next.map((x) => [x.id, x]))
  const inserted: T[] = []
  const updated: T[] = []
  next.forEach((item) => {
    const before = prevMap.get(item.id)
    if (!before) inserted.push(item)
    else if (JSON.stringify(before) !== JSON.stringify(item)) updated.push(item)
  })
  const deletedIds: string[] = []
  prev.forEach((item) => {
    if (!nextMap.has(item.id)) deletedIds.push(item.id)
  })
  return { inserted, updated, deletedIds }
}

async function runAndCheck(tasks: Promise<{ error: any }>[]) {
  const results = await Promise.all(tasks)
  const failed = results.find((r) => r?.error)
  if (failed?.error) throw new Error(failed.error.message)
}

// Import massal (paste ratusan/ribuan baris dari Excel) bisa gagal kalau
// dikirim sekaligus dalam satu request — dipecah jadi beberapa kiriman
// kecil (300 baris per kiriman) supaya lebih aman dan tetap jalan walau
// datanya banyak.
const INSERT_CHUNK_SIZE = 300

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function chunkedInsertTasks(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: Record<string, unknown>[],
): Promise<{ error: any }>[] {
  return chunkArray(rows, INSERT_CHUNK_SIZE).map((chunk) => supabase.from(table).insert(chunk))
}

async function syncClaims(branchId: string, prev: Claim[], next: Claim[], userId?: string) {
  const supabase = createClient()
  const { inserted, updated, deletedIds } = diffById(prev, next)
  const tasks: Promise<{ error: any }>[] = []
  if (inserted.length)
    tasks.push(...chunkedInsertTasks(supabase, 'service_claims', inserted.map((c) => claimToRow(c, branchId, userId))))
  updated.forEach((c) => tasks.push(supabase.from('service_claims').update(claimToRow(c, branchId)).eq('id', c.id)))
  if (deletedIds.length) tasks.push(supabase.from('service_claims').delete().in('id', deletedIds))
  await runAndCheck(tasks)
}

async function syncBatches(branchId: string, prev: Batch[], next: Batch[], userId?: string) {
  const supabase = createClient()
  const { inserted, updated, deletedIds } = diffById(prev, next)
  const tasks: Promise<{ error: any }>[] = []
  if (inserted.length)
    tasks.push(...chunkedInsertTasks(supabase, 'service_batches', inserted.map((b) => batchToRow(b, branchId, userId))))
  updated.forEach((b) => tasks.push(supabase.from('service_batches').update(batchToRow(b, branchId)).eq('id', b.id)))
  if (deletedIds.length) tasks.push(supabase.from('service_batches').delete().in('id', deletedIds))
  await runAndCheck(tasks)
}

async function syncInvoices(branchId: string, prev: Invoice[], next: Invoice[], userId?: string) {
  const supabase = createClient()
  const { inserted, updated, deletedIds } = diffById(prev, next)
  const tasks: Promise<{ error: any }>[] = []
  if (inserted.length)
    tasks.push(...chunkedInsertTasks(supabase, 'service_invoices', inserted.map((i) => invoiceToRow(i, branchId, userId))))
  updated.forEach((i) => tasks.push(supabase.from('service_invoices').update(invoiceToRow(i, branchId)).eq('id', i.id)))
  if (deletedIds.length) tasks.push(supabase.from('service_invoices').delete().in('id', deletedIds))
  await runAndCheck(tasks)
}

async function syncSetoran(branchId: string, prev: SetoranEntry[], next: SetoranEntry[], userId?: string) {
  const supabase = createClient()
  const { inserted, updated, deletedIds } = diffById(prev, next)
  const tasks: Promise<{ error: any }>[] = []
  if (inserted.length)
    tasks.push(...chunkedInsertTasks(supabase, 'service_setoran', inserted.map((s) => setoranToRow(s, branchId, userId))))
  updated.forEach((s) => tasks.push(supabase.from('service_setoran').update(setoranToRow(s, branchId)).eq('id', s.id)))
  if (deletedIds.length) tasks.push(supabase.from('service_setoran').delete().in('id', deletedIds))
  await runAndCheck(tasks)
}

async function syncSpareparts(branchId: string, prev: Sparepart[], next: Sparepart[]) {
  const supabase = createClient()
  const { inserted, updated, deletedIds } = diffById(prev, next)
  const tasks: Promise<{ error: any }>[] = []
  if (inserted.length)
    tasks.push(...chunkedInsertTasks(supabase, 'service_spareparts', inserted.map((p) => sparepartToRow(p, branchId))))
  updated.forEach((p) =>
    tasks.push(supabase.from('service_spareparts').update(sparepartToRow(p, branchId)).eq('id', p.id)),
  )
  if (deletedIds.length) tasks.push(supabase.from('service_spareparts').delete().in('id', deletedIds))
  await runAndCheck(tasks)
}

async function syncProducts(branchId: string, prev: ProductItem[], next: ProductItem[]) {
  const supabase = createClient()
  const { inserted, updated, deletedIds } = diffById(prev, next)
  const tasks: Promise<{ error: any }>[] = []
  if (inserted.length)
    tasks.push(...chunkedInsertTasks(supabase, 'service_products', inserted.map((p) => productToRow(p, branchId))))
  updated.forEach((p) =>
    tasks.push(supabase.from('service_products').update(productToRow(p, branchId)).eq('id', p.id)),
  )
  if (deletedIds.length) tasks.push(supabase.from('service_products').delete().in('id', deletedIds))
  await runAndCheck(tasks)
}

async function syncSuppliers(branchId: string, prev: SupplierItem[], next: SupplierItem[]) {
  const supabase = createClient()
  const { inserted, updated, deletedIds } = diffById(prev, next)
  const tasks: Promise<{ error: any }>[] = []
  if (inserted.length)
    tasks.push(...chunkedInsertTasks(supabase, 'service_suppliers', inserted.map((s) => supplierToRow(s, branchId))))
  updated.forEach((s) =>
    tasks.push(supabase.from('service_suppliers').update(supplierToRow(s, branchId)).eq('id', s.id)),
  )
  if (deletedIds.length) tasks.push(supabase.from('service_suppliers').delete().in('id', deletedIds))
  await runAndCheck(tasks)
}

// Stock log cuma pernah DITAMBAH (entry baru) atau DIHAPUS (batal satu
// entry) di kode aslinya — gak pernah diedit di tempat. Jadi cukup 2
// operasi, gak perlu logic update.
async function syncStockLog(branchId: string, prev: StockLogEntry[], next: StockLogEntry[], userId?: string) {
  const supabase = createClient()
  const { inserted, deletedIds } = diffById(prev, next)
  const tasks: Promise<{ error: any }>[] = []
  if (inserted.length)
    tasks.push(...chunkedInsertTasks(supabase, 'service_sparepart_stock_log', inserted.map((e) => stockLogToRow(e, branchId, userId))))
  if (deletedIds.length) tasks.push(supabase.from('service_sparepart_stock_log').delete().in('id', deletedIds))
  await runAndCheck(tasks)
}

export async function saveServiceSettings(
  branchId: string,
  settings: { brands: string[]; hiddenColumns: string[] },
) {
  const supabase = createClient()
  const { error } = await supabase.from('service_settings').upsert({
    branch_id: branchId,
    brands: settings.brands || [],
    hidden_columns: settings.hiddenColumns || [],
  })
  if (error) throw new Error(error.message)
}

// =====================================================
// Upload foto (resi, surat jalan, tanda terima customer, dll) ke
// Supabase Storage bucket "service-files". Menggantikan pola lama yang
// nyimpen base64 langsung — panggil ini dengan File asli dari <input
// type="file">, BUKAN hasil FileReader.readAsDataURL lagi.
// =====================================================

export async function uploadServiceFile(file: File, branchId: string, folder: string): Promise<string> {
  const supabase = createClient()
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${branchId}/${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('service-files').upload(path, file, { upsert: false })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('service-files').getPublicUrl(path)
  return data.publicUrl
}

// =====================================================
// persistServiceData — pengganti fungsi persist(next) di file aslinya.
// Dipanggil dengan bentuk yang SAMA PERSIS: kasih tau bagian mana yang
// berubah (claims / batches / settings / invoices / setoranList), fungsi
// ini yang urus nulis ke tabel Supabase yang tepat.
// =====================================================

export async function persistServiceData(
  branchId: string,
  prev: ServiceData,
  patch: Partial<ServiceData>,
  userId?: string,
) {
  const tasks: Promise<void>[] = []

  if (patch.claims) tasks.push(syncClaims(branchId, prev.claims, patch.claims, userId))
  if (patch.batches) tasks.push(syncBatches(branchId, prev.batches, patch.batches, userId))
  if (patch.invoices) tasks.push(syncInvoices(branchId, prev.invoices, patch.invoices, userId))
  if (patch.setoranList) tasks.push(syncSetoran(branchId, prev.setoranList, patch.setoranList, userId))

  if (patch.settings) {
    const prevS = prev.settings
    const nextS = patch.settings

    if (nextS.spareParts && nextS.spareParts !== prevS.spareParts) {
      tasks.push(syncSpareparts(branchId, prevS.spareParts, nextS.spareParts))
    }
    if (nextS.products && nextS.products !== prevS.products) {
      tasks.push(syncProducts(branchId, prevS.products, nextS.products))
    }
    if (nextS.supplierDetails && nextS.supplierDetails !== prevS.supplierDetails) {
      tasks.push(syncSuppliers(branchId, prevS.supplierDetails, nextS.supplierDetails))
    }
    if (nextS.sparepartStockLog && nextS.sparepartStockLog !== prevS.sparepartStockLog) {
      tasks.push(syncStockLog(branchId, prevS.sparepartStockLog, nextS.sparepartStockLog, userId))
    }
    if (nextS.brands !== prevS.brands || nextS.hiddenColumns !== prevS.hiddenColumns) {
      tasks.push(
        saveServiceSettings(branchId, {
          brands: nextS.brands ?? prevS.brands,
          hiddenColumns: nextS.hiddenColumns ?? prevS.hiddenColumns,
        }),
      )
    }
    // customers: derived otomatis dari claims tiap kali loadServiceData()
    // dipanggil, jadi sengaja TIDAK ditulis ke tabel apa pun di sini.
    // suppliers (string[]): derived dari supplierDetails, juga tidak
    // ditulis langsung — sudah ditangani lewat syncSuppliers di atas.
  }

  await Promise.all(tasks)
}

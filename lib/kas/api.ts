import { createClient } from '@/lib/supabase/client'

// =====================================================
// Modul Kas — tipe data & fungsi CRUD untuk 3 tabel:
//   kas_buku_entries          (Buku Kas: uang masuk & setoran kas)
//   kas_kecil_entries         (Kas Kecil: setoran owner & pengeluaran operasional)
//   kas_um_reimburse_entries  (Kas UM & Reimburse: uang makan & reimburse karyawan)
//
// Field di sisi app pakai camelCase, kolom database pakai snake_case —
// fungsi *FromRow() di bawah yang menjembatani konversinya.
//
// Catatan: query select di bawah TIDAK pakai .range() pagination —
// wajar untuk buku kas 1 cabang (jumlah baris masih jauh dari limit
// default Supabase 1000 baris). Kalau nanti volumenya sangat besar,
// tambahkan filter periode di level query (bukan cuma di UI) seperti
// yang sudah pernah jadi masalah di modul Stok.
// =====================================================

export type KasBukuEntryType = 'masuk' | 'setor'
export type KasMetode = 'cash' | 'transfer'

export type KasBukuEntry = {
  id: string
  branchId: string
  type: KasBukuEntryType
  tanggal: string
  metode: KasMetode
  customerName: string | null
  invoiceNo: string | null
  catatan: string | null
  jumlah: number
  createdBy: string | null
  createdByName: string
  createdAt: string
  updatedAt: string
}

export type KasKecilEntryType = 'masuk' | 'keluar'
export type KasKecilKategori = 'makanan' | 'material' | 'ongkir'

export type KasKecilEntry = {
  id: string
  branchId: string
  type: KasKecilEntryType
  tanggal: string
  catatan: string | null
  kategori: KasKecilKategori | null
  keterangan: string | null
  jumlah: number
  createdBy: string | null
  createdByName: string
  createdAt: string
  updatedAt: string
}

export type KasUmEntryType = 'masuk' | 'keluar'
export type KasUmKategori = 'uangmakan' | 'reimburse'

export type KasUmEntry = {
  id: string
  branchId: string
  type: KasUmEntryType
  tanggal: string
  catatan: string | null
  kategori: KasUmKategori | null
  karyawan: string | null
  keterangan: string | null
  jumlah: number
  createdBy: string | null
  createdByName: string
  createdAt: string
  updatedAt: string
}

function bukuFromRow(row: any): KasBukuEntry {
  return {
    id: row.id,
    branchId: row.branch_id,
    type: row.type,
    tanggal: row.tanggal,
    metode: row.metode,
    customerName: row.customer_name,
    invoiceNo: row.invoice_no,
    catatan: row.catatan,
    jumlah: Number(row.jumlah),
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function kecilFromRow(row: any): KasKecilEntry {
  return {
    id: row.id,
    branchId: row.branch_id,
    type: row.type,
    tanggal: row.tanggal,
    catatan: row.catatan,
    kategori: row.kategori,
    keterangan: row.keterangan,
    jumlah: Number(row.jumlah),
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function umFromRow(row: any): KasUmEntry {
  return {
    id: row.id,
    branchId: row.branch_id,
    type: row.type,
    tanggal: row.tanggal,
    catatan: row.catatan,
    kategori: row.kategori,
    karyawan: row.karyawan,
    keterangan: row.keterangan,
    jumlah: Number(row.jumlah),
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ================= Buku Kas =================

export async function fetchKasBukuEntries(branchId: string): Promise<KasBukuEntry[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('kas_buku_entries')
    .select('*')
    .eq('branch_id', branchId)
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(bukuFromRow)
}

export type CreateKasBukuMasukInput = {
  branchId: string
  tanggal: string
  metode: KasMetode
  customerName: string
  invoiceNo: string
  jumlah: number
  createdBy: string
  createdByName: string
}

export async function createKasBukuMasuk(input: CreateKasBukuMasukInput): Promise<KasBukuEntry> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('kas_buku_entries')
    .insert({
      branch_id: input.branchId,
      type: 'masuk',
      tanggal: input.tanggal,
      metode: input.metode,
      customer_name: input.customerName,
      invoice_no: input.invoiceNo,
      jumlah: input.jumlah,
      created_by: input.createdBy,
      created_by_name: input.createdByName,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return bukuFromRow(data)
}

export type CreateKasBukuSetorInput = {
  branchId: string
  tanggal: string
  metode: KasMetode
  catatan: string
  jumlah: number
  createdBy: string
  createdByName: string
}

export async function createKasBukuSetor(input: CreateKasBukuSetorInput): Promise<KasBukuEntry> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('kas_buku_entries')
    .insert({
      branch_id: input.branchId,
      type: 'setor',
      tanggal: input.tanggal,
      metode: input.metode,
      catatan: input.catatan || null,
      jumlah: input.jumlah,
      created_by: input.createdBy,
      created_by_name: input.createdByName,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return bukuFromRow(data)
}

export type UpdateKasBukuInput = Partial<{
  tanggal: string
  metode: KasMetode
  customerName: string | null
  invoiceNo: string | null
  catatan: string | null
  jumlah: number
}>

// Hanya boleh dipanggil oleh Super Admin — RLS akan menolak kalau
// bukan (lihat policy kas_buku_update di migrasi).
export async function updateKasBukuEntry(id: string, patch: UpdateKasBukuInput): Promise<KasBukuEntry> {
  const supabase = createClient()
  const row: Record<string, any> = {}
  if (patch.tanggal !== undefined) row.tanggal = patch.tanggal
  if (patch.metode !== undefined) row.metode = patch.metode
  if (patch.customerName !== undefined) row.customer_name = patch.customerName
  if (patch.invoiceNo !== undefined) row.invoice_no = patch.invoiceNo
  if (patch.catatan !== undefined) row.catatan = patch.catatan
  if (patch.jumlah !== undefined) row.jumlah = patch.jumlah
  const { data, error } = await supabase
    .from('kas_buku_entries')
    .update(row)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return bukuFromRow(data)
}

// Hanya boleh dipanggil oleh Super Admin — RLS akan menolak kalau bukan.
export async function deleteKasBukuEntry(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('kas_buku_entries').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ================= Kas Kecil =================

export async function fetchKasKecilEntries(branchId: string): Promise<KasKecilEntry[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('kas_kecil_entries')
    .select('*')
    .eq('branch_id', branchId)
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(kecilFromRow)
}

export type CreateKasKecilMasukInput = {
  branchId: string
  tanggal: string
  catatan: string
  jumlah: number
  createdBy: string
  createdByName: string
}

export async function createKasKecilMasuk(input: CreateKasKecilMasukInput): Promise<KasKecilEntry> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('kas_kecil_entries')
    .insert({
      branch_id: input.branchId,
      type: 'masuk',
      tanggal: input.tanggal,
      catatan: input.catatan || null,
      jumlah: input.jumlah,
      created_by: input.createdBy,
      created_by_name: input.createdByName,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return kecilFromRow(data)
}

export type CreateKasKecilKeluarInput = {
  branchId: string
  tanggal: string
  kategori: KasKecilKategori
  keterangan: string
  jumlah: number
  createdBy: string
  createdByName: string
}

export async function createKasKecilKeluar(input: CreateKasKecilKeluarInput): Promise<KasKecilEntry> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('kas_kecil_entries')
    .insert({
      branch_id: input.branchId,
      type: 'keluar',
      tanggal: input.tanggal,
      kategori: input.kategori,
      keterangan: input.keterangan,
      jumlah: input.jumlah,
      created_by: input.createdBy,
      created_by_name: input.createdByName,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return kecilFromRow(data)
}

export type UpdateKasKecilInput = Partial<{
  tanggal: string
  catatan: string | null
  kategori: KasKecilKategori | null
  keterangan: string | null
  jumlah: number
}>

// Hanya boleh dipanggil oleh Super Admin — RLS akan menolak kalau bukan.
export async function updateKasKecilEntry(id: string, patch: UpdateKasKecilInput): Promise<KasKecilEntry> {
  const supabase = createClient()
  const row: Record<string, any> = {}
  if (patch.tanggal !== undefined) row.tanggal = patch.tanggal
  if (patch.catatan !== undefined) row.catatan = patch.catatan
  if (patch.kategori !== undefined) row.kategori = patch.kategori
  if (patch.keterangan !== undefined) row.keterangan = patch.keterangan
  if (patch.jumlah !== undefined) row.jumlah = patch.jumlah
  const { data, error } = await supabase
    .from('kas_kecil_entries')
    .update(row)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return kecilFromRow(data)
}

// Hanya boleh dipanggil oleh Super Admin — RLS akan menolak kalau bukan.
export async function deleteKasKecilEntry(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('kas_kecil_entries').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ================= Kas UM & Reimburse =================

export async function fetchKasUmEntries(branchId: string): Promise<KasUmEntry[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('kas_um_reimburse_entries')
    .select('*')
    .eq('branch_id', branchId)
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(umFromRow)
}

export type CreateKasUmMasukInput = {
  branchId: string
  tanggal: string
  catatan: string
  jumlah: number
  createdBy: string
  createdByName: string
}

// "Top Up Kas" -- uang masuk ke kas UM & Reimburse, biasanya dari owner/kas pusat.
export async function createKasUmMasuk(input: CreateKasUmMasukInput): Promise<KasUmEntry> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('kas_um_reimburse_entries')
    .insert({
      branch_id: input.branchId,
      type: 'masuk',
      tanggal: input.tanggal,
      catatan: input.catatan || null,
      jumlah: input.jumlah,
      created_by: input.createdBy,
      created_by_name: input.createdByName,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return umFromRow(data)
}

export type CreateKasUmKeluarInput = {
  branchId: string
  tanggal: string
  kategori: KasUmKategori
  karyawan: string
  keterangan: string
  jumlah: number
  createdBy: string
  createdByName: string
}

export async function createKasUmKeluar(input: CreateKasUmKeluarInput): Promise<KasUmEntry> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('kas_um_reimburse_entries')
    .insert({
      branch_id: input.branchId,
      type: 'keluar',
      tanggal: input.tanggal,
      kategori: input.kategori,
      karyawan: input.karyawan,
      keterangan: input.keterangan || null,
      jumlah: input.jumlah,
      created_by: input.createdBy,
      created_by_name: input.createdByName,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return umFromRow(data)
}

export type UpdateKasUmInput = Partial<{
  tanggal: string
  catatan: string | null
  kategori: KasUmKategori | null
  karyawan: string | null
  keterangan: string | null
  jumlah: number
}>

// Hanya boleh dipanggil oleh Super Admin — RLS akan menolak kalau bukan.
export async function updateKasUmEntry(id: string, patch: UpdateKasUmInput): Promise<KasUmEntry> {
  const supabase = createClient()
  const row: Record<string, any> = {}
  if (patch.tanggal !== undefined) row.tanggal = patch.tanggal
  if (patch.catatan !== undefined) row.catatan = patch.catatan
  if (patch.kategori !== undefined) row.kategori = patch.kategori
  if (patch.karyawan !== undefined) row.karyawan = patch.karyawan
  if (patch.keterangan !== undefined) row.keterangan = patch.keterangan
  if (patch.jumlah !== undefined) row.jumlah = patch.jumlah
  const { data, error } = await supabase
    .from('kas_um_reimburse_entries')
    .update(row)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return umFromRow(data)
}

// Hanya boleh dipanggil oleh Super Admin — RLS akan menolak kalau bukan.
export async function deleteKasUmEntry(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('kas_um_reimburse_entries').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

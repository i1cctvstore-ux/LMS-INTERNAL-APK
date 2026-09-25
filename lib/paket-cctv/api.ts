// =====================================================
// lib/paket-cctv/api.ts -- Data layer & business logic modul Paket CCTV
// =====================================================
// Prasyarat: migration 20260925000000-3 sudah dijalankan di Supabase.
//
// File ini BELUM punya UI (KalkulatorPage/RiwayatPage/HargaKomponenPage
// belum dibuat) -- ini fondasi datanya dulu: tipe, query Supabase, dan
// SEMUA rumus bisnis dari bagian 5 handoff (generate preset, PPN,
// pembulatan, persentase tier, peringatan campur merk, penomoran).
// Sengaja dipisah dulu supaya bisa dites logikanya sebelum halaman UI
// dipasang di atasnya.

import { createClient } from "@/lib/supabase/client";
import type { BranchWithLetterhead } from "@/lib/quote-builder/api";
import { getBranch } from "@/lib/quote-builder/api";

// Reuse getBranch() dari Quote Builder untuk kop surat -- TIDAK ada
// tabel/kolom letterhead baru di modul ini (lihat pembahasan sebelumnya).
export type { BranchWithLetterhead };
export { getBranch };

// ---------------------------------------------------------------
// Tipe dasar
// ---------------------------------------------------------------

export type Jenis = "analog" | "ip" | "wireless";
export type CustomerTypeKey = "up" | "standar" | "khusus" | "reseller";
export type PpnMode = "non" | "ppn";
export type QuoteStatus = "menunggu" | "deal" | "batal";
export type QtyFormula = "1" | "per_kamera" | "per_kamera_x2" | "kabel";

export interface ComponentSlot {
  slot_key: string;
  tipe: string;
  satuan_default: string;
  urutan: number;
}

/** Harga jual per cabang per slot -- TIDAK ADA field HPP di tipe ini (lihat BranchHpp). */
export interface BranchPrice {
  id: string;
  branch_id: string;
  slot_key: string;
  nama: string;
  harga_jual: number;
  sudah_ppn: boolean;
}

/** HPP per cabang per slot -- hanya bisa dibaca kalau login sebagai super_admin (RLS). */
export interface BranchHpp {
  branch_id: string;
  slot_key: string;
  hpp: number;
}

export interface DvrOption {
  ch: number;
  slot_key: string;
}

export interface BrandDef {
  label: string;
  camera_slot_key: string;
  dvr: DvrOption[];
}

export interface AccessoryFormula {
  slot_key: string;
  qty_formula: QtyFormula;
}

export interface JenisDef {
  label: string;
  brands: Record<string, BrandDef>;
  accessories: AccessoryFormula[];
}

export interface CustomerTypeDef {
  key: CustomerTypeKey;
  label: string;
  /** null = pakai harga_jual per item (Customer Standar), bukan persentase dari HPP. */
  pct_from_hpp: number | null;
}

export interface PaketConfig {
  brands: Record<Jenis, JenisDef>;
  customer_types: CustomerTypeDef[];
  cable_meter_per_camera: number;
  ppn_rate_percent: number;
}

/** Satu baris item di kalkulator / riwayat -- state kerja di UI, belum snapshot. */
export interface WorkingLine {
  id: string; // uuid lokal, buat key React & referensi edit
  slot_key: string | null; // null = item custom
  is_custom: boolean;
  nama_item: string;
  tipe: string;
  satuan: string;
  qty: number;
  harga_satuan: number; // sudah sesuai tier customer yang aktif
  hpp_satuan: number; // 0 kalau item custom tanpa HPP diisi (margin baris = nol, sesuai 5.8)
  sudah_ppn: boolean;
}

export interface QuoteRow {
  id: string;
  no: string;
  branch_id: string;
  cust_name: string;
  cust_address: string;
  quote_date: string;
  cust_type_key: CustomerTypeKey;
  ppn_mode: PpnMode;
  ppn_rate_pct_snapshot: number;
  jenis: Jenis | null;
  brand_key: string | null;
  raw_total: number;
  total: number;
  total_hpp: number;
  total_sell: number;
  status: QuoteStatus;
  note: string;
  created_at: string;
  created_by_name: string;
}

export interface QuoteLineRow {
  id: string;
  quote_id: string;
  slot_key: string | null;
  is_custom: boolean;
  nama_item: string;
  tipe: string;
  satuan: string;
  qty: number;
  harga_satuan: number;
  hpp_satuan_saat_itu: number;
  subtotal: number;
  sudah_ppn_saat_itu: boolean;
  urutan: number;
}

const BRANCH_CODE: Record<string, string> = {
  Solo: "SLO",
  Jakarta: "JKT",
  Bali: "BLI",
  Purwokerto: "PWT",
};

// ---------------------------------------------------------------
// Query dasar
// ---------------------------------------------------------------

export async function getPaketConfig(): Promise<PaketConfig> {
  const supabase = createClient();
  const { data, error } = await supabase.from("paket_config").select("*").eq("id", 1).single();
  if (error) throw error;
  return {
    brands: data.brands as Record<Jenis, JenisDef>,
    customer_types: data.customer_types as CustomerTypeDef[],
    cable_meter_per_camera: data.cable_meter_per_camera,
    ppn_rate_percent: data.ppn_rate_percent,
  };
}

export async function listComponentSlots(): Promise<ComponentSlot[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("paket_component_slots")
    .select("*")
    .order("urutan", { ascending: true });
  if (error) throw error;
  return data as ComponentSlot[];
}

/** Harga jual satu cabang, semua slot. Admin: RLS otomatis membatasi ke cabangnya sendiri. */
export async function listBranchPrices(branchId: string): Promise<BranchPrice[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("paket_branch_prices")
    .select("*")
    .eq("branch_id", branchId);
  if (error) throw error;
  return data as BranchPrice[];
}

/**
 * HPP satu cabang, semua slot -- HANYA berhasil untuk super_admin (RLS
 * paket_branch_hpp menolak akun admin sepenuhnya). Dipanggil dari layar
 * Kalkulator/Harga Komponen hanya ketika currentUserRole === 'super_admin';
 * jangan dipanggil dari akun admin (akan pulang array kosong, bukan error).
 */
export async function listBranchHpp(branchId: string): Promise<BranchHpp[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("paket_branch_hpp")
    .select("*")
    .eq("branch_id", branchId);
  if (error) throw error;
  return data as BranchHpp[];
}

/** Update harga jual satu slot. Admin hanya boleh untuk cabangnya sendiri (ditegakkan RLS). */
export async function updateBranchPrice(
  branchId: string,
  slotKey: string,
  patch: { nama?: string; harga_jual?: number; sudah_ppn?: boolean },
  updatedBy: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("paket_branch_prices")
    .update({ ...patch, updated_by: updatedBy })
    .eq("branch_id", branchId)
    .eq("slot_key", slotKey);
  if (error) throw error;
}

/** Update HPP satu slot -- HANYA berhasil untuk super_admin. */
export async function updateBranchHpp(
  branchId: string,
  slotKey: string,
  hpp: number,
  updatedBy: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("paket_branch_hpp")
    .update({ hpp, updated_by: updatedBy })
    .eq("branch_id", branchId)
    .eq("slot_key", slotKey);
  if (error) throw error;
}

/**
 * Update paket_config (brand label, resep aksesoris, persentase tier
 * customer, meter kabel/kamera, tarif PPN) -- selalu kirim OBJEK PENUH
 * untuk field jsonb yang diubah (brands / customer_types), bukan patch
 * parsial, karena kolomnya jsonb utuh (bukan per-key). RLS sudah
 * menegakkan super_admin-only di tabelnya; ini cuma pembungkus query.
 */
export async function updatePaketConfig(
  patch: Partial<Pick<PaketConfig, "brands" | "customer_types" | "cable_meter_per_camera" | "ppn_rate_percent">>,
  updatedBy: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("paket_config")
    .update({ ...patch, updated_by: updatedBy })
    .eq("id", 1);
  if (error) throw error;
}

/**
 * "Salin dari cabang lain" (bagian 6.2) -- baca harga_jual & sudah_ppn cabang
 * sumber per slot_key, TIDAK menulis apa pun (staf pilih tipe barang mana yang
 * mau disalin di UI, baru panggil updateBranchPrice satu-satu dengan Urungkan
 * yang tersedia di sisi klien). super_admin only secara alami lewat RLS kalau
 * cabang sumber bukan cabang sendiri.
 */
export async function compareBranchPrices(
  sourceBranchId: string,
  targetBranchId: string
): Promise<{ slot_key: string; source: BranchPrice | null; target: BranchPrice | null; sama: boolean }[]> {
  const [source, target] = await Promise.all([
    listBranchPrices(sourceBranchId),
    listBranchPrices(targetBranchId),
  ]);
  const bySlotSource = new Map(source.map((r) => [r.slot_key, r]));
  const bySlotTarget = new Map(target.map((r) => [r.slot_key, r]));
  const allSlots = new Set([...bySlotSource.keys(), ...bySlotTarget.keys()]);
  return Array.from(allSlots).map((slot_key) => {
    const s = bySlotSource.get(slot_key) ?? null;
    const t = bySlotTarget.get(slot_key) ?? null;
    const sama = !!s && !!t && s.harga_jual === t.harga_jual && s.sudah_ppn === t.sudah_ppn;
    return { slot_key, source: s, target: t, sama };
  });
}

// ---------------------------------------------------------------
// 5.1 -- Generate preset paket
// ---------------------------------------------------------------

/** Pilih varian DVR/NVR channel TERKECIL yang >= qtyPreset; kalau qtyPreset > 16, pakai 16ch (5.1, sengaja tidak auto-upgrade). */
export function pickDvrForQty(dvrOptions: DvrOption[], qtyPreset: number): DvrOption | null {
  if (dvrOptions.length === 0) return null; // Wireless tidak punya DVR/NVR
  const sorted = [...dvrOptions].sort((a, b) => a.ch - b.ch);
  const fit = sorted.find((d) => d.ch >= qtyPreset);
  return fit ?? sorted[sorted.length - 1]; // qtyPreset > 16 -> pakai varian terbesar (16ch), tidak upgrade
}

/** Hitung qty aksesori sesuai qty_formula (5.1 & 4.5). */
export function resolveAccessoryQty(formula: QtyFormula, qtyPreset: number, cableMeterPerCamera: number): number {
  switch (formula) {
    case "1":
      return 1;
    case "per_kamera":
      return qtyPreset;
    case "per_kamera_x2":
      return qtyPreset * 2;
    case "kabel":
      return qtyPreset * cableMeterPerCamera;
  }
}

/**
 * Bangun baris-baris preset (kamera + DVR/NVR + aksesoris) untuk
 * jenis+brand+qty terpilih. Baris yang dihasilkan masih dalam bentuk
 * "resep" (slot_key + qty) -- pemanggil (UI) yang mengisi harga_satuan
 * sesuai tier customer aktif lewat resolveLinePrice() di bawah, dan
 * lookup nama/satuan/sudah_ppn dari BranchPrice.
 */
export function buildPresetSlotQty(
  jenisDef: JenisDef,
  brandKey: string,
  qtyPreset: number,
  cableMeterPerCamera: number
): { slot_key: string; qty: number }[] {
  const brand = jenisDef.brands[brandKey];
  if (!brand) throw new Error(`Brand ${brandKey} tidak ditemukan di jenis ini`);
  const rows: { slot_key: string; qty: number }[] = [{ slot_key: brand.camera_slot_key, qty: qtyPreset }];
  const dvr = pickDvrForQty(brand.dvr, qtyPreset);
  if (dvr) rows.push({ slot_key: dvr.slot_key, qty: 1 });
  for (const acc of jenisDef.accessories) {
    rows.push({ slot_key: acc.slot_key, qty: resolveAccessoryQty(acc.qty_formula, qtyPreset, cableMeterPerCamera) });
  }
  return rows;
}

// ---------------------------------------------------------------
// 5.6 -- Persentase tier customer & 5.3 -- PPN
// ---------------------------------------------------------------

/**
 * Harga per satuan sesuai tier customer (5.6):
 *  - up/khusus/reseller: harga = hpp * (1 + pct/100)
 *  - standar: harga = harga_jual manual (pct_from_hpp null)
 * HPP dibutuhkan untuk 3 tier pertama -- kalau dipanggil dari akun admin
 * (yang tidak bisa baca HPP), tier tersebut TIDAK BOLEH ditawarkan di UI;
 * cukup kunci Admin ke tier "standar" di layar Kalkulator.
 */
export function resolveTierPrice(customerType: CustomerTypeDef, hpp: number, hargaJualManual: number): number {
  if (customerType.pct_from_hpp === null) return hargaJualManual;
  return Math.round(hpp * (1 + customerType.pct_from_hpp));
}

/** Tambahan PPN (5.3): hanya item sudah_ppn=false yang ditambah ppnRatePercent% dari subtotalnya. */
export function ppnAmountFor(sudahPpn: boolean, subtotalSell: number, ppnMode: PpnMode, ppnRatePercent: number): number {
  if (ppnMode !== "ppn" || sudahPpn) return 0;
  return subtotalSell * (ppnRatePercent / 100);
}

// ---------------------------------------------------------------
// 5.4 -- Pembulatan
// ---------------------------------------------------------------

/** Dibulatkan TURUN ke kelipatan 100rb (semua tier) atau 10rb (Reseller) -- HANYA untuk tampilan Customer/"Total paket saja". */
export function roundDisplayTotal(rawTotal: number, customerType: CustomerTypeKey): number {
  const step = customerType === "reseller" ? 10_000 : 100_000;
  return Math.floor(rawTotal / step) * step;
}

// ---------------------------------------------------------------
// 5.5 -- Reseller (Unit Saja): Jasa Pasang tidak dihitung
// ---------------------------------------------------------------

export function isJasaPasangExcludedForReseller(customerType: CustomerTypeKey, tipe: string): boolean {
  return customerType === "reseller" && tipe === "Jasa Pasang";
}

/** Total paket (5.5): Reseller mengecualikan baris bertipe Jasa Pasang dari hitungan & tampilan. */
export function calcRawTotal(lines: WorkingLine[], customerType: CustomerTypeKey, ppnMode: PpnMode, ppnRatePercent: number): number {
  return lines
    .filter((l) => !isJasaPasangExcludedForReseller(customerType, l.tipe))
    .reduce((sum, l) => {
      const subtotal = l.qty * l.harga_satuan;
      return sum + subtotal + ppnAmountFor(l.sudah_ppn, subtotal, ppnMode, ppnRatePercent);
    }, 0);
}

export function calcTotalHpp(lines: WorkingLine[], customerType: CustomerTypeKey): number {
  return lines
    .filter((l) => !isJasaPasangExcludedForReseller(customerType, l.tipe))
    .reduce((sum, l) => sum + l.qty * l.hpp_satuan, 0);
}

// ---------------------------------------------------------------
// 5.7 -- Peringatan campur merk (non-blocking)
// ---------------------------------------------------------------

const KNOWN_BRAND_SUBSTRINGS = ["Hilook", "Hikvision", "VIGI", "EZVIZ", "Acome", "Dahua", "Tiandy", "Imou", "Uniview"];

function detectBrandInName(name: string): string | null {
  return KNOWN_BRAND_SUBSTRINGS.find((b) => name.toLowerCase().includes(b.toLowerCase())) ?? null;
}

/**
 * Cek campur merk (5.7): hanya tipe Kamera/DVR/NVR. Kalau >=2 merk beda
 * ditemukan, kembalikan pesan peringatan; kalau tidak ada masalah, null.
 * Non-blocking -- paket tetap bisa disimpan walau ada peringatan ini.
 */
export function checkBrandMismatch(lines: WorkingLine[], activeBrandLabel: string): string | null {
  const relevant = lines.filter((l) => ["Kamera", "DVR", "NVR"].includes(l.tipe));
  const brandsFound = relevant
    .map((l) => ({ line: l, brand: detectBrandInName(l.nama_item) }))
    .filter((x): x is { line: WorkingLine; brand: string } => x.brand !== null);
  const distinctBrands = new Set(brandsFound.map((x) => x.brand));
  if (distinctBrands.size < 2) return null;

  const referenceBrand = detectBrandInName(activeBrandLabel) ?? mostCommonBrand(brandsFound.map((x) => x.brand));
  const others = brandsFound.filter((x) => x.brand !== referenceBrand);
  if (others.length === 0) return null;

  const daftar = others.map((x) => `${x.line.nama_item} (${x.brand})`).join(", ");
  return `Disarankan menggunakan 1 merk. Paket ini ${referenceBrand}, tapi ada produk merk lain: ${daftar}.`;
}

function mostCommonBrand(brands: string[]): string {
  const counts = new Map<string, number>();
  for (const b of brands) counts.set(b, (counts.get(b) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ---------------------------------------------------------------
// 5.9 -- Penomoran (via RPC, anti race condition)
// ---------------------------------------------------------------

/** Format: PKT-{KODECABANG}-{YYMM}-{4 digit urut}, urut per cabang per bulan lewat RPC security-definer. */
export async function nextQuoteNo(branchId: string, branchName: string, quoteDate: Date): Promise<string> {
  const supabase = createClient();
  const branchCode = BRANCH_CODE[branchName] ?? branchName.slice(0, 3).toUpperCase();
  const yymm = `${String(quoteDate.getFullYear() % 100).padStart(2, "0")}${String(quoteDate.getMonth() + 1).padStart(2, "0")}`;
  const { data, error } = await supabase.rpc("paket_next_quote_no", {
    p_branch_id: branchId,
    p_branch_code: branchCode,
    p_yymm: yymm,
  });
  if (error) throw error;
  return data as string;
}

// ---------------------------------------------------------------
// 4.8/4.9 & 5.10 -- Simpan quote (snapshot penuh) + baris-barisnya
// ---------------------------------------------------------------

export interface SaveQuoteInput {
  branchId: string;
  branchName: string;
  custName: string;
  custAddress: string;
  quoteDate: string; // YYYY-MM-DD
  custTypeKey: CustomerTypeKey;
  ppnMode: PpnMode;
  ppnRatePercentSnapshot: number;
  jenis: Jenis | null;
  brandKey: string | null;
  lines: WorkingLine[];
  status?: QuoteStatus;
  note?: string;
  createdBy: string;
  createdByName: string;
}

/**
 * Simpan paket baru sebagai snapshot penuh (5.10: mengubah harga master
 * setelahnya TIDAK mengubah paket yang sudah tersimpan). Nomor diambil
 * lewat nextQuoteNo() SEBELUM insert -- kalau insert gagal, nomor yang
 * sudah "terpakai" di counter TIDAK dikembalikan (gap nomor lebih aman
 * daripada race condition; sesuai desain 5.9).
 */
export async function saveQuote(input: SaveQuoteInput): Promise<QuoteRow> {
  const supabase = createClient();
  const no = await nextQuoteNo(input.branchId, input.branchName, new Date(input.quoteDate));

  const rawTotal = calcRawTotal(input.lines, input.custTypeKey, input.ppnMode, input.ppnRatePercentSnapshot);
  const total = roundDisplayTotal(rawTotal, input.custTypeKey);
  const totalHpp = calcTotalHpp(input.lines, input.custTypeKey);
  const totalSell = input.lines
    .filter((l) => !isJasaPasangExcludedForReseller(input.custTypeKey, l.tipe))
    .reduce((sum, l) => sum + l.qty * l.harga_satuan, 0);

  const { data: quote, error: quoteError } = await supabase
    .from("paket_quotes")
    .insert({
      no,
      branch_id: input.branchId,
      cust_name: input.custName,
      cust_address: input.custAddress,
      quote_date: input.quoteDate,
      cust_type_key: input.custTypeKey,
      ppn_mode: input.ppnMode,
      ppn_rate_pct_snapshot: input.ppnRatePercentSnapshot,
      jenis: input.jenis,
      brand_key: input.brandKey,
      raw_total: rawTotal,
      total,
      total_hpp: totalHpp,
      total_sell: totalSell,
      status: input.status ?? "menunggu",
      note: input.note ?? "",
      created_by: input.createdBy,
      created_by_name: input.createdByName,
    })
    .select("*")
    .single();
  if (quoteError) throw quoteError;

  const lineRows = input.lines.map((l, i) => ({
    quote_id: quote.id,
    slot_key: l.slot_key,
    is_custom: l.is_custom,
    nama_item: l.nama_item,
    tipe: l.tipe,
    satuan: l.satuan,
    qty: l.qty,
    harga_satuan: l.harga_satuan,
    hpp_satuan_saat_itu: l.hpp_satuan,
    subtotal: l.qty * l.harga_satuan,
    sudah_ppn_saat_itu: l.sudah_ppn,
    urutan: i,
  }));
  const { error: linesError } = await supabase.from("paket_quote_lines").insert(lineRows);
  if (linesError) throw linesError;

  return quote as QuoteRow;
}

/** "Perbarui" paket lama (5.10) -- timpa record yang sama, ganti seluruh baris item, nomor & branch TIDAK berubah. */
export async function updateQuote(
  quoteId: string,
  patch: Partial<Omit<SaveQuoteInput, "branchId" | "branchName" | "createdBy" | "createdByName">> & { updatedBy: string }
): Promise<void> {
  const supabase = createClient();
  const { data: existing, error: readError } = await supabase
    .from("paket_quotes")
    .select("*")
    .eq("id", quoteId)
    .single();
  if (readError) throw readError;

  const custTypeKey = patch.custTypeKey ?? existing.cust_type_key;
  const ppnMode = patch.ppnMode ?? existing.ppn_mode;
  const ppnRate = patch.ppnRatePercentSnapshot ?? existing.ppn_rate_pct_snapshot;
  const lines = patch.lines ?? [];

  const rawTotal = lines.length ? calcRawTotal(lines, custTypeKey, ppnMode, ppnRate) : existing.raw_total;
  const total = lines.length ? roundDisplayTotal(rawTotal, custTypeKey) : existing.total;

  const { error: updateError } = await supabase
    .from("paket_quotes")
    .update({
      cust_name: patch.custName,
      cust_address: patch.custAddress,
      quote_date: patch.quoteDate,
      cust_type_key: custTypeKey,
      ppn_mode: ppnMode,
      ppn_rate_pct_snapshot: ppnRate,
      jenis: patch.jenis,
      brand_key: patch.brandKey,
      raw_total: rawTotal,
      total,
      status: patch.status,
      note: patch.note,
      updated_by: patch.updatedBy,
    })
    .eq("id", quoteId);
  if (updateError) throw updateError;

  if (lines.length) {
    const { error: delError } = await supabase.from("paket_quote_lines").delete().eq("quote_id", quoteId);
    if (delError) throw delError;
    const lineRows = lines.map((l, i) => ({
      quote_id: quoteId,
      slot_key: l.slot_key,
      is_custom: l.is_custom,
      nama_item: l.nama_item,
      tipe: l.tipe,
      satuan: l.satuan,
      qty: l.qty,
      harga_satuan: l.harga_satuan,
      hpp_satuan_saat_itu: l.hpp_satuan,
      subtotal: l.qty * l.harga_satuan,
      sudah_ppn_saat_itu: l.sudah_ppn,
      urutan: i,
    }));
    const { error: insError } = await supabase.from("paket_quote_lines").insert(lineRows);
    if (insError) throw insError;
  }
}

export async function updateQuoteStatus(quoteId: string, status: QuoteStatus, updatedBy: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("paket_quotes").update({ status, updated_by: updatedBy }).eq("id", quoteId);
  if (error) throw error;
}

/** Hapus riwayat -- HANYA berhasil untuk super_admin (RLS); UI wajib konfirmasi 2 langkah sebelum panggil ini. */
export async function deleteQuote(quoteId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("paket_quotes").delete().eq("id", quoteId);
  if (error) throw error;
}

// ---------------------------------------------------------------
// 6.3 -- Riwayat Paket: cari/filter/urut
// ---------------------------------------------------------------

export interface ListQuotesFilter {
  branchId?: string; // superadmin bisa filter cabang; admin selalu terkunci ke cabangnya (RLS menegakkan ini juga)
  custTypeKey?: CustomerTypeKey;
  ppnMode?: PpnMode;
  status?: QuoteStatus;
  dateFrom?: string;
  dateTo?: string;
  search?: string; // nomor, nama customer, nominal (nama barang butuh join ke quote_lines, lihat searchByItemName)
  sort?: "newest" | "oldest" | "total_desc" | "total_asc" | "name_asc" | "name_desc";
  limit?: number;
}

export async function listQuotes(filter: ListQuotesFilter): Promise<QuoteRow[]> {
  const supabase = createClient();
  let query = supabase.from("paket_quotes").select("*");

  if (filter.branchId) query = query.eq("branch_id", filter.branchId);
  if (filter.custTypeKey) query = query.eq("cust_type_key", filter.custTypeKey);
  if (filter.ppnMode) query = query.eq("ppn_mode", filter.ppnMode);
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.dateFrom) query = query.gte("quote_date", filter.dateFrom);
  if (filter.dateTo) query = query.lte("quote_date", filter.dateTo);
  if (filter.search) {
    const term = filter.search.trim();
    query = query.or(`no.ilike.%${term}%,cust_name.ilike.%${term}%`);
  }

  switch (filter.sort) {
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "total_desc":
      query = query.order("total", { ascending: false });
      break;
    case "total_asc":
      query = query.order("total", { ascending: true });
      break;
    case "name_asc":
      query = query.order("cust_name", { ascending: true });
      break;
    case "name_desc":
      query = query.order("cust_name", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }
  if (filter.limit) query = query.limit(filter.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data as QuoteRow[];
}

export async function getQuoteWithLines(quoteId: string): Promise<{ quote: QuoteRow; lines: QuoteLineRow[] }> {
  const supabase = createClient();
  const [{ data: quote, error: qErr }, { data: lines, error: lErr }] = await Promise.all([
    supabase.from("paket_quotes").select("*").eq("id", quoteId).single(),
    supabase.from("paket_quote_lines").select("*").eq("quote_id", quoteId).order("urutan", { ascending: true }),
  ]);
  if (qErr) throw qErr;
  if (lErr) throw lErr;
  return { quote: quote as QuoteRow, lines: lines as QuoteLineRow[] };
}

// ---------------------------------------------------------------
// 5.10 -- "Buka di Kalkulator": bandingkan harga snapshot vs harga terkini
// ---------------------------------------------------------------

export interface PriceDiffResult {
  changed: boolean;
  oldTotal: number;
  newTotal: number;
}

/**
 * Hitung ulang total pakai harga TERKINI (branchPrices/branchHpp yang
 * dipassing pemanggil) dari baris-baris snapshot, lalu bandingkan dengan
 * total snapshot. UI menampilkan "Harga hari ini berbeda: Rp A -> Rp B"
 * kalau changed=true, dan menawarkan Perbarui vs Simpan sebagai baru (5.10).
 */
export function diffSnapshotVsCurrentPrice(
  lines: QuoteLineRow[],
  currentPrices: Map<string, BranchPrice>,
  currentHpp: Map<string, BranchHpp> | null,
  custType: CustomerTypeDef,
  custTypeKey: CustomerTypeKey,
  ppnMode: PpnMode,
  ppnRatePercent: number
): PriceDiffResult {
  const oldTotal = lines.reduce((sum, l) => sum + l.subtotal + ppnAmountFor(l.sudah_ppn_saat_itu, l.subtotal, ppnMode, l.harga_satuan ? ppnRatePercent : ppnRatePercent), 0);

  const newLines: WorkingLine[] = lines.map((l) => {
    if (l.is_custom || !l.slot_key) {
      return {
        id: l.id,
        slot_key: l.slot_key,
        is_custom: l.is_custom,
        nama_item: l.nama_item,
        tipe: l.tipe,
        satuan: l.satuan,
        qty: l.qty,
        harga_satuan: l.harga_satuan, // item custom: harga tetap, tidak ikut tier (5.8)
        hpp_satuan: l.hpp_satuan_saat_itu,
        sudah_ppn: l.sudah_ppn_saat_itu,
      };
    }
    const price = currentPrices.get(l.slot_key);
    const hpp = currentHpp?.get(l.slot_key)?.hpp ?? l.hpp_satuan_saat_itu;
    const hargaSatuan = price ? resolveTierPrice(custType, hpp, price.harga_jual) : l.harga_satuan;
    return {
      id: l.id,
      slot_key: l.slot_key,
      is_custom: false,
      nama_item: price?.nama ?? l.nama_item,
      tipe: l.tipe,
      satuan: l.satuan,
      qty: l.qty,
      harga_satuan: hargaSatuan,
      hpp_satuan: hpp,
      sudah_ppn: price?.sudah_ppn ?? l.sudah_ppn_saat_itu,
    };
  });

  const newRawTotal = calcRawTotal(newLines, custTypeKey, ppnMode, ppnRatePercent);
  const newTotal = roundDisplayTotal(newRawTotal, custTypeKey);
  const oldTotalRounded = roundDisplayTotal(oldTotal, custTypeKey);

  return { changed: newTotal !== oldTotalRounded, oldTotal: oldTotalRounded, newTotal };
}

// ---------------------------------------------------------------
// 6.4 -- Cetak: penggabungan baris Wireless (kamera+memory+jasa -> 1 baris)
// ---------------------------------------------------------------

export interface PrintLine {
  nama: string;
  qty: number;
  satuan: string;
  subtotal: number;
}

/**
 * Khusus jenis 'wireless': gabung baris Kamera + Memory Card + Jasa
 * Pasang jadi 1 baris tampilan untuk Preview/Cetak & Daftar Harga Paket,
 * meniru format asli sheet "Camera Wifi"/Print di Excel (keputusan yang
 * sudah dikonfirmasi -- lihat catatan proyek). Data/HPP di baliknya
 * TETAP itemized; ini murni transformasi tampilan sebelum print.
 */
export function toPrintLines(lines: QuoteLineRow[] | WorkingLine[], jenis: Jenis | null): PrintLine[] {
  if (jenis !== "wireless") {
    return lines.map((l) => ({
      nama: l.nama_item,
      qty: l.qty,
      satuan: l.satuan,
      subtotal: "subtotal" in l ? l.subtotal : l.qty * l.harga_satuan,
    }));
  }

  const cameraLine = lines.find((l) => l.tipe === "Kamera");
  const bundleParts = lines.filter((l) => ["Kamera", "Memory Card", "Jasa Pasang"].includes(l.tipe));
  const others = lines.filter((l) => !["Kamera", "Memory Card", "Jasa Pasang"].includes(l.tipe));

  const bundleTotal = bundleParts.reduce((sum, l) => sum + ("subtotal" in l ? l.subtotal : l.qty * l.harga_satuan), 0);
  const memoryLine = lines.find((l) => l.tipe === "Memory Card");
  const bundleLabel = cameraLine
    ? `${cameraLine.nama_item}${memoryLine ? ` + ${memoryLine.nama_item}` : ""} + Jasa Pasang`
    : "Paket Wireless";

  const bundled: PrintLine[] = bundleParts.length
    ? [{ nama: bundleLabel, qty: cameraLine?.qty ?? 1, satuan: cameraLine?.satuan ?? "pcs", subtotal: bundleTotal }]
    : [];

  return [
    ...bundled,
    ...others.map((l) => ({
      nama: l.nama_item,
      qty: l.qty,
      satuan: l.satuan,
      subtotal: "subtotal" in l ? l.subtotal : l.qty * l.harga_satuan,
    })),
  ];
}

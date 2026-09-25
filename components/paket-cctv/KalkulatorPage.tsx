"use client";

// =====================================================
// components/paket-cctv/KalkulatorPage.tsx
// =====================================================
// Implementasi bagian 6.1 handoff. Semua rumus (preset, tier, PPN,
// pembulatan, peringatan campur merk) dipanggil dari lib/paket-cctv/api.ts
// -- halaman ini "cuma" state + render, tidak menghitung apa pun sendiri.
//
// BELUM di bagian ini (menyusul):
//  - Export Excel (SheetJS) & Preview/Cetak PDF -- tombolnya ada tapi
//    nonaktif dengan catatan, lihat handleExportExcel/handlePreviewPdf.
//  - "Atur %" (ubah persentase tier customer) -- baru bisa lewat halaman
//    Harga Komponen yang juga belum ditulis.
//  - "Buka di Kalkulator" dari Riwayat (initialQuoteId prop sudah
//    disiapkan, tapi RiwayatPage yang memanggilnya belum ada).
//
// Admin (non-super_admin) DIKUNCI ke tier "Customer Standar" -- bukan
// keputusan produk, tapi keterbatasan teknis saat ini: 3 tier lain
// (up/khusus/reseller) butuh HPP untuk menghitung harga_satuan, dan RLS
// paket_branch_hpp menolak total akses admin ke tabel itu (sengaja, demi
// keamanan margin). Perbaikan yang benar adalah RPC security-definer yang
// menghitung harga_tier di server tanpa membocorkan HPP mentahnya ke
// klien -- belum dibuat, dicatat sebagai pekerjaan lanjutan.

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Role } from "@/lib/supabase/types";
import {
  type BranchHpp,
  type BranchPrice,
  type ComponentSlot,
  type CustomerTypeKey,
  type Jenis,
  type PaketConfig,
  type PpnMode,
  type QuoteLineRow,
  type WorkingLine,
  buildPresetSlotQty,
  calcRawTotal,
  calcTotalHpp,
  checkBrandMismatch,
  diffSnapshotVsCurrentPrice,
  getBranch,
  getPaketConfig,
  getQuoteWithLines,
  isJasaPasangExcludedForReseller,
  listBranchHpp,
  listBranchPrices,
  listComponentSlots,
  resolveTierPrice,
  roundDisplayTotal,
  saveQuote,
  toPrintLines,
  updateQuote,
} from "@/lib/paket-cctv/api";

import PaketPrintPreview from "./PaketPrintPreview";

/** Set oleh RiwayatPage sebelum pindah ke menu Kalkulator ("Buka di Kalkulator") -- dibaca sekali lalu langsung dihapus. */
export const OPEN_QUOTE_SESSION_KEY = "paket-open-quote-id";

type Props = {
  branchId: string;
  branchName: string | null;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: Role;
  /** Kalau diisi, buka paket ini di kalkulator alih-alih mulai baru (dipakai dari Riwayat -- belum dipakai sampai RiwayatPage ada). */
  initialQuoteId?: string | null;
};

const currency = (n: number) =>
  "Rp" + Math.round(n).toLocaleString("id-ID", { maximumFractionDigits: 0 });

const PRESET_QTYS = [1, 2, 4, 8, 16];

let localIdCounter = 0;
function newLocalId() {
  localIdCounter += 1;
  return `line-${Date.now()}-${localIdCounter}`;
}

export default function KalkulatorPage({ branchId, branchName, currentUserId, currentUserName, currentUserRole }: Props) {
  const isSuperAdmin = currentUserRole === "super_admin";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<PaketConfig | null>(null);
  const [slots, setSlots] = useState<ComponentSlot[]>([]);
  const [prices, setPrices] = useState<Map<string, BranchPrice>>(new Map());
  const [hpp, setHpp] = useState<Map<string, BranchHpp> | null>(null);

  // Pilihan preset (panel kiri)
  const [jenis, setJenis] = useState<Jenis>("analog");
  const [brandKey, setBrandKey] = useState<string>("");

  // Form paket (panel kanan)
  const [custName, setCustName] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [quoteDate, setQuoteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [custTypeKey, setCustTypeKey] = useState<CustomerTypeKey>("standar");
  const [ppnMode, setPpnMode] = useState<PpnMode>("non");
  const [lines, setLines] = useState<WorkingLine[]>([]);
  const [addItemOpen, setAddItemOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNo, setSavedNo] = useState<string | null>(null);

  // 5.10 -- "Buka di Kalkulator" dari Riwayat: quote lama yang sedang
  // diedit (null = sesi baru dari preset/kosong, seperti biasa).
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [editingQuoteNo, setEditingQuoteNo] = useState<string | null>(null);
  const [priceDiff, setPriceDiff] = useState<{ oldTotal: number; newTotal: number } | null>(null);
  const [openQuoteError, setOpenQuoteError] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Admin tidak bisa baca HPP (RLS) -- kunci ke tier yang tidak butuh HPP.
  useEffect(() => {
    if (!isSuperAdmin && custTypeKey !== "standar") setCustTypeKey("standar");
  }, [isSuperAdmin, custTypeKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      getPaketConfig(),
      listComponentSlots(),
      listBranchPrices(branchId),
      isSuperAdmin ? listBranchHpp(branchId) : Promise.resolve(null),
    ])
      .then(([cfg, slotRows, priceRows, hppRows]) => {
        if (cancelled) return;
        setConfig(cfg);
        setSlots(slotRows);
        setPrices(new Map(priceRows.map((p) => [p.slot_key, p])));
        setHpp(hppRows ? new Map(hppRows.map((h) => [h.slot_key, h])) : null);
        const firstBrand = Object.keys(cfg.brands.analog?.brands ?? {})[0] ?? "";
        setBrandKey((current) => current || firstBrand);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, isSuperAdmin]);

  // 5.10 -- kalau RiwayatPage titip nomor quote lewat sessionStorage
  // sebelum pindah ke menu ini ("Buka di Kalkulator"), muat sekali
  // setelah data harga cabang siap, lalu hapus titipannya.
  useEffect(() => {
    if (loading || !config) return;
    let pendingId: string | null = null;
    try {
      pendingId = window.sessionStorage.getItem(OPEN_QUOTE_SESSION_KEY);
      if (pendingId) window.sessionStorage.removeItem(OPEN_QUOTE_SESSION_KEY);
    } catch {
      /* storage bisa diblokir -- abaikan, tidak ada apa pun untuk dimuat */
    }
    if (pendingId) void loadSavedQuote(pendingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, config]);

  async function loadSavedQuote(quoteId: string) {
    setOpenQuoteError(null);
    try {
      const { quote, lines: savedLines } = await getQuoteWithLines(quoteId);
      const asWorking: WorkingLine[] = savedLines.map((l: QuoteLineRow) => ({
        id: l.id,
        slot_key: l.slot_key,
        is_custom: l.is_custom,
        nama_item: l.nama_item,
        tipe: l.tipe,
        satuan: l.satuan,
        qty: l.qty,
        harga_satuan: l.harga_satuan,
        hpp_satuan: l.hpp_satuan_saat_itu,
        sudah_ppn: l.sudah_ppn_saat_itu,
      }));
      setCustName(quote.cust_name);
      setCustAddress(quote.cust_address);
      setQuoteDate(quote.quote_date);
      setCustTypeKey(quote.cust_type_key);
      setPpnMode(quote.ppn_mode);
      if (quote.jenis) setJenis(quote.jenis);
      if (quote.brand_key) setBrandKey(quote.brand_key);
      setLines(asWorking);
      setEditingQuoteId(quote.id);
      setEditingQuoteNo(quote.no);
      setSavedNo(null);

      const custType = config?.customer_types.find((c) => c.key === quote.cust_type_key) ?? null;
      if (custType) {
        const diff = diffSnapshotVsCurrentPrice(
          savedLines,
          prices,
          hpp,
          custType,
          quote.cust_type_key,
          quote.ppn_mode,
          config?.ppn_rate_percent ?? quote.ppn_rate_pct_snapshot
        );
        setPriceDiff(diff.changed ? { oldTotal: diff.oldTotal, newTotal: diff.newTotal } : null);
      }
    } catch (err) {
      setOpenQuoteError((err as Error).message);
    }
  }

  function discardEditingQuote() {
    setEditingQuoteId(null);
    setEditingQuoteNo(null);
    setPriceDiff(null);
    startEmpty();
  }

  const jenisDef = config?.brands[jenis] ?? null;
  const brandOptions = jenisDef ? Object.entries(jenisDef.brands) : [];
  const activeBrandLabel = jenisDef?.brands[brandKey]?.label ?? "";
  const custTypeDef = config?.customer_types.find((c) => c.key === custTypeKey) ?? null;

  function hppFor(slotKey: string): number {
    return hpp?.get(slotKey)?.hpp ?? 0;
  }

  function priceLineFromSlot(slotKey: string, qty: number): WorkingLine | null {
    const price = prices.get(slotKey);
    const slot = slots.find((s) => s.slot_key === slotKey);
    if (!price || !slot || !custTypeDef) return null;
    const hppValue = hppFor(slotKey);
    return {
      id: newLocalId(),
      slot_key: slotKey,
      is_custom: false,
      nama_item: price.nama,
      tipe: slot.tipe,
      satuan: slot.satuan_default,
      qty,
      harga_satuan: resolveTierPrice(custTypeDef, hppValue, price.harga_jual),
      hpp_satuan: hppValue,
      sudah_ppn: price.sudah_ppn,
    };
  }

  /** Terapkan preset (5.1): ganti brand/jenis/qty melepas keterkaitan ke paket riwayat yang sedang diedit (mulai sesi baru). */
  function applyPreset(qtyPreset: number) {
    if (!jenisDef || !brandKey || !config) return;
    const resep = buildPresetSlotQty(jenisDef, brandKey, qtyPreset, config.cable_meter_per_camera);
    const built = resep
      .map(({ slot_key, qty }) => priceLineFromSlot(slot_key, qty))
      .filter((l): l is WorkingLine => l !== null);
    setLines(built);
    setSavedNo(null);
    setEditingQuoteId(null);
    setEditingQuoteNo(null);
    setPriceDiff(null);
  }

  function startEmpty() {
    setLines([]);
    setSavedNo(null);
    setEditingQuoteId(null);
    setEditingQuoteNo(null);
    setPriceDiff(null);
  }

  function updateLineQty(id: string, qty: number) {
    setLines((current) => current.map((l) => (l.id === id ? { ...l, qty: Math.max(0, qty) } : l)));
  }

  function removeLine(id: string) {
    setLines((current) => current.filter((l) => l.id !== id));
  }

  function addCatalogLine(slotKey: string) {
    const line = priceLineFromSlot(slotKey, 1);
    if (line) setLines((current) => [...current, line]);
    setAddItemOpen(false);
  }

  function addCustomLine(input: { nama: string; tipe: string; satuan: string; qty: number; hargaJual: number; hpp: number | null; sudahPpn: boolean }) {
    setLines((current) => [
      ...current,
      {
        id: newLocalId(),
        slot_key: null,
        is_custom: true,
        nama_item: input.nama,
        tipe: input.tipe,
        satuan: input.satuan,
        qty: input.qty,
        harga_satuan: input.hargaJual, // item custom: tetap, tidak ikut persentase tier (5.8)
        hpp_satuan: input.hpp ?? input.hargaJual, // kosong -> HPP = harga jual, margin baris nol (5.8)
        sudah_ppn: input.sudahPpn,
      },
    ]);
    setAddItemOpen(false);
  }

  // Re-hitung ulang harga_satuan semua baris dari katalog (bukan custom) kalau tier customer berganti,
  // supaya "Superadmin & Admin selalu melihat angka pasti" tetap konsisten dengan tier yang aktif.
  useEffect(() => {
    if (!custTypeDef) return;
    setLines((current) =>
      current.map((l) => {
        if (l.is_custom || !l.slot_key) return l;
        const price = prices.get(l.slot_key);
        if (!price) return l;
        return { ...l, harga_satuan: resolveTierPrice(custTypeDef, l.hpp_satuan, price.harga_jual) };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custTypeKey]);

  const brandWarning = useMemo(() => (lines.length ? checkBrandMismatch(lines, activeBrandLabel) : null), [lines, activeBrandLabel]);

  const rawTotal = config ? calcRawTotal(lines, custTypeKey, ppnMode, config.ppn_rate_percent) : 0;
  const displayTotal = roundDisplayTotal(rawTotal, custTypeKey);
  const totalHpp = calcTotalHpp(lines, custTypeKey);
  const totalSell = lines
    .filter((l) => !isJasaPasangExcludedForReseller(custTypeKey, l.tipe))
    .reduce((sum, l) => sum + l.qty * l.harga_satuan, 0);
  const margin = totalSell - totalHpp;

  async function handleSave() {
    if (!config || lines.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const quote = await saveQuote({
        branchId,
        branchName: branchName ?? "",
        custName,
        custAddress,
        quoteDate,
        custTypeKey,
        ppnMode,
        ppnRatePercentSnapshot: config.ppn_rate_percent,
        jenis,
        brandKey,
        lines,
        createdBy: currentUserId,
        createdByName: currentUserName,
      });
      setSavedNo(quote.no);
      setEditingQuoteId(quote.id);
      setEditingQuoteNo(quote.no);
      setPriceDiff(null);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  /** 5.10 -- "Perbarui": timpa record paket lama yang sedang dibuka dengan harga TERKINI (bukan snapshot lama). */
  async function handleUpdate() {
    if (!editingQuoteId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateQuote(editingQuoteId, {
        custName,
        custAddress,
        quoteDate,
        custTypeKey,
        ppnMode,
        ppnRatePercentSnapshot: config?.ppn_rate_percent,
        jenis,
        brandKey,
        lines,
        updatedBy: currentUserId,
      });
      setSavedNo(editingQuoteNo);
      setPriceDiff(null);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  /** 6.5 -- Export Excel via SheetJS: kop (nama cabang, alamat, telp, email) -> customer & tanggal -> tabel item -> total -> "Hormat kami," + penandatangan. Client-side, tidak lewat server. */
  async function handleExportExcel() {
    if (lines.length === 0 || !config) return;
    setExporting(true);
    setExportError(null);
    try {
      const [XLSX, branch] = await Promise.all([import("xlsx"), getBranch(branchId)]);
      const printLines = toPrintLines(lines, jenis);
      const rows: (string | number)[][] = [
        [branch.store_name || branch.name || ""],
        [[branch.address, branch.phone, branch.email].filter(Boolean).join(" · ")],
        [],
        ["Customer", custName],
        ["Alamat", custAddress],
        ["Tanggal", quoteDate],
        [],
        ["Item", "Qty", "Satuan", "Jumlah"],
        ...printLines.map((l) => [l.nama, l.qty, l.satuan, l.subtotal]),
        [],
        ["", "", "TOTAL", displayTotal],
        [],
        ["Hormat kami,"],
        [],
        [],
        [branch.signer_name || ""],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 32 }, { wch: 10 }, { wch: 10 }, { wch: 16 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Penawaran");
      const filenamePart = (custName || "paket").replace(/[^a-z0-9]+/gi, "_");
      XLSX.writeFile(wb, `Paket_CCTV_${filenamePart}.xlsx`);
    } catch (err) {
      setExportError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  function handlePreviewPdf() {
    setPrintOpen(true);
  }

  if (loading) return <div style={{ padding: 24, color: "#707786" }}>Memuat data harga cabang…</div>;
  if (loadError) return <div style={{ padding: 24, color: "#b23b2c" }}>Gagal memuat: {loadError}</div>;
  if (!config) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 20, padding: 20 }}>
      {/* ---------- Panel kiri: pilih preset ---------- */}
      <div style={{ flex: "0 0 280px", minWidth: 260 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Jenis Kamera</h3>
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {(Object.keys(config.brands) as Jenis[]).map((j) => (
            <button
              key={j}
              type="button"
              onClick={() => {
                setJenis(j);
                const first = Object.keys(config.brands[j]?.brands ?? {})[0] ?? "";
                setBrandKey(first);
              }}
              style={{
                flex: 1,
                padding: "8px 6px",
                borderRadius: 8,
                border: j === jenis ? "2px solid #2f6fed" : "1px solid #dfe5ed",
                background: j === jenis ? "#eaf1ff" : "#fff",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {config.brands[j]?.label ?? j}
            </button>
          ))}
        </div>

        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Brand &amp; Resolusi</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {brandOptions.map(([key, def]) => (
            <button
              key={key}
              type="button"
              onClick={() => setBrandKey(key)}
              style={{
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 8,
                border: key === brandKey ? "2px solid #2f6fed" : "1px solid #dfe5ed",
                background: key === brandKey ? "#eaf1ff" : "#fff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {def.label}
            </button>
          ))}
        </div>

        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Jumlah Kamera</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
          {PRESET_QTYS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => applyPreset(q)}
              disabled={!brandKey}
              style={{
                padding: "10px 6px",
                borderRadius: 8,
                border: "1px solid #dfe5ed",
                background: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: brandKey ? "pointer" : "not-allowed",
                opacity: brandKey ? 1 : 0.5,
              }}
            >
              {q} Kamera
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={startEmpty}
          style={{ width: "100%", padding: "8px 6px", borderRadius: 8, border: "1px solid #dfe5ed", background: "#f7f8fa", fontSize: 12.5, cursor: "pointer" }}
        >
          Mulai dari kosong
        </button>
      </div>

      {/* ---------- Panel kanan: form paket + tabel item ---------- */}
      <div style={{ flex: "1 1 480px", minWidth: 320 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <label style={{ fontSize: 12.5 }}>
            Nama Customer
            <input value={custName} onChange={(e) => setCustName(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12.5 }}>
            Tanggal
            <input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12.5, gridColumn: "1 / -1" }}>
            Alamat Customer
            <input value={custAddress} onChange={(e) => setCustAddress(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12.5 }}>
            Jenis Customer
            <select
              value={custTypeKey}
              onChange={(e) => setCustTypeKey(e.target.value as CustomerTypeKey)}
              style={inputStyle}
            >
              {config.customer_types.map((c) => {
                const disabled = !isSuperAdmin && c.pct_from_hpp !== null;
                return (
                  <option key={c.key} value={c.key} disabled={disabled}>
                    {c.label}
                    {disabled ? " (butuh akses HPP)" : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <label style={{ fontSize: 12.5 }}>
            Jenis Faktur
            <select value={ppnMode} onChange={(e) => setPpnMode(e.target.value as PpnMode)} style={inputStyle}>
              <option value="non">Non PPN</option>
              <option value="ppn">PPN ({config.ppn_rate_percent}%)</option>
            </select>
          </label>
        </div>

        {brandWarning && (
          <div style={{ background: "#fff8e8", color: "#8a5c10", padding: "8px 10px", borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>
            ⚠ {brandWarning}
          </div>
        )}

        <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse", marginBottom: 10 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dfe5ed" }}>
              <th style={thStyle}>Item</th>
              <th style={thStyle}>Qty</th>
              <th style={thStyle}>Satuan</th>
              <th style={thStyle}>Harga</th>
              <th style={thStyle}>Subtotal</th>
              {isSuperAdmin && <th style={thStyle}>HPP</th>}
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const excluded = isJasaPasangExcludedForReseller(custTypeKey, l.tipe);
              const subtotal = l.qty * l.harga_satuan;
              return (
                <tr key={l.id} style={{ borderBottom: "1px solid #f0f2f5", opacity: excluded ? 0.45 : 1 }}>
                  <td style={tdStyle}>
                    {l.nama_item}
                    {excluded && <div style={{ fontSize: 10.5, color: "#b23b2c" }}>tidak dihitung (Reseller)</div>}
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      value={l.qty}
                      onChange={(e) => updateLineQty(l.id, Number(e.target.value))}
                      style={{ width: 56, padding: "2px 4px" }}
                    />
                  </td>
                  <td style={tdStyle}>{l.satuan}</td>
                  <td style={tdStyle}>{currency(l.harga_satuan)}</td>
                  <td style={tdStyle}>{currency(subtotal)}</td>
                  {isSuperAdmin && <td style={tdStyle}>{currency(l.hpp_satuan)}</td>}
                  <td style={tdStyle}>
                    <button type="button" onClick={() => removeLine(l.id)} style={{ color: "#b23b2c", border: "none", background: "none", cursor: "pointer" }}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={isSuperAdmin ? 7 : 6} style={{ padding: 16, textAlign: "center", color: "#9aa1ac" }}>
                  Belum ada item. Pilih preset di panel kiri atau tambah item manual.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <button
          type="button"
          onClick={() => setAddItemOpen(true)}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #dfe5ed", background: "#fff", fontSize: 12.5, cursor: "pointer", marginBottom: 16 }}
        >
          + Tambah item
        </button>

        {addItemOpen && (
          <AddItemPanel
            slots={slots}
            prices={prices}
            onPickCatalog={addCatalogLine}
            onAddCustom={addCustomLine}
            onClose={() => setAddItemOpen(false)}
          />
        )}

        <div style={{ background: "#f7f8fa", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
          {isSuperAdmin && (
            <>
              <SummaryRow label="Total HPP" value={currency(totalHpp)} />
              <SummaryRow label="Total Jual (sebelum bulat)" value={currency(totalSell)} />
              <SummaryRow label="Margin" value={currency(margin)} />
            </>
          )}
          <SummaryRow label={`Total Paket (${custTypeDef?.label ?? ""}, dibulatkan)`} value={currency(displayTotal)} bold />
        </div>

        {editingQuoteNo && (
          <div style={{ background: "#eef1fb", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Sedang mengedit paket {editingQuoteNo}.</span>
            <button type="button" onClick={discardEditingQuote} style={{ border: "none", background: "none", color: "#2f6fed", cursor: "pointer", fontSize: 12.5 }}>
              Lepaskan &amp; mulai baru
            </button>
          </div>
        )}
        {priceDiff && (
          <div style={{ background: "#fff8e8", color: "#8a5c10", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, marginBottom: 10 }}>
            Harga hari ini berbeda dari saat dibuat: {currency(priceDiff.oldTotal)} → {currency(priceDiff.newTotal)}. "Perbarui" memakai harga terbaru, atau "Simpan sebagai Baru" untuk membuat nomor baru.
          </div>
        )}
        {openQuoteError && <p style={{ color: "#b23b2c", fontSize: 12.5, marginBottom: 10 }}>Gagal membuka paket: {openQuoteError}</p>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={handleExportExcel} disabled={exporting || lines.length === 0} style={btnGhost}>
            {exporting ? "Menyiapkan…" : "Export Excel"}
          </button>
          <button type="button" onClick={handlePreviewPdf} disabled={lines.length === 0} style={btnGhost}>Preview / Cetak</button>
          {editingQuoteId && (
            <button
              type="button"
              onClick={handleUpdate}
              disabled={saving}
              style={{ ...btnGhost, opacity: saving ? 0.6 : 1 }}
            >
              Perbarui Paket
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || lines.length === 0}
            style={{ ...btnPrimary, opacity: saving || lines.length === 0 ? 0.6 : 1 }}
          >
            {saving ? "Menyimpan…" : editingQuoteId ? "Simpan sebagai Baru" : "Simpan Paket"}
          </button>
        </div>

        {saveError && <p style={{ color: "#b23b2c", fontSize: 12.5, marginTop: 8 }}>Gagal menyimpan: {saveError}</p>}
        {exportError && <p style={{ color: "#b23b2c", fontSize: 12.5, marginTop: 8 }}>Gagal export: {exportError}</p>}
        {savedNo && <p style={{ color: "#1a7f37", fontSize: 12.5, marginTop: 8 }}>Tersimpan sebagai {savedNo}.</p>}
      </div>

      {printOpen && (
        <PaketPrintPreview
          branchId={branchId}
          jenis={jenis}
          lines={lines}
          custName={custName}
          custAddress={custAddress}
          quoteDate={quoteDate}
          custTypeLabel={custTypeDef?.label ?? ""}
          ppnMode={ppnMode}
          ppnRatePercent={config.ppn_rate_percent}
          rawTotal={rawTotal}
          displayTotal={displayTotal}
          quoteNo={editingQuoteNo}
          onClose={() => setPrintOpen(false)}
        />
      )}
    </div>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: bold ? 14 : 12.5, fontWeight: bold ? 800 : 500, padding: "2px 0" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Dialog sederhana "+ Tambah item" (5.8): pilih dari katalog cabang (semua tipe) atau isi item custom. */
function AddItemPanel({
  slots,
  prices,
  onPickCatalog,
  onAddCustom,
  onClose,
}: {
  slots: ComponentSlot[];
  prices: Map<string, BranchPrice>;
  onPickCatalog: (slotKey: string) => void;
  onAddCustom: (input: { nama: string; tipe: string; satuan: string; qty: number; hargaJual: number; hpp: number | null; sudahPpn: boolean }) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"katalog" | "custom">("katalog");
  const [custom, setCustom] = useState({ nama: "", tipe: "Aksesoris", satuan: "pcs", qty: 1, hargaJual: 0, hpp: "", sudahPpn: false });

  return (
    <div style={{ border: "1px solid #dfe5ed", borderRadius: 10, padding: 14, marginBottom: 16, background: "#fff" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button type="button" onClick={() => setMode("katalog")} style={mode === "katalog" ? tabActive : tabInactive}>
          Dari katalog
        </button>
        <button type="button" onClick={() => setMode("custom")} style={mode === "custom" ? tabActive : tabInactive}>
          Item custom
        </button>
        <button type="button" onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer" }}>
          ✕
        </button>
      </div>

      {mode === "katalog" && (
        <div style={{ maxHeight: 240, overflowY: "auto" }}>
          {slots.map((s) => {
            const price = prices.get(s.slot_key);
            if (!price) return null;
            return (
              <button
                key={s.slot_key}
                type="button"
                onClick={() => onPickCatalog(s.slot_key)}
                style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "6px 8px", border: "none", background: "none", cursor: "pointer", fontSize: 12.5, textAlign: "left" }}
              >
                <span>[{s.tipe}] {price.nama}</span>
                <span>{currency(price.harga_jual)}</span>
              </button>
            );
          })}
        </div>
      )}

      {mode === "custom" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={{ fontSize: 12, gridColumn: "1 / -1" }}>
            Nama item
            <input value={custom.nama} onChange={(e) => setCustom({ ...custom, nama: e.target.value })} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12 }}>
            Tipe
            <select value={custom.tipe} onChange={(e) => setCustom({ ...custom, tipe: e.target.value })} style={inputStyle}>
              {["Kamera", "DVR", "NVR", "Adaptor", "HDD", "Kabel", "Aksesoris", "Jasa Pasang", "POE", "Switch", "Memory Card"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>
            Satuan
            <input value={custom.satuan} onChange={(e) => setCustom({ ...custom, satuan: e.target.value })} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12 }}>
            Qty
            <input type="number" value={custom.qty} onChange={(e) => setCustom({ ...custom, qty: Number(e.target.value) })} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12 }}>
            Harga jual
            <input type="number" value={custom.hargaJual} onChange={(e) => setCustom({ ...custom, hargaJual: Number(e.target.value) })} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12 }}>
            HPP (opsional)
            <input type="number" value={custom.hpp} onChange={(e) => setCustom({ ...custom, hpp: e.target.value })} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={custom.sudahPpn} onChange={(e) => setCustom({ ...custom, sudahPpn: e.target.checked })} />
            Harga sudah termasuk PPN
          </label>
          <button
            type="button"
            onClick={() =>
              onAddCustom({
                nama: custom.nama,
                tipe: custom.tipe,
                satuan: custom.satuan,
                qty: custom.qty,
                hargaJual: custom.hargaJual,
                hpp: custom.hpp === "" ? null : Number(custom.hpp),
                sudahPpn: custom.sudahPpn,
              })
            }
            disabled={!custom.nama || custom.qty <= 0}
            style={{ ...btnPrimary, gridColumn: "1 / -1" }}
          >
            Tambahkan
          </button>
        </div>
      )}
    </div>
  );
}

const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 3,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #dfe5ed",
  fontSize: 13,
};
const thStyle: CSSProperties = { padding: "6px 8px", fontWeight: 700, color: "#4b5566" };
const tdStyle: CSSProperties = { padding: "6px 8px" };
const btnGhost: CSSProperties = { padding: "8px 14px", borderRadius: 999, border: "1px solid #dfe5ed", background: "#fff", fontSize: 12.5, cursor: "pointer" };
const btnPrimary: CSSProperties = { padding: "8px 16px", borderRadius: 999, border: "none", background: "#2f6fed", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
const tabActive: CSSProperties = { padding: "4px 10px", borderRadius: 999, border: "none", background: "#2f6fed", color: "#fff", fontSize: 12, cursor: "pointer" };
const tabInactive: CSSProperties = { padding: "4px 10px", borderRadius: 999, border: "1px solid #dfe5ed", background: "#fff", fontSize: 12, cursor: "pointer" };

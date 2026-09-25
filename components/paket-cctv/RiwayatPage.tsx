"use client";

// =====================================================
// components/paket-cctv/RiwayatPage.tsx
// =====================================================
// Implementasi bagian 6.3 handoff.
//
// Cabang ditentukan sepenuhnya dari tab aktif di PaketCctvModule (konsisten
// dengan pola Kas/Quote Builder di app ini) -- tidak ada dropdown cabang
// terpisah lagi di halaman ini, karena dulu kelihatan dobel/membingungkan
// dengan tab cabang yang sudah ada di atasnya.

import { useCallback, useEffect, useState } from "react";
import {
  type CustomerTypeKey,
  type ListQuotesFilter,
  type PpnMode,
  type QuoteLineRow,
  type QuoteRow,
  type QuoteStatus,
  deleteQuote,
  getQuoteWithLines,
  listQuotes,
  updateQuoteStatus,
} from "@/lib/paket-cctv/api";
import { OPEN_QUOTE_SESSION_KEY } from "./KalkulatorPage";

type Props = {
  branchId: string;
  isSuperAdmin: boolean;
  currentUserId: string;
  onNavigate?: (page: "paket-kalkulator") => void;
};

const currency = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID", { maximumFractionDigits: 0 });

const STATUS_LABEL: Record<QuoteStatus, string> = { menunggu: "Menunggu", deal: "Deal", batal: "Batal" };
const STATUS_COLOR: Record<QuoteStatus, string> = { menunggu: "#8a5c10", deal: "#1a7f37", batal: "#b23b2c" };

export default function RiwayatPage({ branchId, isSuperAdmin, currentUserId, onNavigate }: Props) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<NonNullable<ListQuotesFilter["sort"]>>("newest");
  const [status, setStatus] = useState<QuoteStatus | "all">("all");
  const [custType, setCustType] = useState<CustomerTypeKey | "all">("all");
  const [ppnMode, setPpnMode] = useState<PpnMode | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailLines, setDetailLines] = useState<QuoteLineRow[] | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [deleteArmedId, setDeleteArmedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    const filter: ListQuotesFilter = {
      branchId,
      custTypeKey: custType === "all" ? undefined : custType,
      ppnMode: ppnMode === "all" ? undefined : ppnMode,
      status: status === "all" ? undefined : status,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: search || undefined,
      sort,
      limit: 200,
    };
    listQuotes(filter)
      .then(setRows)
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [branchId, custType, ppnMode, status, dateFrom, dateTo, search, sort]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function openDetail(id: string) {
    if (detailId === id) {
      setDetailId(null);
      return;
    }
    setDetailId(id);
    setDetailLines(null);
    setDetailError(null);
    try {
      const { lines } = await getQuoteWithLines(id);
      setDetailLines(lines);
    } catch (err) {
      setDetailError((err as Error).message);
    }
  }

  async function changeStatus(id: string, next: QuoteStatus) {
    setBusyId(id);
    try {
      await updateQuoteStatus(id, next, currentUserId);
      setRows((current) => current.map((r) => (r.id === id ? { ...r, status: next } : r)));
    } catch (err) {
      alert(`Gagal mengubah status: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  /** Superadmin, konfirmasi 2 langkah (6.3): klik pertama mempersenjatai, klik kedua yang benar-benar menghapus. */
  async function handleDelete(id: string) {
    if (deleteArmedId !== id) {
      setDeleteArmedId(id);
      return;
    }
    setBusyId(id);
    try {
      await deleteQuote(id);
      setRows((current) => current.filter((r) => r.id !== id));
    } catch (err) {
      alert(`Gagal menghapus: ${(err as Error).message}`);
    } finally {
      setBusyId(null);
      setDeleteArmedId(null);
    }
  }

  function openInKalkulator(id: string) {
    try {
      window.sessionStorage.setItem(OPEN_QUOTE_SESSION_KEY, id);
    } catch {
      /* kalau storage diblokir, navigasi tetap jalan tapi kalkulator akan mulai kosong */
    }
    onNavigate?.("paket-kalkulator");
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <input
          placeholder="Cari nomor atau nama customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, width: 220 }}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus | "all")} style={inputStyle}>
          <option value="all">Semua status</option>
          <option value="menunggu">Menunggu</option>
          <option value="deal">Deal</option>
          <option value="batal">Batal</option>
        </select>
        <select value={custType} onChange={(e) => setCustType(e.target.value as CustomerTypeKey | "all")} style={inputStyle}>
          <option value="all">Semua jenis customer</option>
          <option value="up">Customer Baru</option>
          <option value="standar">Customer Standar</option>
          <option value="khusus">Customer Khusus</option>
          <option value="reseller">Reseller</option>
        </select>
        <select value={ppnMode} onChange={(e) => setPpnMode(e.target.value as PpnMode | "all")} style={inputStyle}>
          <option value="all">Semua faktur</option>
          <option value="non">Non PPN</option>
          <option value="ppn">PPN</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} style={inputStyle}>
          <option value="newest">Terbaru</option>
          <option value="oldest">Terlama</option>
          <option value="total_desc">Total tertinggi</option>
          <option value="total_asc">Total terendah</option>
          <option value="name_asc">Nama A-Z</option>
          <option value="name_desc">Nama Z-A</option>
        </select>
      </div>

      {loading && <p style={{ color: "#707786", fontSize: 12.5 }}>Memuat riwayat…</p>}
      {loadError && <p style={{ color: "#b23b2c", fontSize: 12.5 }}>Gagal memuat: {loadError}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ border: "1px solid #dfe5ed", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: 13 }}>{r.no}</strong>
                <span style={{ marginLeft: 8, color: "#4b5566" }}>{r.cust_name || "(tanpa nama)"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: "#9aa1ac" }}>{r.quote_date}</span>
                <strong>{currency(r.total)}</strong>
                <select
                  value={r.status}
                  onChange={(e) => changeStatus(r.id, e.target.value as QuoteStatus)}
                  disabled={busyId === r.id}
                  style={{ ...inputStyle, color: STATUS_COLOR[r.status], fontWeight: 700, padding: "4px 8px" }}
                >
                  <option value="menunggu">{STATUS_LABEL.menunggu}</option>
                  <option value="deal">{STATUS_LABEL.deal}</option>
                  <option value="batal">{STATUS_LABEL.batal}</option>
                </select>
                <button type="button" onClick={() => openDetail(r.id)} style={btnGhost}>
                  {detailId === r.id ? "Tutup" : "Detail"}
                </button>
                <button type="button" onClick={() => openInKalkulator(r.id)} style={btnGhost}>
                  Buka di Kalkulator
                </button>
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => handleDelete(r.id)}
                    disabled={busyId === r.id}
                    style={{ ...btnGhost, color: "#b23b2c", borderColor: deleteArmedId === r.id ? "#b23b2c" : "#dfe5ed" }}
                  >
                    {deleteArmedId === r.id ? "Yakin hapus?" : "Hapus"}
                  </button>
                )}
              </div>
            </div>

            {detailId === r.id && (
              <div style={{ marginTop: 10, borderTop: "1px solid #f0f2f5", paddingTop: 10 }}>
                {detailError && <p style={{ color: "#b23b2c", fontSize: 12 }}>{detailError}</p>}
                {!detailLines && !detailError && <p style={{ fontSize: 12, color: "#9aa1ac" }}>Memuat detail…</p>}
                {detailLines && (
                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#4b5566" }}>
                        <th style={{ padding: "2px 6px" }}>Item</th>
                        <th style={{ padding: "2px 6px" }}>Qty</th>
                        <th style={{ padding: "2px 6px" }}>Harga</th>
                        <th style={{ padding: "2px 6px" }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailLines.map((l) => (
                        <tr key={l.id}>
                          <td style={{ padding: "2px 6px" }}>{l.nama_item}</td>
                          <td style={{ padding: "2px 6px" }}>{l.qty} {l.satuan}</td>
                          <td style={{ padding: "2px 6px" }}>{currency(l.harga_satuan)}</td>
                          <td style={{ padding: "2px 6px" }}>{currency(l.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {r.note && <p style={{ fontSize: 12, color: "#707786", marginTop: 6 }}>Catatan: {r.note}</p>}
              </div>
            )}
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <p style={{ color: "#9aa1ac", fontSize: 12.5, textAlign: "center", padding: 24 }}>Tidak ada paket yang cocok dengan filter ini.</p>
        )}
      </div>
    </div>
  );
}

const inputStyle = { padding: "6px 10px", borderRadius: 8, border: "1px solid #dfe5ed", fontSize: 12.5 };
const btnGhost = { padding: "5px 10px", borderRadius: 8, border: "1px solid #dfe5ed", background: "#fff", fontSize: 11.5, cursor: "pointer" };

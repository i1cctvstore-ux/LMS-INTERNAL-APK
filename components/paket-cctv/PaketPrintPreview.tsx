"use client";

// =====================================================
// components/paket-cctv/PaketPrintPreview.tsx
// =====================================================
// Implementasi bagian 6.4 (Preview & Cetak) untuk SATU paket -- baik
// yang baru dibuat di Kalkulator (belum tersimpan) maupun yang dibuka
// dari Riwayat. TIDAK membuat sistem kop surat baru -- reuse getBranch()
// + LOGO_PPN_BASE64/LOGO_NON_PPN_BASE64 dari Quote Builder, pola
// pickBranchInfo/logoIsBanner disalin dari QuoteEditorPage.tsx (lihat
// referensi di "Handoff -- Paket CCTV & Kop Surat Penawaran").
//
// "Daftar Harga Paket" (grid semua brand, A4 landscape, bagian 6.4 yang
// kedua) BUKAN di file ini -- itu dokumen berbeda (lihat
// DaftarHargaPaket.tsx), disederhanakan dari grid asli Excel jadi tabel
// qty->harga per brand; dicatat sebagai simplifikasi, bukan replika
// pixel-perfect grid 3-kolomnya.

import { useEffect, useState } from "react";
import { getBranch, toPrintLines, type BranchWithLetterhead, type Jenis, type WorkingLine } from "@/lib/paket-cctv/api";
import { LOGO_NON_PPN_BASE64, LOGO_PPN_BASE64 } from "@/components/quote-builder/QuoteEditorPage";

const currency = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID", { maximumFractionDigits: 0 });

type Props = {
  branchId: string;
  jenis: Jenis | null;
  lines: WorkingLine[];
  custName: string;
  custAddress: string;
  quoteDate: string;
  custTypeLabel: string;
  ppnMode: "non" | "ppn";
  ppnRatePercent: number;
  rawTotal: number;
  displayTotal: number;
  quoteNo?: string | null;
  onClose: () => void;
};

export default function PaketPrintPreview({
  branchId,
  jenis,
  lines,
  custName,
  custAddress,
  quoteDate,
  custTypeLabel,
  ppnMode,
  ppnRatePercent,
  rawTotal,
  displayTotal,
  quoteNo,
  onClose,
}: Props) {
  const [branch, setBranch] = useState<BranchWithLetterhead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"total" | "rinci">("total");

  useEffect(() => {
    let cancelled = false;
    getBranch(branchId)
      .then((b) => {
        if (!cancelled) setBranch(b);
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  // 6.4: dokumen ini dicetak A4 portrait -- @page disuntik sebelum
  // window.print(), sama seperti pola printDoc() di mockup asli, supaya
  // tidak tercampur dengan orientasi landscape dokumen lain (Daftar
  // Harga Paket) kalau dua-duanya dibuka di sesi print yang sama.
  function handlePrint() {
    const style = document.createElement("style");
    style.id = "paket-print-orientation";
    style.textContent = "@page { size: A4 portrait; margin: 14mm; }";
    document.head.appendChild(style);
    window.print();
    setTimeout(() => style.remove(), 500);
  }

  const usesPpn = ppnMode === "ppn";
  const pickBranchInfo = (ppnVal?: string | null, baseVal?: string | null) =>
    (usesPpn ? ppnVal?.trim() || baseVal?.trim() : baseVal?.trim()) || "";
  const storeName = pickBranchInfo(branch?.store_name_ppn, branch?.store_name);
  const phone = pickBranchInfo(branch?.phone_ppn, branch?.phone);
  const email = pickBranchInfo(branch?.email_ppn, branch?.email);
  const address = pickBranchInfo(branch?.address_ppn, branch?.address);
  const branchLogo = usesPpn ? branch?.logo_ppn_data : branch?.logo_non_ppn_data;
  const letterheadLogo = branchLogo || (usesPpn ? LOGO_PPN_BASE64 : LOGO_NON_PPN_BASE64);
  const logoIsBanner = Boolean(branchLogo) && Boolean(usesPpn ? branch?.logo_ppn_is_banner : branch?.logo_non_ppn_is_banner);

  const printLines = toPrintLines(lines, jenis);
  const rinciTotal = printLines.reduce((sum, l) => sum + l.subtotal, 0);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(23,27,38,.55)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{ background: "#fff", borderRadius: 12, maxWidth: 720, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: 20 }}>
        <div className="paket-print-toolbar" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button type="button" onClick={() => setMode("total")} style={mode === "total" ? tabActive : tabInactive}>
            Total paket saja
          </button>
          <button type="button" onClick={() => setMode("rinci")} style={mode === "rinci" ? tabActive : tabInactive}>
            Dengan harga rinci
          </button>
          <button type="button" onClick={handlePrint} style={{ ...tabActive, marginLeft: "auto", background: "#171b26" }}>
            Cetak / PDF
          </button>
          <button type="button" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16 }}>
            ✕
          </button>
        </div>

        {loadError && <p style={{ color: "#b23b2c", fontSize: 12.5 }}>Gagal memuat kop surat: {loadError}</p>}

        <article style={{ fontSize: 12.5, color: "#1d2433" }}>
          <header
            style={
              logoIsBanner
                ? { display: "block", paddingBottom: 0, borderBottom: "none" }
                : { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #171b26", paddingBottom: 10, marginBottom: 14 }
            }
          >
            {logoIsBanner ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={letterheadLogo} alt={storeName || branch?.name || "Logo cabang"} style={{ display: "block", width: "100%", height: "auto" }} />
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={letterheadLogo} alt={storeName || "Logo"} style={{ height: 48, width: "auto", objectFit: "contain" }} />
                <div style={{ textAlign: "right" }}>
                  {storeName && <strong style={{ display: "block", fontSize: 13 }}>{storeName}</strong>}
                  <span style={{ display: "block" }}>{phone || "(telepon belum diisi)"}</span>
                  <span style={{ display: "block" }}>{email || "(email belum diisi)"}</span>
                  <span style={{ display: "block" }}>{address || "(alamat belum diisi)"}</span>
                </div>
              </>
            )}
          </header>

          <section style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ color: "#707786" }}>Kepada Yth</div>
              <strong>{custName || "-"}</strong>
              {custAddress && <div>{custAddress}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              {quoteNo && <div>No. {quoteNo}</div>}
              <div>{quoteDate}</div>
              <div style={{ color: "#707786" }}>{custTypeLabel}</div>
            </div>
          </section>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #dfe5ed", textAlign: "left" }}>
                <th style={th}>No</th>
                <th style={th}>Keterangan</th>
                <th style={th}>Qty</th>
                <th style={th}>Satuan</th>
                {mode === "rinci" && <th style={th}>Jumlah</th>}
              </tr>
            </thead>
            <tbody>
              {printLines.map((l, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f0f2f5" }}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>{l.nama}</td>
                  <td style={td}>{l.qty}</td>
                  <td style={td}>{l.satuan}</td>
                  {mode === "rinci" && <td style={td}>{currency(l.subtotal)}</td>}
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ textAlign: "right", fontSize: 14, fontWeight: 800, marginBottom: 20 }}>
            TOTAL {mode === "rinci" ? "(RINCI, BELUM DIBULATKAN)" : `(${custTypeLabel.toUpperCase()}, DIBULATKAN)`}
            {": "}
            {currency(mode === "rinci" ? rinciTotal : displayTotal)}
          </div>

          {usesPpn && (
            <p style={{ color: "#707786", fontSize: 11 }}>
              PPN {ppnRatePercent}% berlaku untuk item yang belum termasuk PPN.
            </p>
          )}

          <footer style={{ marginTop: 30 }}>
            <p>Demikian penawaran ini kami sampaikan. Terima kasih.</p>
            <div style={{ height: 50 }} />
            {branch?.signer_name ? <strong>{branch.signer_name}</strong> : <em style={{ color: "#9aa1ac" }}>(nama penandatangan belum diisi)</em>}
          </footer>
        </article>
      </div>

      <style>{`@media print { .paket-print-toolbar { display: none !important; } }`}</style>
    </div>
  );
}

const th = { padding: "6px 8px", fontWeight: 700, color: "#4b5566" };
const td = { padding: "6px 8px" };
const tabActive = { padding: "6px 14px", borderRadius: 999, border: "none", background: "#2f6fed", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
const tabInactive = { padding: "6px 14px", borderRadius: 999, border: "1px solid #dfe5ed", background: "#fff", fontSize: 12.5, cursor: "pointer" };

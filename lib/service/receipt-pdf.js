import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// =====================================================
// Generator PDF buat 4 jenis cetakan modul Servis (tanda terima masuk,
// surat jalan supplier, tanda terima pengambilan, invoice) — MENGGANTI
// window.print() browser sepenuhnya. Karena ini bikin file PDF asli
// (bukan manggil dialog print bawaan browser), hasilnya BERSIH — tidak
// ada header/footer otomatis dari browser (judul halaman, tanggal, URL)
// yang sebelumnya selalu muncul.
// =====================================================

function rupiahPdf(n) {
  const v = Number(n) || 0;
  if (!v) return "-";
  return "Rp " + v.toLocaleString("id-ID");
}
function fmtDatePdf(d) {
  if (!d) return "-";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

// Kerangka dasar dipakai bareng ke-4 jenis cetakan — biar layoutnya
// konsisten (header toko, judul, subjudul) tanpa nulis ulang tiap kali.
function buildBaseDoc({ branchInfo, title, subtitle }) {
  // PENTING: harus pakai ukuran kertas STANDAR (A4/A5/Letter), bukan
  // custom -- kalau custom, printer fisik gak kenal ukurannya dan
  // malah maksa balik ke A4 dengan posisi konten berantakan. Ruang
  // kosong di bawah itu wajar buat dokumen bisnis yang dicetak, lebih
  // aman daripada resiko custom size bikin berantakan pas dicetak.
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  if (branchInfo && (branchInfo.address || branchInfo.phone || branchInfo.name)) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(branchInfo.name || "", pageWidth / 2, y, { align: "center" });
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    if (branchInfo.address) {
      // Alamat bisa panjang -- dibungkus (wrap) ke beberapa baris biar
      // gak kepotong di tepi kertas, bukan dipaksa 1 baris lurus.
      const addressLines = doc.splitTextToSize(branchInfo.address, pageWidth - 16);
      addressLines.forEach((line) => {
        doc.text(line, pageWidth / 2, y, { align: "center" });
        y += 3.5;
      });
      y += 0.5;
    }
    if (branchInfo.phone) {
      doc.text(`No. HP: ${branchInfo.phone}`, pageWidth / 2, y, { align: "center" });
      y += 4;
    }
    y += 2;
    doc.setDrawColor(200);
    doc.line(10, y, pageWidth - 10, y);
    y += 6;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, pageWidth / 2, y, { align: "center" });
  y += 6;

  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(120);
    doc.text(subtitle, pageWidth / 2, y, { align: "center" });
    doc.setTextColor(0);
    y += 8;
  } else {
    y += 3;
  }

  return { doc, pageWidth, y };
}

function addInfoLines(doc, y, lines) {
  doc.setFontSize(11);
  lines.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, 12, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(value || "-"), 32, y);
    y += 5;
  });
  return y + 2;
}

function addFooterAndSignatures(doc, y, pageWidth, footerText, leftLabel, rightLabel) {
  if (footerText) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    const lines = doc.splitTextToSize(footerText, pageWidth - 20);
    doc.text(lines, 10, y);
    doc.setTextColor(0);
    y += lines.length * 4 + 12;
  } else {
    y += 12;
  }
  const half = (pageWidth - 20) / 2;
  doc.setFontSize(10);
  doc.line(10, y, 10 + half - 10, y);
  doc.text(leftLabel, 10, y + 5);
  doc.line(10 + half + 10, y, pageWidth - 10, y);
  doc.text(rightLabel, 10 + half + 10, y + 5);
}

// ---------- 1. Tanda Terima Barang Masuk ----------
export function generateTandaTerimaPDF(items, branchInfo) {
  const customerName = items[0]?.customerName;
  const customerPhone = items[0]?.customerPhone;
  const date = items[0]?.tanggalTerima;

  const { doc, pageWidth, y: y0 } = buildBaseDoc({
    branchInfo,
    title: "TANDA TERIMA BARANG SERVIS",
    subtitle: `Tanggal: ${fmtDatePdf(date)}`,
  });
  const y = addInfoLines(doc, y0, [
    ["Nama", customerName],
    ["No HP", customerPhone],
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Brand / Produk", "SN", "Kelengkapan", "Keluhan / Catatan"]],
    body: items.map((c) => [`${c.brand} ${c.produk}`, c.snDiterima, c.kelengkapan || "-", c.catatan || "-"]),
    styles: { fontSize: 9.5, cellPadding: 3 },
    headStyles: { fillColor: [241, 245, 249], textColor: 30 },
    margin: { left: 10, right: 10 },
    tableWidth: pageWidth - 20,
  });

  const finalY = doc.lastAutoTable.finalY + 6;
  addFooterAndSignatures(
    doc,
    finalY,
    pageWidth,
    "Barang di atas diterima dalam kondisi seperti tercatat, untuk keperluan proses servis/garansi.",
    "Customer",
    "Toko",
  );
  doc.save(`tanda-terima-${(customerName || "customer").replace(/\s+/g, "-").toLowerCase()}-${date || ""}.pdf`);
}

// ---------- 2. Surat Jalan ke Supplier ----------
export function generateSuratJalanPDF(batch, items, branchInfo) {
  const { doc, pageWidth, y: y0 } = buildBaseDoc({
    branchInfo,
    title: "SURAT JALAN KE SUPPLIER",
    subtitle: batch.kodeBatch,
  });
  const y = addInfoLines(doc, y0, [
    ["Supplier", batch.supplier],
    ["Tanggal Kirim", fmtDatePdf(batch.tanggalKirim)],
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Brand / Produk", "SN", "Kerusakan", "Jenis"]],
    body: items.map((c) => [
      `${c.brand} ${c.produk}`,
      c.snDiterima,
      c.catatan || "-",
      c.jenis === "Ganti Baru" ? "Klaim Balik" : "Servis",
    ]),
    styles: { fontSize: 9.5, cellPadding: 3 },
    headStyles: { fillColor: [241, 245, 249], textColor: 30 },
    margin: { left: 10, right: 10 },
    tableWidth: pageWidth - 20,
  });

  const finalY = doc.lastAutoTable.finalY + 6;
  addFooterAndSignatures(
    doc,
    finalY,
    pageWidth,
    'Barang di atas diserahkan ke supplier sesuai daftar. Foto resi/tanda terima ditambahkan setelah pengiriman lewat menu "\u22ee" pada detail pengiriman ini.',
    "Toko",
    "Supplier",
  );
  doc.save(`surat-jalan-${batch.kodeBatch}.pdf`);
}

// ---------- 3. Tanda Terima Pengambilan ----------
export function generatePickupPDF(items) {
  const customerName = items[0]?.customerName;
  const customerPhone = items[0]?.customerPhone;
  const penangananLabel = (c) =>
    c.jenis === "Ganti Baru" ? "Ganti Baru" : c.jenis === "Servis" ? "Servis" : c.jenis || "-";

  const { doc, pageWidth, y: y0 } = buildBaseDoc({
    branchInfo: null,
    title: "TANDA TERIMA PENGAMBILAN BARANG",
    subtitle: `Tanggal: ${fmtDatePdf(new Date().toISOString().slice(0, 10))}`,
  });
  const y = addInfoLines(doc, y0, [
    ["Nama", customerName],
    ["No HP", customerPhone],
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Brand / Produk", "SN Diterima", "Penanganan", "SN Pengganti"]],
    body: items.map((c) => [
      `${c.brand} ${c.produk}`,
      c.snDiterima,
      penangananLabel(c),
      c.snPenggantiStock || c.snPenggantiSupplier || "-",
    ]),
    styles: { fontSize: 9.5, cellPadding: 3 },
    headStyles: { fillColor: [241, 245, 249], textColor: 30 },
    margin: { left: 10, right: 10 },
    tableWidth: pageWidth - 20,
  });

  const finalY = doc.lastAutoTable.finalY + 6;
  addFooterAndSignatures(
    doc,
    finalY,
    pageWidth,
    "Barang di atas telah diperiksa dan diterima kembali oleh customer dalam keadaan baik, sesuai penanganan yang tercatat.",
    "Customer",
    "Toko",
  );
  doc.save(`pengambilan-${(customerName || "customer").replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

// ---------- 4. Invoice ----------
export function generateInvoicePDF(data) {
  const { doc, pageWidth, y: y0 } = buildBaseDoc({
    branchInfo: null,
    title: "INVOICE",
    subtitle: `${data.invoiceNo} \u00b7 ${fmtDatePdf(data.date)}`,
  });
  const y = addInfoLines(doc, y0, [
    ["Nama", data.customerName],
    ["No HP", data.customerPhone],
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Item", "Qty", "Jumlah"]],
    body: (data.lines || []).map((l) => [
      l.label + (l.sn ? `\nSN ${l.sn}` : "") + (l.snPengganti ? `\nSN Pengganti ${l.snPengganti}` : ""),
      String(l.qty),
      l.isBarangInfo ? "-" : rupiahPdf(l.amount),
    ]),
    styles: { fontSize: 9.5, cellPadding: 3 },
    headStyles: { fillColor: [241, 245, 249], textColor: 30 },
    columnStyles: { 2: { halign: "right" } },
    margin: { left: 10, right: 10 },
    tableWidth: pageWidth - 20,
  });

  let finalY = doc.lastAutoTable.finalY + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Total", 12, finalY);
  doc.text(rupiahPdf(data.total), pageWidth - 12, finalY, { align: "right" });
  finalY += 8;

  addFooterAndSignatures(
    doc,
    finalY,
    pageWidth,
    "Terima kasih atas kepercayaan Anda menggunakan layanan servis kami. Invoice ini berlaku sekaligus sebagai tanda terima barang.",
    "Customer",
    "Toko",
  );
  doc.save(`invoice-${data.invoiceNo}.pdf`);
}

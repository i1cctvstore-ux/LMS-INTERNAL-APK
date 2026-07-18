import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, Search, Printer, Package, Truck, CheckCircle2, X, Upload,
  Pencil, Settings2, SlidersHorizontal, AlertTriangle, Loader2, Download,
  ImageOff, CircleDot, MessageCircle, PhoneCall, Eye, Columns3,
  PackageCheck, PackagePlus, ChevronDown, ChevronRight, ChevronLeft, Lock, Sparkles, Layers,
  ArrowRight, ReceiptText, Menu, PackageMinus, Camera, ClipboardList, MoreVertical,
  ChevronUp, ChevronsUpDown, Smartphone, Monitor, Clock, FileText, Wallet, BadgeCheck,
  Users, MapPin,
} from "lucide-react";
import { loadServiceData, persistServiceData, uploadServiceFile } from "@/lib/service/api";

// ---------- helpers ----------
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const fmtDate = (d) => {
  if (!d) return "-";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};
const daysSince = (d) => {
  if (!d) return 0;
  const dt = new Date(d + "T00:00:00");
  return Math.floor((Date.now() - dt.getTime()) / 86400000);
};
const daysSinceUpdate = (c) => daysSince(c.updatedAt ? c.updatedAt.slice(0, 10) : c.tanggalTerima);
const dateToISO = (dateStr) => new Date(`${dateStr || todayStr()}T12:00:00`).toISOString();
const rupiah = (n) => {
  const v = Number(n) || 0;
  if (!v) return "-";
  return "Rp " + v.toLocaleString("id-ID");
};
const sortByName = (list) => [...(list || [])].sort((a, b) => a.name.localeCompare(b.name, "id"));
function claimSnList(c) {
  const list = [];
  if (c.snDiterima) list.push({ label: "SN Diterima", value: c.snDiterima });
  if (c.snPenggantiStock) list.push({ label: "SN Pengganti (Stok Kita)", value: c.snPenggantiStock });
  if (c.snPenggantiSupplier) list.push({ label: "SN Pengganti (Servis)", value: c.snPenggantiSupplier });
  if (c.stokReimbursedReceivedSN) list.push({ label: "SN Restock (Klaim Balik)", value: c.stokReimbursedReceivedSN });
  return list;
}
const digitsOnly = (s) => (s || "").replace(/\D/g, "");
const waNumber = (phone) => {
  const d = digitsOnly(phone);
  if (d.startsWith("0")) return "62" + d.slice(1);
  if (d.startsWith("62")) return d;
  return d;
};
function buildTrackingLink(phone) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?view=cek&hp=${encodeURIComponent(digitsOnly(phone))}`;
}
function sendTrackingLinkWA(customerName, phone) {
  const link = buildTrackingLink(phone);
  const msg = `Halo ${customerName}, terima kasih sudah menyerahkan barang untuk servis/garansi. Anda bisa cek status prosesnya kapan saja lewat link ini:\n${link}`;
  window.open(`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(msg)}`, "_blank");
}

function initials(name) {
  return (name || "")
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}
function Avatar({ name, size = 9 }) {
  const sizeCls = size === 9 ? "size-9 text-xs" : size === 7 ? "size-7 text-[10px]" : "size-11 text-sm";
  return (
    <span className={`inline-flex ${sizeCls} shrink-0 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700`}>
      {initials(name)}
    </span>
  );
}

// ---------- status model ----------
const STATUS = ["Menunggu Konfirmasi", "Baru", "Di Supplier", "Siap Diambil", "Selesai"];
const STATUS_STYLE = {
  "Menunggu Konfirmasi": { dot: "bg-violet-500", text: "text-violet-800", bg: "bg-violet-100" },
  "Baru": { dot: "bg-blue-500", text: "text-blue-800", bg: "bg-blue-100" },
  "Di Supplier": { dot: "bg-amber-500", text: "text-amber-800", bg: "bg-amber-100" },
  "Siap Diambil": { dot: "bg-sky-500", text: "text-sky-800", bg: "bg-sky-100" },
  "Selesai": { dot: "bg-emerald-500", text: "text-emerald-800", bg: "bg-emerald-100" },
};
const STATUS_LABELS = {
  "Menunggu Konfirmasi": "Perlu Dicek",
  "Baru": "Siap Diproses",
  "Di Supplier": "Di Supplier",
  "Siap Diambil": "Siap Diambil",
  "Selesai": "Selesai",
};
const statusLabel = (s) => STATUS_LABELS[s] || s;
const JENIS = ["Ganti Baru", "Servis"];
const NAV_ITEMS = [
  ["claims", "Claim Barang", Package],
  ["supplier", "Proses ke Supplier", Truck],
  ["stok", "Inventaris", Layers],
  ["kas", "Kas Service", Wallet],
  ["settings", "Data Master", Settings2],
];

const DEFAULT_SPAREPARTS = [
  { id: uid(), name: "Kabel UTP Cat5e", unit: "meter", qty: 100 },
  { id: uid(), name: "Konektor BNC", unit: "pcs", qty: 50 },
  { id: uid(), name: "Konektor DC", unit: "pcs", qty: 50 },
  { id: uid(), name: "Adaptor 12V 2A", unit: "pcs", qty: 20 },
  { id: uid(), name: "Baterai CMOS DVR/NVR", unit: "pcs", qty: 15 },
  { id: uid(), name: "HDD Internal (refurbish)", unit: "unit", qty: 5 },
  { id: uid(), name: "Fuse / Sekring", unit: "pcs", qty: 30 },
  { id: uid(), name: "Bracket Kamera", unit: "pcs", qty: 25 },
  { id: uid(), name: "Kabel Power", unit: "meter", qty: 40 },
  { id: uid(), name: "Kipas / Fan DVR", unit: "pcs", qty: 10 },
];

const DEFAULT_PRODUCTS = [
  { id: uid(), sku: "CCTV-DOME-2MP", name: "Kamera Dome Analog 2MP" },
  { id: uid(), sku: "CCTV-BULLET-2MP", name: "Kamera Bullet Analog 2MP" },
  { id: uid(), sku: "CCTV-DVR-4CH", name: "DVR 4 Channel" },
  { id: uid(), sku: "CCTV-DVR-8CH", name: "DVR 8 Channel" },
  { id: uid(), sku: "CCTV-NVR-4CH", name: "NVR 4 Channel" },
  { id: uid(), sku: "EZV-C6N-2MP", name: "C6N 2MP" },
  { id: uid(), sku: "EZV-H6C-2MP", name: "H6c 2MP" },
  { id: uid(), sku: "DHA-HDW1230-2MP", name: "IPC-HDW1230" },
  { id: uid(), sku: "HLK-THCB120-M", name: "THC-B120-M" },
  { id: uid(), sku: "DHA-HFW1230-2MP", name: "IPC-HFW1230" },
  { id: uid(), sku: "EZV-C3N-4MP", name: "C3N 4MP" },
  { id: uid(), sku: "HIK-2CE16D0T-2MP", name: "DS-2CE16D0T-2MP" },
];

const DEFAULT_SETTINGS = {
  brands: ["Hikvision", "Ezviz", "Hilook", "Dahua"],
  suppliers: ["Ezviz Service Center", "Hikvision SC Jakarta", "Dahua SC Jakarta"],
  supplierDetails: [],
  spareParts: DEFAULT_SPAREPARTS,
  products: DEFAULT_PRODUCTS,
  customers: [],
  sparepartStockLog: [],
  hiddenColumns: ["biayaToko", "biayaSupplier", "tglKembaliSupplier", "sumber", "produkSku"],
};

const OPTIONAL_COLUMNS = [
  { key: "noHp", label: "No HP" },
  { key: "produkSku", label: "SKU Produk" },
  { key: "garansi", label: "Garansi" },
  { key: "jenis", label: "Jenis" },
  { key: "kelengkapan", label: "Kelengkapan" },
  { key: "hasilSupplier", label: "Hasil dari Supplier" },
  { key: "sumber", label: "Sumber Penyelesaian" },
  { key: "supplier", label: "Supplier" },
  { key: "biayaToko", label: "Biaya Toko" },
  { key: "biayaSupplier", label: "Biaya Supplier" },
  { key: "batch", label: "Kode Batch" },
  { key: "tglKirim", label: "Tgl Kirim Supplier" },
  { key: "tglKembaliSupplier", label: "Tgl Kembali Supplier" },
  { key: "tglAmbilCustomer", label: "Tgl Diambil Cust." },
  { key: "catatan", label: "Catatan" },
];

function emptyRow() {
  return {
    rowId: uid(),
    brand: "",
    produk: "",
    produkSku: "",
    snDiterima: "",
    garansi: "Ya",
    jenis: "",
    kelengkapan: "",
    catatan: "",
    biayaToko: "",
  };
}

function dummyData() {
  const claims = [
    {
      id: uid(), groupId: "g1", customerName: "Budi Santoso", customerPhone: "081234567801",
      tanggalTerima: daysAgo(3), brand: "Ezviz", produk: "C6N 2MP", produkSku: "EZV-C6N-2MP", snDiterima: "EZC6N0001A",
      garansi: "Ya", jenis: "", kelengkapan: "Dus, adaptor", catatan: "Gambar bergaris di semua channel",
      snPenggantiStock: "", biayaToko: "", biayaJasaServis: "", partsUsed: [], stokBarangUsed: "",
      status: "Menunggu Konfirmasi",
      supplier: "", batchId: "", tanggalKirimSupplier: "",
      tanggalKembaliSupplier: "", hasilSupplier: "", snPenggantiSupplier: "", biayaSupplier: "",
      sumberPenyelesaian: "", tanggalAmbilCustomer: "", metodeBayarAmbil: "",
    },
    {
      id: uid(), groupId: "g2", customerName: "Siti Aminah", customerPhone: "081234567802",
      tanggalTerima: daysAgo(40), brand: "Ezviz", produk: "H6c 2MP", produkSku: "EZV-H6C-2MP", snDiterima: "HKDS0002B",
      garansi: "Ya", jenis: "Ganti Baru", kelengkapan: "-", catatan: "Mati total, tidak connect ke app",
      snPenggantiStock: "", biayaToko: "", biayaJasaServis: "", partsUsed: [], stokBarangUsed: "",
      status: "Di Supplier",
      supplier: "Ezviz Service Center", batchId: "batch-1", tanggalKirimSupplier: daysAgo(35),
      tanggalKembaliSupplier: "", hasilSupplier: "", snPenggantiSupplier: "", biayaSupplier: "",
      sumberPenyelesaian: "", tanggalAmbilCustomer: "", metodeBayarAmbil: "",
    },
    {
      id: uid(), groupId: "g3", customerName: "Andi Wijaya", customerPhone: "081234567803",
      tanggalTerima: daysAgo(50), brand: "Dahua", produk: "IPC-HDW1230", produkSku: "DHA-HDW1230-2MP", snDiterima: "DHIPC0003C",
      garansi: "Tidak", jenis: "Servis", kelengkapan: "Bracket", catatan: "Gambar noise malam hari, minta ganti mainboard",
      snPenggantiStock: "", biayaToko: "50000", biayaJasaServis: "30000", partsUsed: [{ partId: DEFAULT_SPAREPARTS[4].id, qty: 1, price: 20000 }], stokBarangUsed: "",
      status: "Siap Diambil",
      supplier: "Dahua SC Jakarta", batchId: "batch-2", tanggalKirimSupplier: daysAgo(20),
      tanggalKembaliSupplier: daysAgo(5), hasilSupplier: "Diservis", snPenggantiSupplier: "", biayaSupplier: "150000",
      sumberPenyelesaian: "Supplier", tanggalAmbilCustomer: "", metodeBayarAmbil: "",
    },
    {
      id: uid(), groupId: "g4", customerName: "Rina Kusuma", customerPhone: "081234567804",
      tanggalTerima: daysAgo(45), brand: "Ezviz", produk: "H6c 2MP", produkSku: "EZV-H6C-2MP", snDiterima: "EZH6C0004D",
      garansi: "Ya", jenis: "Ganti Baru", kelengkapan: "Dus lengkap", catatan: "Lensa buram, hasil rekaman blur",
      snPenggantiStock: "", biayaToko: "", biayaJasaServis: "", partsUsed: [], stokBarangUsed: "",
      status: "Selesai",
      supplier: "Ezviz Service Center", batchId: "batch-1", tanggalKirimSupplier: daysAgo(35),
      tanggalKembaliSupplier: daysAgo(8), hasilSupplier: "Diganti Unit Baru", snPenggantiSupplier: "EZH6C7004N", biayaSupplier: "",
      sumberPenyelesaian: "Supplier", tanggalAmbilCustomer: daysAgo(5), metodeBayarAmbil: "",
    },
    {
      id: uid(), groupId: "g5", customerName: "Toko Jaya Kamera", customerPhone: "081234567805",
      tanggalTerima: daysAgo(1), brand: "Hilook", produk: "THC-B120-M", produkSku: "HLK-THCB120-M", snDiterima: "HLTHC0005E",
      garansi: "Ya", jenis: "", kelengkapan: "-", catatan: "Tidak ada gambar sama sekali",
      snPenggantiStock: "", biayaToko: "", biayaJasaServis: "", partsUsed: [], stokBarangUsed: "",
      status: "Menunggu Konfirmasi",
      supplier: "", batchId: "", tanggalKirimSupplier: "",
      tanggalKembaliSupplier: "", hasilSupplier: "", snPenggantiSupplier: "", biayaSupplier: "",
      sumberPenyelesaian: "", tanggalAmbilCustomer: "", metodeBayarAmbil: "",
    },
    {
      id: uid(), groupId: "g6", customerName: "Dewi Lestari", customerPhone: "081234567806",
      tanggalTerima: daysAgo(2), brand: "Dahua", produk: "IPC-HFW1230", produkSku: "DHA-HFW1230-2MP", snDiterima: "DHIPC0006F",
      garansi: "Ya", jenis: "Ganti Baru", kelengkapan: "Dus, bracket", catatan: "Kena petir, mati total",
      snPenggantiStock: "", biayaToko: "", biayaJasaServis: "", partsUsed: [], stokBarangUsed: "",
      status: "Baru",
      supplier: "", batchId: "", tanggalKirimSupplier: "",
      tanggalKembaliSupplier: "", hasilSupplier: "", snPenggantiSupplier: "", biayaSupplier: "",
      sumberPenyelesaian: "", tanggalAmbilCustomer: "", metodeBayarAmbil: "",
    },
    {
      id: uid(), groupId: "g6", customerName: "Dewi Lestari", customerPhone: "081234567806",
      tanggalTerima: daysAgo(2), brand: "Ezviz", produk: "C3N 4MP", produkSku: "EZV-C3N-4MP", snDiterima: "EZC3N0006G",
      garansi: "Ya", jenis: "Servis", kelengkapan: "Dus lengkap", catatan: "Warna gambar pink/magenta",
      snPenggantiStock: "", biayaToko: "35000", biayaJasaServis: "35000", partsUsed: [], stokBarangUsed: "",
      status: "Siap Diambil",
      supplier: "", batchId: "", tanggalKirimSupplier: "",
      tanggalKembaliSupplier: "", hasilSupplier: "", snPenggantiSupplier: "", biayaSupplier: "",
      sumberPenyelesaian: "Servis di Toko", tanggalAmbilCustomer: "", metodeBayarAmbil: "",
    },
    {
      id: uid(), groupId: "g7", customerName: "Fajar Nugroho", customerPhone: "081234567807",
      tanggalTerima: daysAgo(15), brand: "Hikvision", produk: "DS-2CE16D0T-2MP", produkSku: "HIK-2CE16D0T-2MP", snDiterima: "HKDS2CE0007A",
      garansi: "Ya", jenis: "Servis", kelengkapan: "-", catatan: "Gambar bergaris, minta cek mainboard",
      snPenggantiStock: "", biayaToko: "", biayaJasaServis: "", partsUsed: [], stokBarangUsed: "",
      status: "Di Supplier",
      supplier: "Hikvision SC Jakarta", batchId: "batch-3", tanggalKirimSupplier: daysAgo(10),
      tanggalKembaliSupplier: "", hasilSupplier: "", snPenggantiSupplier: "", biayaSupplier: "",
      sumberPenyelesaian: "", tanggalAmbilCustomer: "", metodeBayarAmbil: "",
    },
    {
      id: uid(), groupId: "g8", customerName: "Nina Marlina", customerPhone: "081234567808",
      tanggalTerima: daysAgo(14), brand: "Hikvision", produk: "DS-2CE16D0T-2MP", produkSku: "HIK-2CE16D0T-2MP", snDiterima: "HKDS2CE0008B",
      garansi: "Tidak", jenis: "Servis", kelengkapan: "Dus", catatan: "Malam hari gambar hitam total",
      snPenggantiStock: "", biayaToko: "", biayaJasaServis: "", partsUsed: [], stokBarangUsed: "",
      status: "Di Supplier",
      supplier: "Hikvision SC Jakarta", batchId: "batch-3", tanggalKirimSupplier: daysAgo(10),
      tanggalKembaliSupplier: "", hasilSupplier: "", snPenggantiSupplier: "", biayaSupplier: "",
      sumberPenyelesaian: "", tanggalAmbilCustomer: "", metodeBayarAmbil: "",
    },
  ];
  const batches = [
    { id: "batch-1", kodeBatch: `KRM-${daysAgo(35).replace(/-/g, "")}-EZVISC`, supplier: "Ezviz Service Center", tanggalKirim: daysAgo(35), fotoResi: null, fotoSuratJalanTTD: null, fotoBuktiTerimaBalik: null, itemIds: claims.filter(c => c.batchId === "batch-1").map(c => c.id) },
    { id: "batch-2", kodeBatch: `KRM-${daysAgo(20).replace(/-/g, "")}-DAHUAS`, supplier: "Dahua SC Jakarta", tanggalKirim: daysAgo(20), fotoResi: null, fotoSuratJalanTTD: null, fotoBuktiTerimaBalik: null, itemIds: claims.filter(c => c.batchId === "batch-2").map(c => c.id) },
    { id: "batch-3", kodeBatch: `KRM-${daysAgo(10).replace(/-/g, "")}-HIKVIS`, supplier: "Hikvision SC Jakarta", tanggalKirim: daysAgo(10), fotoResi: null, fotoSuratJalanTTD: null, fotoBuktiTerimaBalik: null, itemIds: claims.filter(c => c.batchId === "batch-3").map(c => c.id) },
  ];
  return { claims, batches };
}

function dummyKasData(claims) {
  const andi = claims.find((c) => c.customerName === "Andi Wijaya");
  const dewiC3N = claims.find((c) => c.customerName === "Dewi Lestari" && c.produk === "C3N 4MP");
  const invoices = [];
  if (andi) {
    invoices.push({
      id: uid(),
      invoiceNo: `INV-${daysAgo(4).replace(/-/g, "")}-DEMO`,
      date: daysAgo(4),
      customerName: andi.customerName,
      customerPhone: andi.customerPhone,
      claimIds: [andi.id],
      lines: [
        { label: "Kabel Power", sn: "", qty: 1, price: 20000, amount: 20000, partId: DEFAULT_SPAREPARTS[4].id, locked: true },
        { label: "Jasa Servis", sn: "", qty: 1, price: 30000, amount: 30000 },
      ],
      total: 50000,
      metodeBayar: "Cash",
      verified: false,
    });
  }
  if (dewiC3N) {
    invoices.push({
      id: uid(),
      invoiceNo: `INV-${daysAgo(1).replace(/-/g, "")}-DEMO`,
      date: daysAgo(1),
      customerName: dewiC3N.customerName,
      customerPhone: dewiC3N.customerPhone,
      claimIds: [dewiC3N.id],
      lines: [{ label: "Jasa Servis", sn: "", qty: 1, price: 35000, amount: 35000 }],
      total: 35000,
      metodeBayar: "Transfer",
      verified: true,
    });
  }
  const setoranList = [
    { id: uid(), tanggal: daysAgo(3), jumlah: 40000, penyetor: "Husna", catatan: "Setoran mingguan" },
  ];
  return { invoices, setoranList };
}

// ---------- small UI atoms ----------
function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE["Baru"];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text} whitespace-nowrap`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {statusLabel(status)}
    </span>
  );
}

function LockedField({ label, value }) {
  return (
    <div>
      <label className="flex items-center gap-1 text-xs font-medium text-slate-400 mb-1">
        <Lock size={10} /> {label}
      </label>
      <div className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-slate-50 text-slate-600">
        {value || "-"}
      </div>
    </div>
  );
}

function HasilSupplierPicker({ value, sn, onChangeValue, onChangeSn }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button type="button" onClick={() => onChangeValue("Diganti Unit Baru")}
          className={`flex-1 px-2 py-1.5 rounded-full text-xs font-medium border ${value === "Diganti Unit Baru" ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-300 text-slate-600 bg-white"}`}>
          Diganti Unit Baru
        </button>
        <button type="button" onClick={() => onChangeValue("Diservis")}
          className={`flex-1 px-2 py-1.5 rounded-full text-xs font-medium border ${value === "Diservis" ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-300 text-slate-600 bg-white"}`}>
          Diservis (SN tetap sama)
        </button>
      </div>
      {value === "Diganti Unit Baru" && (
        <input placeholder="SN unit pengganti dari supplier" value={sn} onChange={(e) => onChangeSn(e.target.value)} className={inputCls} />
      )}
    </div>
  );
}

function SearchableCombo({ value, onChange, options, onAddOption, placeholder, formatOption }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const inputRef = useRef();

  useEffect(() => { setQuery(value || ""); }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return base.slice(0, 50);
  }, [options, query]);

  const exactMatch = options.some((o) => o.toLowerCase() === query.trim().toLowerCase());

  function pick(name) {
    onChange(name);
    setQuery(name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={inputCls}
        value={query}
        placeholder={placeholder || "Cari / pilih..."}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-40 max-h-56 overflow-y-auto">
            {filtered.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => pick(o)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 truncate"
              >
                {formatOption ? formatOption(o) : o}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">Tidak ditemukan.</div>}
            {query.trim() && !exactMatch && onAddOption && (
              <button
                type="button"
                onClick={() => { onAddOption(query.trim()); pick(query.trim()); }}
                className="w-full text-left px-3 py-2 text-sm text-indigo-600 font-medium hover:bg-indigo-50 border-t border-slate-100"
              >
                + Tambah "{query.trim()}" sebagai produk baru
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ProductCombo({ value, skuValue, onChange, products, onAddProduct, placeholder }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [newSkuDraft, setNewSkuDraft] = useState("");

  useEffect(() => { setQuery(value || ""); }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? (products || []).filter((p) => p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q))
      : (products || []);
    return sortByName(base).slice(0, 50);
  }, [products, query]);

  const exactMatch = (products || []).some((p) => p.name.toLowerCase() === query.trim().toLowerCase());
  const skuTaken = newSkuDraft.trim() && (products || []).some((p) => (p.sku || "").trim().toLowerCase() === newSkuDraft.trim().toLowerCase());

  function pick(product) {
    onChange(product.name, product.sku || "");
    setQuery(product.name);
    setNewSkuDraft("");
    setOpen(false);
  }

  function submitNewProduct() {
    const name = query.trim();
    const sku = newSkuDraft.trim();
    if (!name || !sku || skuTaken) return;
    onAddProduct(name, sku);
    pick({ name, sku });
  }

  return (
    <div className="relative">
      <input
        className={inputCls}
        value={query}
        placeholder={placeholder || "Cari nama atau SKU..."}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {value && skuValue && (
        <p className="text-[11px] text-slate-400 mt-1 font-mono">SKU: {skuValue}</p>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-40 max-h-72 overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p)}
                className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm hover:bg-slate-50"
              >
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 text-[10px] font-mono text-slate-400">{p.sku}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">Tidak ditemukan.</div>}
            {query.trim() && !exactMatch && onAddProduct && (
              <div className="border-t border-slate-100 p-2 space-y-1.5 bg-slate-50">
                <div className="text-xs text-slate-500 px-1">Produk baru: <span className="font-medium text-slate-700">"{query.trim()}"</span> — SKU wajib diisi</div>
                <input
                  autoFocus
                  className={inputCls + " font-mono text-xs bg-white"}
                  placeholder="SKU, mis. BRAND-TIPE-VARIASI"
                  value={newSkuDraft}
                  onChange={(e) => setNewSkuDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitNewProduct()}
                />
                {skuTaken && <p className="text-[11px] text-red-600 px-1">SKU ini sudah dipakai produk lain.</p>}
                <button
                  type="button"
                  disabled={!newSkuDraft.trim() || skuTaken}
                  onClick={submitNewProduct}
                  className="w-full px-3 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-medium"
                >
                  + Tambah sebagai produk baru
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Combo pencarian customer (Nama -> auto-isi No HP). Ketik nama baru = customer baru
// otomatis tersimpan ke Data Master saat form disubmit (lewat onAddCustomer di pemanggil).
function CustomerCombo({ value, onChange, customers, placeholder }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  useEffect(() => { setQuery(value || ""); }, [value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? (customers || []).filter((c) => c.name.toLowerCase().includes(q) || (c.phone || "").includes(q))
      : (customers || []);
    return base.slice(0, 50);
  }, [customers, query]);
  function pick(c) {
    onChange(c.name, c.phone || "");
    setQuery(c.name);
    setOpen(false);
  }
  return (
    <div className="relative">
      <input
        className={inputCls}
        value={query}
        placeholder={placeholder || "Ketik nama customer..."}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value, undefined); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-40 max-h-56 overflow-y-auto">
            {filtered.map((c) => (
              <button key={c.id} type="button" onClick={() => pick(c)} className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm hover:bg-slate-50">
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 text-[10px] font-mono text-slate-400">{c.phone}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ComboInput({ value, onChange, options, onAddOption, placeholder }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  if (adding) {
    return (
      <div className="flex gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onAddOption(draft.trim());
              onChange(draft.trim());
              setAdding(false);
              setDraft("");
            }
            if (e.key === "Escape") setAdding(false);
          }}
          placeholder="Nama baru..."
          className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button
          onClick={() => {
            if (draft.trim()) {
              onAddOption(draft.trim());
              onChange(draft.trim());
            }
            setAdding(false);
            setDraft("");
          }}
          className="px-2 rounded-lg bg-indigo-600 text-white text-sm"
        >
          OK
        </button>
      </div>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__add__") setAdding(true);
        else onChange(e.target.value);
      }}
      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
    >
      <option value="">{placeholder || "Pilih..."}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
      <option value="__add__">+ Tambah baru...</option>
    </select>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
const inputCls = "w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400";
const flexInputCls = "border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 flex-1 min-w-0";
// Primary CTA (indigo-600 solid) selalu pill (rounded-full) sesuai referensi desain v0.
// Secondary/outline tetap rounded-lg biar ada kontras hierarki tombol.
const btnPrimaryCls = "rounded-full bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-40";
const btnSecondaryCls = "rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 font-medium";

function Modal({ title, subtitle, onClose, children, wide, headerExtra }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-start sm:items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className={`bg-white rounded-3xl shadow-xl w-full ${wide ? "max-w-4xl" : "max-w-lg"} my-4`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-800">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-3">
            {headerExtra}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function FilterSheet({ title, onClose, children, onReset, onApply }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full sm:max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        <div className="flex gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onReset} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Reset</button>
          <button onClick={onApply} className={`flex-1 px-4 py-2.5 text-sm ${btnPrimaryCls}`}>Terapkan</button>
        </div>
      </div>
    </div>
  );
}

function PanelHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Icon size={18} />
        </span>
        <div>
          <div className="text-sm font-semibold text-slate-800 leading-tight">{title}</div>
          {description && <div className="text-xs text-slate-400 mt-0.5">{description}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1000;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.65));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const EMPTY_FILTERS = { q: "", brand: "", status: "", supplier: "", from: "", to: "" };

function useViewportIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 640 : true));
  useEffect(() => {
    function onResize() { setIsDesktop(window.innerWidth >= 640); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isDesktop;
}

function ViewModeBar({ viewMode, setViewMode }) {
  const options = [
    { key: "auto", label: "Auto", Icon: Sparkles },
    { key: "mobile", label: "Mobile", Icon: Smartphone },
    { key: "desktop", label: "Desktop", Icon: Monitor },
  ];
  return (
    <div className="sticky top-0 z-[70] flex items-center justify-center gap-1 bg-slate-900 text-white text-[11px] py-1.5 px-2">
      <span className="text-slate-400 mr-1">Tampilan:</span>
      {options.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => setViewMode(key)}
          className={`flex items-center gap-1 px-2 py-1 rounded-full ${viewMode === key ? "bg-white text-slate-900" : "text-slate-300 hover:bg-slate-700"}`}
        >
          <Icon size={11} /> {label}
        </button>
      ))}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("App error:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[70vh] flex items-center justify-center bg-slate-50 p-6">
          <div className="bg-white border border-red-200 rounded-3xl p-6 max-w-md text-center">
            <AlertTriangle className="mx-auto mb-3 text-red-400" size={28} />
            <p className="font-medium text-slate-800 mb-1">Terjadi error di aplikasi</p>
            <p className="text-sm text-slate-500 mb-4">{String(this.state.error.message || this.state.error)}</p>
            <button onClick={() => window.location.reload()} className={`px-4 py-2 text-sm ${btnPrimaryCls}`}>Muat Ulang</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// currentUserId: uuid akun Supabase yang login (dipakai buat created_by).
// currentUserRole: role asli dari tabel profiles ('super_admin'/'admin'/dst).
// currentUserBranchId: branch_id akun yang login (null kalau belum di-assign).
export default function ServisModule({ currentUserId, currentUserRole, currentUserBranchId, section }) {
  const isSuperAdmin = currentUserRole === "super_admin";
  const [branches, setBranches] = useState([]);
  const [activeBranchId, setActiveBranchId] = useState(isSuperAdmin ? null : currentUserBranchId);
  const [activeBranchName, setActiveBranchName] = useState(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch("/api/branches")
      .then((res) => res.json())
      .then((body) => setBranches((body.branches ?? []).filter((b) => b.active !== false)))
      .catch(() => {});
  }, [isSuperAdmin]);

  // Super Admin wajib pilih dulu "lagi lihat cabang mana" sebelum masuk —
  // modul ini didesain buat satu cabang per layar (sama seperti staf biasa
  // yang otomatis terkunci ke cabangnya sendiri).
  if (isSuperAdmin && !activeBranchId) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full">
          <p className="font-medium text-slate-800 mb-1">Pilih Cabang</p>
          <p className="text-sm text-slate-500 mb-4">Pilih cabang yang mau dilihat/dikelola data servisnya.</p>
          <div className="flex flex-col gap-2">
            {branches.map((b) => (
              <button
                key={b.id}
                onClick={() => { setActiveBranchId(b.id); setActiveBranchName(b.name); }}
                className="w-full px-4 py-2.5 text-sm rounded-2xl border border-slate-200 hover:bg-slate-50 text-left text-slate-700"
              >
                {b.name}
              </button>
            ))}
            {branches.length === 0 && <p className="text-xs text-slate-400">Memuat daftar cabang…</p>}
          </div>
        </div>
      </div>
    );
  }

  if (!activeBranchId) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-slate-50 p-6 text-center">
        <p className="text-sm text-slate-500 max-w-xs">
          Akun Anda belum di-assign ke cabang mana pun. Hubungi Super Admin dulu sebelum bisa memakai modul Servis.
        </p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <App
        branchId={activeBranchId}
        currentUserId={currentUserId}
        isSuperAdmin={isSuperAdmin}
        section={section}
        branchSwitcher={
          isSuperAdmin ? (
            <button
              onClick={() => { setActiveBranchId(null); setActiveBranchName(null); }}
              className="text-[11px] text-slate-400 hover:text-white underline underline-offset-2"
            >
              Ganti cabang{activeBranchName ? ` (sekarang: ${activeBranchName})` : ""}
            </button>
          ) : null
        }
      />
    </ErrorBoundary>
  );
}

// ---------- sidebar navigation ----------
function SidebarContent({ tab, setTab, onClose, roleLabel, branchSwitcher, collapsed, onToggleCollapse, showCollapseToggle }) {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800">
        {!collapsed && (
          <div>
            <div className="font-semibold leading-tight text-sm">Klaim Servis</div>
            <div className="text-xs text-slate-400">& Garansi</div>
          </div>
        )}
        <div className="flex items-center gap-1">
          {showCollapseToggle && (
            <button onClick={onToggleCollapse} className="text-slate-400 hover:text-white p-1" title={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}>
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}
          <button onClick={onClose} className="sm:hidden text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
      </div>
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => { setTab(key); onClose(); }}
            title={collapsed ? label : undefined}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-full text-sm font-medium ${collapsed ? "justify-center" : "text-left"} ${
              tab === key ? "bg-white text-slate-900" : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Icon size={16} /> {!collapsed && label}
          </button>
        ))}
      </nav>
      {!collapsed && (
        <div className="p-3 border-t border-slate-800 space-y-1.5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide px-1">Masuk sebagai</div>
          <div className="px-1 text-xs font-medium text-slate-200">{roleLabel}</div>
          {branchSwitcher ? <div className="px-1 pt-1">{branchSwitcher}</div> : null}
        </div>
      )}
    </>
  );
}

function Sidebar({ tab, setTab, open, onClose, roleLabel, branchSwitcher, isDesktopLayout, collapsed, onToggleCollapse }) {
  return (
    <>
      {isDesktopLayout && (
        <div className={`flex sticky top-0 h-screen ${collapsed ? "w-16" : "w-56"} bg-slate-900 text-white z-50 flex-col shrink-0 transition-[width]`}>
          <SidebarContent tab={tab} setTab={setTab} onClose={onClose} roleLabel={roleLabel} branchSwitcher={branchSwitcher} collapsed={collapsed} onToggleCollapse={onToggleCollapse} showCollapseToggle />
        </div>
      )}

      {!isDesktopLayout && open && (
        <div>
          <div className="fixed inset-0 bg-slate-900/50 z-40" onClick={onClose} />
          <div className="fixed top-0 left-0 h-full w-64 bg-slate-900 text-white z-50 flex flex-col">
            <SidebarContent tab={tab} setTab={setTab} onClose={onClose} roleLabel={roleLabel} branchSwitcher={branchSwitcher} collapsed={false} showCollapseToggle={false} />
          </div>
        </div>
      )}
    </>
  );
}

// ---------- main app ----------
function App({ branchId, currentUserId, isSuperAdmin, branchSwitcher, section }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [claims, setClaims] = useState([]);
  const [batches, setBatches] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loadError, setLoadError] = useState(false);

  const [tab, setTab] = useState(section || "claims");
  // Karena kelima menu Servis di sidebar sama-sama merender komponen
  // ServisModule/App yang sama, React tidak selalu me-remount ulang
  // komponennya waktu kamu pindah menu (cuma prop `section` yang berubah).
  // useState di atas cuma jalan sekali pas mount pertama, jadi tab internal
  // perlu disinkronkan manual tiap kali `section` berubah — supaya pindah
  // dari "Claim Barang" ke "Proses ke Supplier" dst di sidebar beneran
  // ganti konten, bukan nyangkut di section yang pertama dibuka.
  useEffect(() => {
    if (section && section !== tab) setTab(section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
  const [navOpen, setNavOpen] = useState(false);
  const [viewMode, setViewMode] = useState("auto");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const viewportIsDesktop = useViewportIsDesktop();
  const isDesktopLayout = viewMode === "auto" ? viewportIsDesktop : viewMode === "desktop";
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [ticketViewState, setTicketViewState] = useState("aktif");
  const [showFilter, setShowFilter] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [editClaim, setEditClaim] = useState(null);
  const [progressClaim, setProgressClaim] = useState(null);
  const [ticketDetailId, setTicketDetailId] = useState(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [supplierPreselectIds, setSupplierPreselectIds] = useState(null);
  const [viewBatchId, setViewBatchId] = useState(null);
  const [selected, setSelected] = useState([]);
  const [printGroup, setPrintGroup] = useState(null);
  const [uploadGroup, setUploadGroup] = useState(null);
  const [suratJalanBatch, setSuratJalanBatch] = useState(null);
  const [docViewTarget, setDocViewTarget] = useState(null);
  const [docUploadTarget, setDocUploadTarget] = useState(null);
  const [editBatchId, setEditBatchId] = useState(null);
  const [deleteBatchId, setDeleteBatchId] = useState(null);
  const [deleteConfirmClaim, setDeleteConfirmClaim] = useState(null);
  const [invoiceBuilderConfig, setInvoiceBuilderConfig] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [setoranList, setSetoranList] = useState([]);
  const [invoiceData, setInvoiceData] = useState(null);
  const [pickupGroup, setPickupGroup] = useState(null);
  const [previewPhone, setPreviewPhone] = useState(null);
  // "role" di sini TETAP dipakai persis seperti kode aslinya di bawah
  // (semua pengecekan role === "pusat" / role !== "pusat" di ~5000 baris
  // berikutnya TIDAK diubah). Yang berubah cuma sumbernya: dulu bisa
  // di-toggle bebas lewat tombol di sidebar, sekarang MENGIKUTI role asli
  // dari akun Supabase yang login — cuma super_admin yang dapat "pusat".
  const role = isSuperAdmin ? "pusat" : "admin";
  const roleLabel = isSuperAdmin ? "Super Admin (Admin Pusat)" : "Admin Cabang";
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }
  const dataRef = useRef({ claims: [], batches: [], settings: DEFAULT_SETTINGS, invoices: [], setoranList: [] });

  // Catatan: halaman tracking publik buat customer (dulu diakses lewat
  // ?view=cek&hp=...) BELUM dipindahkan ke Supabase di tahap ini — itu
  // butuh route publik terpisah (mirip /api/track di modul Proyek) karena
  // customer belum tentu login. Untuk sementara dinonaktifkan dulu.
  const isCustomerView = false;
  const prefillPhone = "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    loadServiceData(branchId)
      .then((data) => {
        if (cancelled) return;
        dataRef.current = data;
        setClaims(data.claims);
        setBatches(data.batches);
        setSettings(data.settings);
        setInvoices(data.invoices);
        setSetoranList(data.setoranList);
      })
      .catch((e) => {
        console.error("Gagal memuat data servis:", e);
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [branchId]);

  useEffect(() => {
    if (loading) return;
    setSettings((prev) => {
      const list = [...(prev.customers || [])];
      let changed = false;
      const seen = new Set();
      claims.forEach((c) => {
        const name = (c.customerName || "").trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        const idx = list.findIndex((cu) => cu.name.trim().toLowerCase() === key);
        if (idx === -1) {
          list.push({ id: uid(), name, phone: (c.customerPhone || "").trim(), alamat: "" });
          changed = true;
        } else if (c.customerPhone && c.customerPhone.trim() && list[idx].phone !== c.customerPhone.trim()) {
          list[idx] = { ...list[idx], phone: c.customerPhone.trim() };
          changed = true;
        }
      });
      if (!changed) return prev;
      const next = { ...prev, customers: list };
      persist({ settings: next });
      return next;
    });
  }, [claims, loading]);

  async function persist(next) {
    const payload = {
      claims: next.claims ?? dataRef.current.claims,
      batches: next.batches ?? dataRef.current.batches,
      settings: next.settings ?? dataRef.current.settings,
      invoices: next.invoices ?? dataRef.current.invoices,
      setoranList: next.setoranList ?? dataRef.current.setoranList,
    };
    const prevSnapshot = dataRef.current;
    dataRef.current = payload;
    if (next.claims) setClaims(payload.claims);
    if (next.batches) setBatches(payload.batches);
    if (next.settings) setSettings(payload.settings);
    if (next.invoices) setInvoices(payload.invoices);
    if (next.setoranList) setSetoranList(payload.setoranList);
    setSaving(true);
    try {
      await persistServiceData(branchId, prevSnapshot, next, currentUserId);
      setLoadError(false);
    } catch (e) {
      console.error("Gagal menyimpan data servis:", e);
      setLoadError(true);
      throw e;
    } finally {
      setSaving(false);
    }
  }

  function addSettingValue(type, value) {
    const trimmed = (value || "").trim();
    if (!trimmed) return;
    if (type === "suppliers") {
      addSupplier({ name: trimmed, phone: "", address: "" });
      return;
    }
    setSettings((prev) => {
      const list = prev[type].includes(trimmed) ? prev[type] : [...prev[type], trimmed];
      const next = { ...prev, [type]: list };
      persist({ settings: next });
      return next;
    });
  }

  function addSupplier(data) {
    const name = (data.name || "").trim();
    if (!name) return;
    setSettings((prev) => {
      const list = prev.supplierDetails || [];
      if (list.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) return prev;
      const nextDetails = [...list, { id: uid(), name, phone: (data.phone || "").trim(), address: (data.address || "").trim() }];
      const next = { ...prev, supplierDetails: nextDetails, suppliers: nextDetails.map((s) => s.name) };
      persist({ settings: next });
      return next;
    });
  }
  function updateSupplier(id, patch) {
    setSettings((prev) => {
      const nextDetails = (prev.supplierDetails || []).map((s) => (s.id === id ? { ...s, ...patch } : s));
      const next = { ...prev, supplierDetails: nextDetails, suppliers: nextDetails.map((s) => s.name) };
      persist({ settings: next });
      return next;
    });
  }
  function removeSupplier(id) {
    if (role !== "pusat") return;
    setSettings((prev) => {
      const nextDetails = (prev.supplierDetails || []).filter((s) => s.id !== id);
      const next = { ...prev, supplierDetails: nextDetails, suppliers: nextDetails.map((s) => s.name) };
      persist({ settings: next });
      return next;
    });
  }
  async function importSuppliers(rows) {
    const list = settings.supplierDetails || [];
    const existingNames = new Set(list.map((s) => s.name.trim().toLowerCase()));
    const additions = [];
    rows.forEach((r) => {
      const name = (r.name || "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (existingNames.has(key)) return;
      existingNames.add(key);
      additions.push({ id: uid(), name, phone: (r.phone || "").trim(), address: (r.address || "").trim() });
    });
    if (additions.length === 0) return;
    const nextDetails = [...list, ...additions];
    const next = { ...settings, supplierDetails: nextDetails, suppliers: nextDetails.map((s) => s.name) };
    await persist({ settings: next });
  }

  function addProduct(name, sku) {
    const trimmedName = (name || "").trim();
    const trimmedSku = (sku || "").trim();
    if (!trimmedName || !trimmedSku) return;
    setSettings((prev) => {
      const list = prev.products || [];
      const existsName = list.some((p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase());
      const existsSku = list.some((p) => (p.sku || "").trim().toLowerCase() === trimmedSku.toLowerCase());
      if (existsName || existsSku) return prev;
      const next = { ...prev, products: [...list, { id: uid(), sku: trimmedSku, name: trimmedName }] };
      persist({ settings: next });
      return next;
    });
  }
  function updateProduct(id, patch) {
    if (patch.sku !== undefined && !patch.sku.trim()) return;
    setSettings((prev) => {
      const next = { ...prev, products: (prev.products || []).map((p) => (p.id === id ? { ...p, ...patch } : p)) };
      persist({ settings: next });
      return next;
    });
  }
  function removeProduct(id) {
    setSettings((prev) => {
      const next = { ...prev, products: (prev.products || []).filter((p) => p.id !== id) };
      persist({ settings: next });
      return next;
    });
  }

  function findCustomerByName(name) {
    const n = (name || "").trim().toLowerCase();
    return (settings.customers || []).find((c) => c.name.trim().toLowerCase() === n);
  }
  function addOrUpdateCustomerFromIntake(name, phone) {
    const trimmedName = (name || "").trim();
    if (!trimmedName) return;
    setSettings((prev) => {
      const list = prev.customers || [];
      const existing = list.find((c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase());
      let nextList;
      if (existing) {
        if (phone && phone.trim() && phone.trim() !== existing.phone) {
          nextList = list.map((c) => (c.id === existing.id ? { ...c, phone: phone.trim() } : c));
        } else {
          nextList = list;
        }
      } else {
        nextList = [...list, { id: uid(), name: trimmedName, phone: (phone || "").trim(), alamat: "" }];
      }
      const next = { ...prev, customers: nextList };
      persist({ settings: next });
      return next;
    });
  }
  function updateCustomerAlamatByName(name, alamat) {
    const trimmedName = (name || "").trim();
    if (!trimmedName) return;
    setSettings((prev) => {
      const list = prev.customers || [];
      const existing = list.find((c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase());
      const nextList = existing
        ? list.map((c) => (c.id === existing.id ? { ...c, alamat: alamat.trim() } : c))
        : [...list, { id: uid(), name: trimmedName, phone: "", alamat: alamat.trim() }];
      const next = { ...prev, customers: nextList };
      persist({ settings: next });
      return next;
    });
  }
  function addCustomer(data) {
    const name = (data.name || "").trim();
    if (!name) return;
    setSettings((prev) => {
      const next = { ...prev, customers: [...(prev.customers || []), { id: uid(), name, phone: (data.phone || "").trim(), alamat: (data.alamat || "").trim() }] };
      persist({ settings: next });
      return next;
    });
  }
  function updateCustomer(id, patch) {
    setSettings((prev) => {
      const next = { ...prev, customers: (prev.customers || []).map((c) => (c.id === id ? { ...c, ...patch } : c)) };
      persist({ settings: next });
      return next;
    });
  }
  function removeCustomer(id) {
    if (role !== "pusat") return;
    setSettings((prev) => {
      const next = { ...prev, customers: (prev.customers || []).filter((c) => c.id !== id) };
      persist({ settings: next });
      return next;
    });
  }

  function toggleColumn(key) {
    setSettings((prev) => {
      const current = prev.hiddenColumns || [];
      const nextCols = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      const next = { ...prev, hiddenColumns: nextCols };
      persist({ settings: next });
      return next;
    });
  }

  function isDuplicateSN(sn, excludeId) {
    const s = (sn || "").trim().toLowerCase();
    if (!s) return false;
    return claims.some((c) => c.id !== excludeId && c.snDiterima.trim().toLowerCase() === s);
  }

  function handleAddClaims(customer, rows) {
    const groupId = uid();
    const newItems = rows.map((r) => ({
      id: uid(),
      groupId,
      customerName: customer.name,
      customerPhone: customer.phone,
      tanggalTerima: customer.tanggalTerima,
      brand: r.brand,
      produk: r.produk,
      produkSku: r.produkSku || "",
      snDiterima: r.snDiterima,
      garansi: r.garansi,
      jenis: "",
      kelengkapan: r.kelengkapan || "",
      catatan: r.catatan || "",
      snPenggantiStock: "",
      biayaToko: "",
      biayaJasaServis: "",
      partsUsed: [],
      fotoTandaTerimaCustomer: null,
      stokReimbursed: false,
      status: "Menunggu Konfirmasi",
      supplier: "", batchId: "", tanggalKirimSupplier: "",
      tanggalKembaliSupplier: "", hasilSupplier: "", snPenggantiSupplier: "", biayaSupplier: "",
      sumberPenyelesaian: "", tanggalAmbilCustomer: "", metodeBayarAmbil: "",
    }));
    persist({ claims: [...claims, ...newItems] });
    addOrUpdateCustomerFromIntake(customer.name, customer.phone);
    setShowAdd(false);
    setTicketDetailId(newItems[0].id);
  }

  function applyPartsDelta(prev, next, spareParts) {
    const delta = {};
    (prev || []).forEach((p) => { delta[p.partId] = (delta[p.partId] || 0) + Number(p.qty || 0); });
    (next || []).forEach((p) => { delta[p.partId] = (delta[p.partId] || 0) - Number(p.qty || 0); });
    return (spareParts || []).map((sp) => (delta[sp.id] ? { ...sp, qty: sp.qty + delta[sp.id] } : sp));
  }

  function logSparepartMovement(type, tanggal, items, note, claimIds) {
    if (!items || items.length === 0) return null;
    return { id: uid(), type, date: tanggal || todayStr(), note: note || "", items, claimIds: claimIds || [] };
  }

  function handleUpdateClaim(id, patch) {
    const original = claims.find((c) => c.id === id);
    let nextSettings = settings;
    if (patch.partsUsed && original) {
      nextSettings = { ...settings, spareParts: applyPartsDelta(original.partsUsed, patch.partsUsed, settings.spareParts) };
      const addedParts = patch.partsUsed.filter((p) => !(original.partsUsed || []).some((op) => op.partId === p.partId && op.qty === p.qty));
      if (addedParts.length) {
        const logItems = addedParts.map((p) => {
          const part = (settings.spareParts || []).find((sp) => sp.id === p.partId);
          return { partId: p.partId, name: part ? part.name : "Sparepart", qty: p.qty };
        });
        const entry = logSparepartMovement("keluar", todayStr(), logItems, `Dipakai servis — ${original.customerName}`, [original.id]);
        if (entry) nextSettings = { ...nextSettings, sparepartStockLog: [...(nextSettings.sparepartStockLog || []), entry] };
      }
    }
    const finalPatch = { ...patch, updatedAt: patch.updatedAt || new Date().toISOString() };
    if (original && original.status === "Menunggu Konfirmasi" && patch.jenis && !patch.status) {
      finalPatch.status = "Baru";
    }
    const nextClaims = claims.map((c) => (c.id === id ? { ...c, ...finalPatch } : c));
    persist({ claims: nextClaims, settings: nextSettings });
  }

  function addSparePart(part) {
    persist({ settings: { ...settings, spareParts: [...(settings.spareParts || []), { id: uid(), ...part }] } });
  }
  function updateSparePart(id, patch) {
    if (role !== "pusat") return;
    persist({ settings: { ...settings, spareParts: (settings.spareParts || []).map((p) => (p.id === id ? { ...p, ...patch } : p)) } });
  }
  function removeSparePart(id) {
    if (role !== "pusat") return;
    persist({ settings: { ...settings, spareParts: (settings.spareParts || []).filter((p) => p.id !== id) } });
  }
  // ---------- Import massal (paste dari Excel/Sheets) ----------
  // Ketiganya menghindari duplikat (dicek dari nama, atau SKU untuk
  // produk) dan cuma sekali persist() per batch import, bukan satu-satu.
  async function importProducts(rows) {
    const list = settings.products || [];
    const existingNames = new Set(list.map((p) => p.name.trim().toLowerCase()));
    const existingSkus = new Set(list.map((p) => (p.sku || "").trim().toLowerCase()));
    const additions = [];
    rows.forEach((r) => {
      const name = (r.name || "").trim();
      const sku = (r.sku || "").trim();
      if (!name || !sku) return;
      const nameKey = name.toLowerCase();
      const skuKey = sku.toLowerCase();
      if (existingNames.has(nameKey) || existingSkus.has(skuKey)) return;
      existingNames.add(nameKey);
      existingSkus.add(skuKey);
      additions.push({ id: uid(), sku, name });
    });
    if (additions.length === 0) return;
    const next = { ...settings, products: [...list, ...additions] };
    await persist({ settings: next });
  }
  async function importSpareParts(rows) {
    const list = settings.spareParts || [];
    const existingNames = new Set(list.map((p) => p.name.trim().toLowerCase()));
    const additions = [];
    rows.forEach((r) => {
      const name = (r.name || "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (existingNames.has(key)) return;
      existingNames.add(key);
      additions.push({ id: uid(), name, unit: (r.unit || "pcs").trim() || "pcs", qty: Number(r.qty) || 0 });
    });
    if (additions.length === 0) return;
    const next = { ...settings, spareParts: [...list, ...additions] };
    await persist({ settings: next });
  }
  async function importCustomers(rows) {
    const list = settings.customers || [];
    const existingNames = new Set(list.map((c) => c.name.trim().toLowerCase()));
    const additions = [];
    rows.forEach((r) => {
      const name = (r.name || "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (existingNames.has(key)) return;
      existingNames.add(key);
      additions.push({ id: uid(), name, phone: (r.phone || "").trim(), alamat: (r.alamat || "").trim() });
    });
    if (additions.length === 0) return;
    const next = { ...settings, customers: [...list, ...additions] };
    await persist({ settings: next });
  }
  function uploadTandaTerimaPhoto(claimIds, dataUrl) {
    persist({ claims: claims.map((c) => (claimIds.includes(c.id) ? { ...c, fotoTandaTerimaCustomer: dataUrl } : c)) });
  }
  function uploadBatchDoc(batchId, docKey, dataUrl) {
    persist({ batches: batches.map((b) => (b.id === batchId ? { ...b, [docKey]: dataUrl } : b)) });
  }
  function updateBatch(batchId, patch) {
    const nextBatches = batches.map((b) => (b.id === batchId ? { ...b, ...patch } : b));
    const nextClaims = claims.map((c) => {
      if (c.batchId === batchId) {
        return {
          ...c,
          ...(patch.supplier !== undefined ? { supplier: patch.supplier } : {}),
          ...(patch.tanggalKirim !== undefined ? { tanggalKirimSupplier: patch.tanggalKirim } : {}),
        };
      }
      if (c.stokReimbursedBatchId === batchId) {
        return {
          ...c,
          ...(patch.supplier !== undefined ? { stokReimbursedSupplier: patch.supplier } : {}),
          ...(patch.tanggalKirim !== undefined ? { stokReimbursedTanggal: patch.tanggalKirim } : {}),
        };
      }
      return c;
    });
    persist({ batches: nextBatches, claims: nextClaims });
  }
  function canDeleteBatch(batch) {
    if (!batch) return false;
    const items = claimsInBatch(claims, batch.id);
    return items.length > 0 && items.every((c) => !isDoneState(batchItemState(c)));
  }
  function deleteBatchAndRevert(batchId) {
    if (role !== "pusat") return;
    const batch = batches.find((b) => b.id === batchId);
    if (!canDeleteBatch(batch)) return;
    const nextClaims = claims.map((c) => {
      if (c.batchId === batchId) {
        return { ...c, batchId: "", supplier: "", tanggalKirimSupplier: "", status: "Baru", updatedAt: new Date().toISOString() };
      }
      if (c.stokReimbursedBatchId === batchId) {
        return { ...c, stokReimbursed: false, stokReimbursedBatchId: "", stokReimbursedSupplier: "", stokReimbursedTanggal: "", updatedAt: new Date().toISOString() };
      }
      return c;
    });
    persist({ claims: nextClaims, batches: batches.filter((b) => b.id !== batchId) });
  }
  function canDeleteClaim(claim) {
    return role === "pusat" && claim && claim.status === "Menunggu Konfirmasi";
  }
  function deleteClaim(claimId) {
    const claim = claims.find((c) => c.id === claimId);
    if (!canDeleteClaim(claim)) return;
    persist({ claims: claims.filter((c) => c.id !== claimId) });
  }
  function stockInSpareparts(tanggal, entries) {
    const byId = {};
    entries.forEach((e) => { byId[e.partId] = (byId[e.partId] || 0) + e.qty; });
    const nextSpareParts = (settings.spareParts || []).map((p) => (byId[p.id] ? { ...p, qty: p.qty + byId[p.id] } : p));
    const logItems = entries.map((e) => {
      const part = (settings.spareParts || []).find((p) => p.id === e.partId);
      return { partId: e.partId, name: part ? part.name : "Sparepart", qty: e.qty };
    });
    const logEntry = logSparepartMovement("masuk", tanggal, logItems, "Barang Masuk");
    persist({ settings: { ...settings, spareParts: nextSpareParts, sparepartStockLog: [...(settings.sparepartStockLog || []), logEntry] } });
  }
  function deleteSparepartStockInEntry(entryId) {
    if (role !== "pusat") return;
    const entry = (settings.sparepartStockLog || []).find((e) => e.id === entryId);
    if (!entry || entry.type === "keluar") return;
    const byId = {};
    entry.items.forEach((it) => { if (it.partId) byId[it.partId] = (byId[it.partId] || 0) + it.qty; });
    const nextSpareParts = (settings.spareParts || []).map((p) => (byId[p.id] ? { ...p, qty: Math.max(0, p.qty - byId[p.id]) } : p));
    persist({ settings: { ...settings, spareParts: nextSpareParts, sparepartStockLog: (settings.sparepartStockLog || []).filter((e) => e.id !== entryId) } });
  }
  function consumeSparepartsForInvoice(usageList, invoiceNo, customerName) {
    if (!usageList || usageList.length === 0) return;
    const usage = {};
    usageList.forEach((u) => { usage[u.partId] = (usage[u.partId] || 0) + u.qty; });
    const logItems = usageList.map((u) => {
      const part = (settings.spareParts || []).find((p) => p.id === u.partId);
      return { partId: u.partId, name: part ? part.name : "Sparepart", qty: u.qty };
    });
    const entry = logSparepartMovement("keluar", todayStr(), logItems, `Invoice ${invoiceNo || ""} — ${customerName || ""}`.trim());
    persist({ settings: { ...settings, spareParts: (settings.spareParts || []).map((p) => (usage[p.id] ? { ...p, qty: Math.max(0, p.qty - usage[p.id]) } : p)), sparepartStockLog: entry ? [...(settings.sparepartStockLog || []), entry] : settings.sparepartStockLog } });
  }
  function reconcileSparepartsForInvoiceEdit(oldUsageList, newUsageList) {
    const delta = {};
    (oldUsageList || []).forEach((u) => { delta[u.partId] = (delta[u.partId] || 0) - u.qty; });
    (newUsageList || []).forEach((u) => { delta[u.partId] = (delta[u.partId] || 0) + u.qty; });
    if (Object.keys(delta).length === 0) return;
    persist({ settings: { ...settings, spareParts: (settings.spareParts || []).map((p) => (delta[p.id] ? { ...p, qty: Math.max(0, p.qty - delta[p.id]) } : p)) } });
  }

  function addInvoiceRecord(data) {
    const record = { id: uid(), verified: false, ...data };
    persist({ invoices: [...invoices, record] });
    return record;
  }
  function updateInvoiceRecord(invoiceId, data) {
    const existing = invoices.find((inv) => inv.id === invoiceId);
    if (!existing) return null;
    const record = { ...existing, ...data, id: existing.id, invoiceNo: existing.invoiceNo, date: existing.date };
    persist({ invoices: invoices.map((inv) => (inv.id === invoiceId ? record : inv)) });
    return record;
  }
  function updateInvoiceMetodeBayar(invoiceId, metodeBayar) {
    if (role !== "pusat") return;
    persist({ invoices: invoices.map((inv) => (inv.id === invoiceId ? { ...inv, metodeBayar } : inv)) });
  }
  function setInvoiceMetodeBayarIfUnset(invoiceId, metodeBayar) {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv || inv.metodeBayar) return;
    persist({ invoices: invoices.map((i) => (i.id === invoiceId ? { ...i, metodeBayar } : i)) });
  }
  function toggleInvoiceVerified(invoiceId) {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    if (inv.verified && role !== "pusat") return;
    persist({ invoices: invoices.map((i) => (i.id === invoiceId ? { ...i, verified: !i.verified } : i)) });
  }
  function addSetoran(entry) {
    persist({ setoranList: [...setoranList, { id: uid(), ...entry }] });
  }
  function updateSetoran(id, patch) {
    if (role !== "pusat") return;
    persist({ setoranList: setoranList.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }
  function removeSetoran(id) {
    if (role !== "pusat") return;
    persist({ setoranList: setoranList.filter((s) => s.id !== id) });
  }

  function setJenis(claimId, jenis) {
    handleUpdateClaim(claimId, { jenis });
  }

  function goToSendSupplier(claimId) {
    setTab("supplier");
    setSupplierPreselectIds([claimId]);
    setShowSendModal(true);
  }

  function markSentToSupplier({ supplier, itemIds, fotoResi, tanggalKirim, kodeBatch }) {
    const batch = { id: uid(), kodeBatch, supplier, tanggalKirim, fotoResi, fotoSuratJalanTTD: null, fotoBuktiTerimaBalik: null, itemIds };
    const nextClaims = claims.map((c) => {
      if (!itemIds.includes(c.id)) return c;
      const isReimbursement = c.jenis === "Ganti Baru" && c.sumberPenyelesaian === "Stok Toko" && !c.stokReimbursed;
      if (isReimbursement) {
        return { ...c, stokReimbursed: true, stokReimbursedSupplier: supplier, stokReimbursedTanggal: tanggalKirim, stokReimbursedBatchId: batch.id, stokReimbursedReceivedSN: "", updatedAt: dateToISO(tanggalKirim) };
      }
      return { ...c, batchId: batch.id, supplier, tanggalKirimSupplier: tanggalKirim, status: "Di Supplier", jenis: c.jenis || "Servis", updatedAt: dateToISO(tanggalKirim) };
    });
    persist({ claims: nextClaims, batches: [...batches, batch] });
    showToast(`${itemIds.length} barang dikirim ke ${supplier} (${kodeBatch})`);
    setShowSendModal(false);
    setSupplierPreselectIds(null);
    setViewBatchId(batch.id);
  }

  function recordStokReimbursedSN(claimId, sn, tanggal) {
    const finalDate = tanggal || todayStr();
    handleUpdateClaim(claimId, { stokReimbursedReceivedSN: sn, stokReimbursedReceivedDate: finalDate, updatedAt: dateToISO(finalDate) });
  }

  function markReceivedFromSupplier(itemsPatch, tanggal) {
    const today = tanggal || todayStr();
    const patchMap = Object.fromEntries(itemsPatch.map((p) => [p.id, p]));
    const nextClaims = claims.map((c) => {
      if (!patchMap[c.id]) return c;
      const p = patchMap[c.id];
      return {
        ...c,
        tanggalKembaliSupplier: today,
        hasilSupplier: p.hasilSupplier || "Diservis",
        snPenggantiSupplier: p.snPenggantiSupplier || "",
        biayaSupplier: p.biayaSupplier !== undefined ? p.biayaSupplier : c.biayaSupplier,
        biayaToko: p.biayaCustomer !== undefined ? p.biayaCustomer : c.biayaToko,
        sumberPenyelesaian: "Supplier",
        status: "Siap Diambil",
        updatedAt: dateToISO(today),
      };
    });
    persist({ claims: nextClaims });
    showToast(`${itemsPatch.length} barang ditandai sudah kembali dari supplier`);
  }

  function handleReceiveFromSupplier(entries, tanggal) {
    const servisEntries = entries.filter((e) => e.type === "servis");
    const reimbEntries = entries.filter((e) => e.type === "reimbursement");
    if (servisEntries.length) markReceivedFromSupplier(servisEntries, tanggal);
    reimbEntries.forEach((e) => recordStokReimbursedSN(e.id, e.sn, tanggal));
    if (reimbEntries.length && !servisEntries.length) {
      showToast(`${reimbEntries.length} barang pengganti dari supplier dicatat`);
    } else if (reimbEntries.length) {
      showToast(`${entries.length} barang diproses (${servisEntries.length} kembali, ${reimbEntries.length} barang pengganti dicatat)`);
    }
  }

  function markReadyFromStock(claimId, { sn, biaya, jenisOverride, tanggal } = {}) {
    const claim = claims.find((c) => c.id === claimId);
    if (!claim) return;
    const patch = {
      snPenggantiStock: sn,
      jenis: jenisOverride || claim.jenis || "Ganti Baru",
      sumberPenyelesaian: "Stok Toko",
      stokReimbursed: false,
      status: "Siap Diambil",
    };
    patch.biayaToko = biaya !== undefined && biaya !== "" ? biaya : "";
    patch.updatedAt = dateToISO(tanggal || todayStr());
    persist({ claims: claims.map((c) => (c.id === claimId ? { ...c, ...patch } : c)) });
  }

  function markServicedOnSite(claimId, { biaya, biayaJasaServis, partsUsed, jenisOverride, tanggal } = {}) {
    const claim = claims.find((c) => c.id === claimId);
    if (!claim) return;
    const patch = {
      jenis: jenisOverride || claim.jenis || "Servis",
      sumberPenyelesaian: "Servis di Toko",
      status: "Siap Diambil",
      updatedAt: dateToISO(tanggal || todayStr()),
    };
    patch.biayaToko = biaya !== undefined && biaya !== "" ? biaya : "";
    patch.biayaJasaServis = biayaJasaServis !== undefined && biayaJasaServis !== "" ? biayaJasaServis : "";
    if (partsUsed && partsUsed.length) patch.partsUsed = [...(claim.partsUsed || []), ...partsUsed];
    handleUpdateClaim(claimId, patch);
  }

  function claimNeedsInvoice(claim) {
    return Number(claim?.biayaToko) > 0 && !hasInvoice(claim.id);
  }

  function markPickedUp(claimId, tanggal, metodeBayar) {
    const claim = claims.find((c) => c.id === claimId);
    const finalDate = tanggal || todayStr();
    handleUpdateClaim(claimId, { tanggalAmbilCustomer: finalDate, status: "Selesai", updatedAt: dateToISO(finalDate), metodeBayarAmbil: metodeBayar || "" });
    if (metodeBayar && claim) {
      const inv = findInvoiceForClaim(claimId);
      if (inv) setInvoiceMetodeBayarIfUnset(inv.id, metodeBayar);
    }
    if (claim) setPickupGroup([{ ...claim, tanggalAmbilCustomer: finalDate, status: "Selesai" }]);
  }
  function markPickedUpBulk(claimIds, tanggal, metodeBayar) {
    const finalDate = tanggal || todayStr();
    const updatedAt = dateToISO(finalDate);
    const targets = claims.filter((c) => claimIds.includes(c.id));
    const nextClaims = claims.map((c) => (claimIds.includes(c.id) ? { ...c, tanggalAmbilCustomer: finalDate, status: "Selesai", updatedAt, metodeBayarAmbil: metodeBayar || "" } : c));
    persist({ claims: nextClaims });
    if (metodeBayar) {
      const invoiceIds = new Set();
      claimIds.forEach((id) => { const inv = findInvoiceForClaim(id); if (inv) invoiceIds.add(inv.id); });
      invoiceIds.forEach((invId) => setInvoiceMetodeBayarIfUnset(invId, metodeBayar));
    }
    setPickupGroup(targets.map((c) => ({ ...c, tanggalAmbilCustomer: finalDate, status: "Selesai" })));
  }

  function findInvoiceForClaim(claimId) {
    return invoices.find((inv) => (inv.claimIds || []).includes(claimId)) || null;
  }
  function hasInvoice(claimId) {
    return !!findInvoiceForClaim(claimId);
  }
  function viewInvoiceForClaim(claimId) {
    const inv = findInvoiceForClaim(claimId);
    if (inv) setInvoiceData(inv);
  }
  function canStartNewInvoice(claimId) {
    return role === "pusat" || !hasInvoice(claimId);
  }
  function openInvoiceBuilder(claimIds, phone) {
    const ids = claimIds.filter(Boolean);
    if (ids.length === 0) return;
    const invoicesFound = [...new Set(ids.map((id) => findInvoiceForClaim(id)).filter(Boolean).map((inv) => inv.id))];
    if (role === "pusat" && invoicesFound.length === 1 && ids.every((id) => findInvoiceForClaim(id)?.id === invoicesFound[0])) {
      setInvoiceBuilderConfig({ phone: phone || "", preselectIds: ids, editingInvoiceId: invoicesFound[0] });
      return;
    }
    if (role !== "pusat" && ids.some((id) => hasInvoice(id))) {
      const blocked = ids.filter((id) => hasInvoice(id));
      const remaining = ids.filter((id) => !hasInvoice(id));
      if (remaining.length === 0) {
        showToast(`Semua barang yang dipilih sudah punya invoice — buka "Lihat Invoice" buat cek, atau minta Admin Pusat buat revisi.`);
        return;
      }
      showToast(`${blocked.length} barang dilewati (sudah ada invoice) — lanjut buat ${remaining.length} barang sisanya.`);
      setInvoiceBuilderConfig({ phone: phone || "", preselectIds: remaining });
      return;
    }
    setInvoiceBuilderConfig({ phone: phone || "", preselectIds: ids });
  }

  const filtered = useMemo(() => {
    return claims.filter((c) => {
      if (ticketViewState === "aktif" && c.status === "Selesai") return false;
      if (ticketViewState === "selesai" && c.status !== "Selesai") return false;
      if (filters.brand && c.brand !== filters.brand) return false;
      if (filters.status && c.status !== filters.status) return false;
      if (filters.supplier && c.supplier !== filters.supplier) return false;
      if (filters.from && c.tanggalTerima < filters.from) return false;
      if (filters.to && c.tanggalTerima > filters.to) return false;
      if (filters.overdue) {
        const n = Number(filters.overdue);
        if (!(daysSince(c.tanggalTerima) > n && c.status !== "Selesai")) return false;
      }
      if (filters.q) {
        const q = filters.q.toLowerCase();
        const hay = `${c.customerName} ${c.customerPhone} ${c.snDiterima} ${c.produk} ${c.snPenggantiSupplier} ${c.snPenggantiStock} ${c.stokReimbursedReceivedSN}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.tanggalTerima || "").localeCompare(a.tanggalTerima || ""));
  }, [claims, filters, ticketViewState]);

  const summary = useMemo(() => {
    const s = { "Menunggu Konfirmasi": 0, "Baru": 0, "Di Supplier": 0, "Siap Diambil": 0, "Selesai": 0 };
    claims.forEach((c) => { s[c.status] = (s[c.status] || 0) + 1; });
    return s;
  }, [claims]);

  const aktifCount = claims.length - summary["Selesai"];
  const selesaiCount = summary["Selesai"];

  function setTicketView(view) {
    setTicketViewState(view);
    setFilters((f) => (f.status ? { ...f, status: "" } : f));
  }

  function exportCSV() {
    const cols = [
      "Tgl Terima", "Customer", "No HP", "Brand", "Produk", "SKU Produk", "SN Diterima", "Garansi",
      "Jenis", "Kelengkapan", "SN Pengganti Stok", "Sumber Penyelesaian", "Supplier", "Biaya Toko", "Biaya Supplier",
      "Kode Batch", "Tgl Kirim Supplier", "Hasil dari Supplier", "SN Pengganti Supplier", "Tgl Kembali Supplier",
      "Tgl Diambil Customer", "Status", "Catatan",
    ];
    const rows = filtered.map((c) => [
      c.tanggalTerima, c.customerName, c.customerPhone, c.brand, c.produk, c.produkSku,
      c.snDiterima, c.garansi, c.jenis, c.kelengkapan, c.snPenggantiStock, c.sumberPenyelesaian, c.supplier, c.biayaToko,
      c.biayaSupplier,
      (batches.find((b) => b.id === c.batchId) || {}).kodeBatch || "",
      c.tanggalKirimSupplier, c.hasilSupplier, c.snPenggantiSupplier, c.tanggalKembaliSupplier, c.tanggalAmbilCustomer, c.status, c.catatan,
    ]);
    const csv = [cols, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `klaim-servis-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeFilterCount = ["brand", "status", "supplier", "from", "to", "overdue"].filter((k) => filters[k]).length;

  if (loading) {
    return <div className="min-h-[40vh] flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;
  }

  if (isCustomerView) {
    return <CustomerTrackPage claims={claims} initialPhone={prefillPhone} />;
  }

  const currentNavLabel = (NAV_ITEMS.find(([k]) => k === tab) || [, "Klaim Servis & Garansi"])[1];

  return (
    <div className="text-slate-800">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; top: 0; left: 0; width: 100%; }
        }
        input[type="date"] { background-color: white; color-scheme: light; box-sizing: border-box; width: 100%; min-width: 0; }
      `}</style>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div>
          <h1 className="font-semibold text-lg text-slate-800">{currentNavLabel}</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {roleLabel}
            {branchSwitcher ? <> · {branchSwitcher}</> : null}
            {" · "}
            {saving ? "Menyimpan..." : "Tersimpan"}
            {loadError && " · gagal simpan, coba lagi"}
          </p>
        </div>
      </div>

      <div>
        {tab === "claims" && (
          <ClaimsTab
            isDesktopLayout={isDesktopLayout}
            ticketView={ticketViewState}
            onSetTicketView={setTicketView}
            aktifCount={aktifCount}
            selesaiCount={selesaiCount}
            filtered={filtered}
            filters={filters}
            activeFilterCount={activeFilterCount}
            onOpenFilter={() => setShowFilter(true)}
            onSearch={(q) => setFilters({ ...filters, q })}
            onQuickFilterStatus={(status) => setFilters({ ...filters, status })}
            settings={settings}
            summary={summary}
            batches={batches}
            selected={selected}
            setSelected={setSelected}
            onAdd={() => setShowAdd(true)}
            onOpenDetail={(c) => setTicketDetailId(c.id)}
            onOpenProgress={(c) => setProgressClaim(c)}
            onPreview={(phone) => setPreviewPhone(phone)}
            onExport={exportCSV}
            onToggleColumn={toggleColumn}
            onPrintSelected={() => setPrintGroup(claims.filter((c) => selected.includes(c.id)))}
            onOpenInvoiceBuilder={() => setInvoiceBuilderConfig({ phone: "", preselectIds: [] })}
            onOpenInvoiceFromSelection={() => openInvoiceBuilder(selected, "")}
            onOpenInvoiceSingle={(c) => openInvoiceBuilder([c.id], c.customerPhone)}
            onViewInvoice={viewInvoiceForClaim}
            role={role}
            hasInvoice={hasInvoice}
          />
        )}
        {tab === "supplier" && (
          <SupplierTab
            batches={batches}
            claims={claims}
            settings={settings}
            role={role}
            isDesktopLayout={isDesktopLayout}
            onOpenSend={() => { setSupplierPreselectIds(null); setShowSendModal(true); }}
            onOpenReceive={(preselectIds) => { setSupplierPreselectIds(preselectIds || null); setShowReceiveModal(true); }}
            onView={(id) => setViewBatchId(id)}
            onPrintSuratJalan={(batch, items) => setSuratJalanBatch({ batch, items })}
            onViewDoc={(target) => setDocViewTarget(target)}
            onUploadDoc={(target) => setDocUploadTarget(target)}
            onEditBatch={(id) => setEditBatchId(id)}
            onDeleteBatch={(id) => setDeleteBatchId(id)}
            canDeleteBatch={canDeleteBatch}
          />
        )}
        {tab === "stok" && (
          <InventarisTab
            claims={claims}
            settings={settings}
            spareParts={settings.spareParts || []}
            sparepartStockLog={settings.sparepartStockLog || []}
            role={role}
            isDesktopLayout={isDesktopLayout}
            onAddSparepart={addSparePart}
            onUpdateSparepart={updateSparePart}
            onRemoveSparepart={removeSparePart}
            onStockInSpareparts={stockInSpareparts}
            onDeleteStockInEntry={deleteSparepartStockInEntry}
            onGoToSupplierTab={() => setTab("supplier")}
            onOpenTicket={(claimId) => setTicketDetailId(claimId)}
            onImportSpareparts={importSpareParts}
          />
        )}
        {tab === "kas" && (
          <KasServiceTab
            claims={claims}
            invoices={invoices}
            setoranList={setoranList}
            role={role}
            isDesktopLayout={isDesktopLayout}
            onAddSetoran={addSetoran}
            onUpdateSetoran={updateSetoran}
            onRemoveSetoran={removeSetoran}
            onToggleVerified={toggleInvoiceVerified}
            onUpdateMetodeBayar={updateInvoiceMetodeBayar}
          />
        )}
        {tab === "settings" && (
          <DataMasterTab settings={settings} onSave={(s) => persist({ settings: s })} claims={claims} batches={batches} role={role} onAddProduct={addProduct} onUpdateProduct={updateProduct} onRemoveProduct={removeProduct} onAddCustomer={addCustomer} onUpdateCustomer={updateCustomer} onRemoveCustomer={removeCustomer} onImportProducts={importProducts} onImportCustomers={importCustomers} onAddSupplier={addSupplier} onUpdateSupplier={updateSupplier} onRemoveSupplier={removeSupplier} onImportSuppliers={importSuppliers} />
        )}
        </div>

      {showFilter && (
        <FilterPopup
          filters={filters}
          settings={settings}
          onClose={() => setShowFilter(false)}
          onApply={(f) => { setFilters({ ...filters, ...f }); setShowFilter(false); }}
        />
      )}

      {showAdd && (
        <AddClaimModal
          settings={settings}
          onClose={() => setShowAdd(false)}
          onAddOption={addSettingValue}
          onAddProduct={addProduct}
          isDuplicateSN={isDuplicateSN}
          onSubmit={handleAddClaims}
        />
      )}

      {progressClaim && (
        <ProgressModal
          key={progressClaim.id}
          claim={claims.find((c) => c.id === progressClaim.id) || progressClaim}
          claims={claims}
          settings={settings}
          batches={batches}
          role={role}
          hasInvoice={hasInvoice}
          claimNeedsInvoice={claimNeedsInvoice}
          canDeleteFn={canDeleteClaim}
          onClose={() => setProgressClaim(null)}
          onAddSparepart={addSparePart}
          onSetJenis={(claimId, jenis) => {
            const c = claims.find((x) => x.id === claimId);
            setJenis(claimId, jenis);
            if (c) showToast(`${c.brand} ${c.produk} (${c.customerName}) → jenis ${jenis}`);
          }}
          onMarkReadyFromStock={(claimId, payload) => {
            const c = claims.find((x) => x.id === claimId);
            markReadyFromStock(claimId, payload);
            if (c) showToast(`${c.brand} ${c.produk} (${c.customerName}) → Siap Diambil`);
          }}
          onMarkServicedOnSite={(claimId, payload) => {
            const c = claims.find((x) => x.id === claimId);
            markServicedOnSite(claimId, payload);
            setProgressClaim(null);
            if (c) {
              showToast(`${c.brand} ${c.produk} (${c.customerName}) → Siap Diambil`);
              openInvoiceBuilder([claimId], c.customerPhone);
            }
          }}
          onMarkPickedUp={(claimId, tanggal, metodeBayar) => {
            const c = claims.find((x) => x.id === claimId);
            markPickedUp(claimId, tanggal, metodeBayar);
            if (c) showToast(`${c.brand} ${c.produk} (${c.customerName}) → Selesai`);
            setProgressClaim(null);
          }}
          onMarkPickedUpBulk={(claimIds, tanggal, metodeBayar) => {
            markPickedUpBulk(claimIds, tanggal, metodeBayar);
            showToast(`${claimIds.length} barang ditandai diambil oleh customer`);
            setProgressClaim(null);
          }}
          onGoToSendSupplier={(claimId) => { goToSendSupplier(claimId); setProgressClaim(null); }}
          onGoToReceiveSupplier={(claimId) => { setTab("supplier"); setSupplierPreselectIds([claimId]); setShowReceiveModal(true); setProgressClaim(null); }}
          onOpenFullEdit={(c) => { setEditClaim(c); setProgressClaim(null); }}
          onOpenInvoiceBuilder={(claimIds) => {
            const c = claims.find((x) => x.id === claimIds[0]);
            openInvoiceBuilder(claimIds, c ? c.customerPhone : "");
            setProgressClaim(null);
          }}
          onDeleteClaim={(c) => { setDeleteConfirmClaim(c); setProgressClaim(null); }}
          onPreview={(phone) => { setPreviewPhone(phone); setProgressClaim(null); }}
          onPrintPickup={(c) => { setPickupGroup([c]); setProgressClaim(null); }}
        />
      )}

      {ticketDetailId && (
        <TicketDetailModal
          key={ticketDetailId}
          claim={claims.find((c) => c.id === ticketDetailId)}
          claims={claims}
          settings={settings}
          role={role}
          hasInvoice={hasInvoice}
          claimNeedsInvoice={claimNeedsInvoice}
          canDeleteFn={canDeleteClaim}
          onClose={() => setTicketDetailId(null)}
          onPrint={(items) => setPrintGroup(items)}
          onUpload={(items) => setUploadGroup(items)}
          onEdit={(c) => { setEditClaim(c); setTicketDetailId(null); }}
          onDelete={(c) => { setDeleteConfirmClaim(c); setTicketDetailId(null); }}
          onGoToProgress={(c) => { setProgressClaim(c); setTicketDetailId(null); }}
          onOpenInvoiceSingle={(c) => { openInvoiceBuilder([c.id], c.customerPhone); setTicketDetailId(null); }}
          onOpenInvoiceMulti={(claimIds, phone) => { openInvoiceBuilder(claimIds, phone); setTicketDetailId(null); }}
          onViewInvoice={viewInvoiceForClaim}
        />
      )}

      {deleteConfirmClaim && (
        <DeleteConfirmModal
          claim={deleteConfirmClaim}
          onClose={() => setDeleteConfirmClaim(null)}
          onConfirm={() => { deleteClaim(deleteConfirmClaim.id); setDeleteConfirmClaim(null); }}
        />
      )}

      {editClaim && (
        <EditClaimModal
          key={editClaim.id}
          claim={claims.find((c) => c.id === editClaim.id) || editClaim}
          settings={settings}
          batches={batches}
          claims={claims}
          invoices={invoices}
          role={role}
          onAddOption={addSettingValue}
          onAddProduct={addProduct}
          onSaveCustomerAlamat={updateCustomerAlamatByName}
          isDuplicateSN={isDuplicateSN}
          onClose={() => setEditClaim(null)}
          onSave={(patch) => { handleUpdateClaim(editClaim.id, patch); setEditClaim(null); }}
          onPrint={(items) => setPrintGroup(items)}
          onSwitch={(sibling) => setEditClaim(sibling)}
        />
      )}

      {showSendModal && (
        <SendToSupplierModal
          claims={claims}
          settings={settings}
          preselectIds={supplierPreselectIds}
          onClose={() => { setShowSendModal(false); setSupplierPreselectIds(null); }}
          onSend={markSentToSupplier}
          onAddOption={addSettingValue}
        />
      )}

      {showReceiveModal && (
        <ReceiveFromSupplierModal
          claims={claims}
          batches={batches}
          preselectIds={supplierPreselectIds}
          onClose={() => { setShowReceiveModal(false); setSupplierPreselectIds(null); }}
          onReceive={(entries, tanggal) => { handleReceiveFromSupplier(entries, tanggal); setShowReceiveModal(false); setSupplierPreselectIds(null); }}
        />
      )}

      {viewBatchId && (
        <SupplierBatchDetailModal
          batch={batches.find((b) => b.id === viewBatchId)}
          claims={claims}
          role={role}
          onClose={() => setViewBatchId(null)}
          onPrintSuratJalan={(batch, items) => setSuratJalanBatch({ batch, items })}
          onViewDoc={(target) => setDocViewTarget(target)}
          onUploadDoc={(target) => setDocUploadTarget(target)}
          onEdit={(id) => { setViewBatchId(null); setEditBatchId(id); }}
          onDelete={(id) => { setViewBatchId(null); setDeleteBatchId(id); }}
          canDeleteBatch={canDeleteBatch}
          onReceiveItem={(claimId) => { setViewBatchId(null); setSupplierPreselectIds([claimId]); setShowReceiveModal(true); }}
        />
      )}

      {suratJalanBatch && (
        <PrintSuratJalanReceipt batch={suratJalanBatch.batch} items={suratJalanBatch.items} onClose={() => setSuratJalanBatch(null)} />
      )}
      {docViewTarget && (
        <ViewBatchDocModal target={docViewTarget} onClose={() => setDocViewTarget(null)} />
      )}
      {docUploadTarget && (
        <UploadBatchDocModal
          target={docUploadTarget}
          onClose={() => setDocUploadTarget(null)}
          onUpload={(batchId, docKey, dataUrl) => { uploadBatchDoc(batchId, docKey, dataUrl); setDocUploadTarget(null); }}
        />
      )}
      {editBatchId && (
        <EditBatchModal
          batch={batches.find((b) => b.id === editBatchId)}
          onClose={() => setEditBatchId(null)}
          onSave={(patch) => { updateBatch(editBatchId, patch); setEditBatchId(null); }}
        />
      )}
      {deleteBatchId && (
        <DeleteBatchModal
          batch={batches.find((b) => b.id === deleteBatchId)}
          canDelete={canDeleteBatch(batches.find((b) => b.id === deleteBatchId))}
          onClose={() => setDeleteBatchId(null)}
          onConfirm={() => { deleteBatchAndRevert(deleteBatchId); setDeleteBatchId(null); }}
        />
      )}

      {printGroup && <PrintReceipt items={printGroup.map((p) => claims.find((c) => c.id === p.id) || p)} onClose={() => setPrintGroup(null)} />}
      {uploadGroup && (
        <UploadTandaTerimaModal
          items={uploadGroup.map((p) => claims.find((c) => c.id === p.id) || p)}
          onClose={() => setUploadGroup(null)}
          onUpload={(ids, dataUrl) => { uploadTandaTerimaPhoto(ids, dataUrl); setUploadGroup(null); }}
        />
      )}
      {pickupGroup && <PickupReceipt items={pickupGroup} onClose={() => setPickupGroup(null)} />}

      {invoiceBuilderConfig && (
        <InvoiceBuilderModal
          claims={claims}
          settings={settings}
          invoices={invoices}
          role={role}
          initialPhone={invoiceBuilderConfig.phone}
          preselectIds={invoiceBuilderConfig.preselectIds}
          editingInvoice={invoiceBuilderConfig.editingInvoiceId ? invoices.find((inv) => inv.id === invoiceBuilderConfig.editingInvoiceId) : null}
          onClose={() => setInvoiceBuilderConfig(null)}
          onGenerate={(data, sparepartUsage, oldSparepartUsage) => {
            if (invoiceBuilderConfig.editingInvoiceId) {
              reconcileSparepartsForInvoiceEdit(oldSparepartUsage, sparepartUsage);
              const record = updateInvoiceRecord(invoiceBuilderConfig.editingInvoiceId, data);
              setInvoiceBuilderConfig(null);
              if (record) { setInvoiceData(record); showToast(`Invoice ${record.invoiceNo} diperbarui`); }
              return;
            }
            let finalData = data;
            let nextClaims = claims;
            if (!data.claimIds || data.claimIds.length === 0) {
              const newClaim = {
                id: uid(), groupId: uid(),
                customerName: data.customerName, customerPhone: data.customerPhone,
                tanggalTerima: data.date || todayStr(),
                brand: "-", produk: "Penjualan Sparepart/Jasa", produkSku: "",
                snDiterima: "-", garansi: "Tidak", jenis: "Servis",
                kelengkapan: "-", catatan: "Penjualan sparepart/jasa langsung, tanpa barang servis",
                snPenggantiStock: "", biayaToko: data.total, biayaJasaServis: "", partsUsed: [],
                fotoTandaTerimaCustomer: null, stokReimbursed: false,
                status: "Siap Diambil",
                supplier: "", batchId: "", tanggalKirimSupplier: "",
                tanggalKembaliSupplier: "", hasilSupplier: "", snPenggantiSupplier: "", biayaSupplier: "",
                sumberPenyelesaian: "Penjualan Sparepart", tanggalAmbilCustomer: "", metodeBayarAmbil: "",
                updatedAt: dateToISO(data.date),
              };
              nextClaims = [...claims, newClaim];
              finalData = { ...data, claimIds: [newClaim.id] };
            }
            const usage = {};
            (sparepartUsage || []).forEach((u) => { usage[u.partId] = (usage[u.partId] || 0) + u.qty; });
            const nextSpareParts = (settings.spareParts || []).map((p) => (usage[p.id] ? { ...p, qty: Math.max(0, p.qty - usage[p.id]) } : p));
            const logItems = (sparepartUsage || []).map((u) => {
              const part = (settings.spareParts || []).find((p) => p.id === u.partId);
              return { partId: u.partId, name: part ? part.name : "Sparepart", qty: u.qty };
            });
            const logEntry = logSparepartMovement("keluar", todayStr(), logItems, `Invoice ${finalData.invoiceNo} — ${finalData.customerName}`, finalData.claimIds);
            const record = { id: uid(), verified: false, ...finalData };
            persist({
              claims: nextClaims,
              settings: { ...settings, spareParts: nextSpareParts, sparepartStockLog: logEntry ? [...(settings.sparepartStockLog || []), logEntry] : settings.sparepartStockLog },
              invoices: [...invoices, record],
            });
            setInvoiceData(record);
            setInvoiceBuilderConfig(null);
          }}
        />
      )}
      {invoiceData && (
        <InvoiceReceipt
          data={invoiceData}
          claims={claims}
          onClose={() => {
            const backToClaimId = (invoiceData.claimIds || [])[0];
            setInvoiceData(null);
            if (backToClaimId) setTicketDetailId(backToClaimId);
          }}
        />
      )}

      {previewPhone && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex flex-col items-center py-6 px-4 overflow-y-auto">
          <div className="w-full max-w-sm flex items-center justify-between mb-3 text-white text-sm">
            <span>Pratinjau — tampilan yang dilihat customer</span>
            <button onClick={() => setPreviewPhone(null)} className="p-1.5 hover:bg-white/10 rounded-full"><X size={18} /></button>
          </div>
          <div className="w-full max-w-sm bg-slate-50 rounded-3xl overflow-hidden shadow-2xl">
            <CustomerTrackPage claims={claims} initialPhone={previewPhone} />
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw]">
          <div className="flex items-center gap-2 bg-slate-900 text-white text-sm px-4 py-3 rounded-full shadow-lg">
            <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
            <span>{toast}</span>
            <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white shrink-0 ml-1"><X size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterPopup({ filters, settings, onClose, onApply }) {
  const [f, setF] = useState(filters);
  return (
    <FilterSheet
      title="Filter"
      onClose={onClose}
      onReset={() => onApply(EMPTY_FILTERS)}
      onApply={() => onApply(f)}
    >
      <div className="space-y-4">
        <Field label="Brand">
          <select className={inputCls} value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })}>
            <option value="">Semua brand</option>
            {settings.brands.map((b) => <option key={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <div className="flex flex-wrap gap-2">
            {["", ...STATUS].map((s) => (
              <button key={s || "all"} onClick={() => setF({ ...f, status: s })}
                className={`px-3 py-1.5 rounded-full text-sm border ${f.status === s ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-300 text-slate-600"}`}>
                {s ? statusLabel(s) : "Semua"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Supplier">
          <select className={inputCls} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })}>
            <option value="">Semua supplier</option>
            {settings.suppliers.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Rentang tanggal terima">
          <div className="flex gap-2">
            <input type="date" className={inputCls + " min-w-0"} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            <input type="date" className={inputCls + " min-w-0"} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </div>
        </Field>
        <Field label="Belum selesai lebih dari (hari)">
          <input type="number" min="0" placeholder="mis. 30" className={inputCls} value={f.overdue} onChange={(e) => setF({ ...f, overdue: e.target.value })} />
        </Field>
      </div>
    </FilterSheet>
  );
}

// ---------- Claims tab ----------
function ColumnMenu({ hiddenColumns, onToggleColumn }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnSecondaryCls}`}>
        <Columns3 size={14} /> Kolom
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-2xl shadow-lg z-40 p-2 max-h-80 overflow-y-auto">
            <div className="text-xs text-slate-400 px-2 py-1">Tampilkan kolom tambahan:</div>
            {OPTIONAL_COLUMNS.map((col) => (
              <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50 rounded-lg cursor-pointer">
                <input type="checkbox" checked={!hiddenColumns.includes(col.key)} onChange={() => onToggleColumn(col.key)} />
                {col.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RowActions({ c, onPreview, onOpenInvoice, onViewInvoice, onOpenProgress, role, hasInvoice }) {
  const eligible = c.status === "Siap Diambil" || c.status === "Selesai";
  const invoiced = hasInvoice(c.id);
  const canEditInvoice = eligible && (role === "pusat" || !invoiced);
  return (
    <div className="flex items-center gap-2 justify-end">
      {c.status !== "Selesai" && (
        <button onClick={() => onOpenProgress(c)} className="flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 whitespace-nowrap">
          <ArrowRight size={12} /> Update
        </button>
      )}
      {invoiced && (
        <button onClick={() => onViewInvoice(c.id)} className="text-emerald-600 hover:text-emerald-700" title="Lihat / cetak invoice">
          <Eye size={15} />
        </button>
      )}
      {canEditInvoice && (
        <button onClick={() => onOpenInvoice(c)} className={invoiced ? "text-indigo-500 hover:text-indigo-700" : "text-slate-400 hover:text-indigo-600"} title={invoiced ? "Edit invoice untuk barang ini (Admin Pusat)" : "Buat invoice untuk barang ini"}>
          <ReceiptText size={15} />
        </button>
      )}
      <button onClick={() => onPreview(c.customerPhone)} className="text-slate-400 hover:text-slate-700" title="Lihat tampilan customer"><Eye size={15} /></button>
      <button onClick={() => sendTrackingLinkWA(c.customerName, c.customerPhone)} className="text-slate-400 hover:text-emerald-600" title="Kirim link cek status via WhatsApp"><MessageCircle size={15} /></button>
    </div>
  );
}

function ClaimsTab({ isDesktopLayout, ticketView, onSetTicketView, aktifCount, selesaiCount, filtered, filters, activeFilterCount, onOpenFilter, onSearch, onQuickFilterStatus, settings, summary, batches, selected, setSelected, onAdd, onOpenDetail, onOpenProgress, onPreview, onExport, onToggleColumn, onPrintSelected, onOpenInvoiceBuilder, onOpenInvoiceFromSelection, onOpenInvoiceSingle, onViewInvoice, role, hasInvoice }) {
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((c) => c.id));
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const hiddenColumns = settings.hiddenColumns || [];
  const show = (key) => !hiddenColumns.includes(key);
  const groupedTickets = useMemo(() => {
    const map = {};
    const order = [];
    filtered.forEach((c) => {
      if (!map[c.groupId]) { map[c.groupId] = []; order.push(c.groupId); }
      map[c.groupId].push(c);
    });
    return order.map((gid) => map[gid]);
  }, [filtered]);

  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }
  function sortValue(c, key) {
    switch (key) {
      case "status": return statusLabel(c.status);
      case "hariBerjalan": return c.status === "Selesai" ? -1 : daysSinceUpdate(c);
      case "tanggalTerima": return c.tanggalTerima || "";
      case "customerName": return (c.customerName || "").toLowerCase();
      case "customerPhone": return c.customerPhone || "";
      case "produkSku": return c.produkSku || "";
      case "brand": return `${c.brand} ${c.produk}`.toLowerCase();
      case "snDiterima": return c.snDiterima || "";
      case "snStok": return c.snPenggantiStock || "";
      case "garansi": return c.garansi || "";
      case "jenis": return c.jenis || "";
      case "kelengkapan": return c.kelengkapan || "";
      case "snSupplier": return c.snPenggantiSupplier || "";
      case "snRestock": return c.stokReimbursedReceivedSN || "";
      case "hasilSupplier": return c.hasilSupplier || "";
      case "sumber": return c.sumberPenyelesaian || "";
      case "supplier": return c.supplier || "";
      case "biayaToko": return Number(c.biayaToko) || 0;
      case "biayaSupplier": return Number(c.biayaSupplier) || 0;
      case "batch": return (batches.find((b) => b.id === c.batchId) || {}).kodeBatch || "";
      case "tglKirim": return c.tanggalKirimSupplier || "";
      case "tglKembaliSupplier": return c.tanggalKembaliSupplier || "";
      case "tglAmbilCustomer": return c.tanggalAmbilCustomer || "";
      case "catatan": return c.catatan || "";
      default: return "";
    }
  }
  const sortedFiltered = useMemo(() => {
    if (!sortKey) return filtered;
    const arr = [...filtered].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (typeof va === "number" && typeof vb === "number") return va - vb;
      return String(va).localeCompare(String(vb));
    });
    if (sortDir === "desc") arr.reverse();
    return arr;
  }, [filtered, sortKey, sortDir, batches]);

  function Th({ label, sortKeyName, className = "" }) {
    const active = sortKey === sortKeyName;
    return (
      <th className={`p-3 select-none ${className}`}>
        <button onClick={() => toggleSort(sortKeyName)} className={`flex items-center gap-1 hover:text-slate-600 ${active ? "text-slate-700" : ""}`}>
          {label}
          {active ? (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={11} className="text-slate-300" />}
        </button>
      </th>
    );
  }

  return (
    <div>
      {ticketView === "aktif" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {STATUS.filter((s) => s !== "Selesai").map((s) => (
            <button
              key={s}
              onClick={() => onQuickFilterStatus(filters.status === s ? "" : s)}
              className={`text-left bg-white rounded-3xl border p-4 transition ${filters.status === s ? "border-indigo-400 ring-1 ring-indigo-200" : "border-slate-200 hover:border-slate-300"}`}
            >
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <CircleDot size={14} className={STATUS_STYLE[s].text} />
                <span className="text-xs font-medium uppercase tracking-wide">{statusLabel(s)}</span>
              </div>
              <div className="text-2xl font-semibold text-slate-800">{summary[s] || 0}</div>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => onSetTicketView("aktif")}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-full text-sm font-medium border transition ${
            ticketView === "aktif" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300"
          }`}
        >
          Aktif <span className={ticketView === "aktif" ? "text-indigo-100" : "text-slate-400"}>({aktifCount})</span>
        </button>
        <button
          onClick={() => onSetTicketView("selesai")}
          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-full text-sm font-medium border transition ${
            ticketView === "selesai" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300"
          }`}
        >
          Selesai <span className={ticketView === "selesai" ? "text-emerald-100" : "text-slate-400"}>({selesaiCount})</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input value={filters.q} onChange={(e) => onSearch(e.target.value)}
            placeholder="Cari customer, SN, produk..." className={inputCls + " pl-8"} />
        </div>
        <button onClick={onOpenFilter} className={`relative flex items-center gap-1.5 px-3 py-2 text-sm ${btnSecondaryCls}`}>
          <SlidersHorizontal size={14} /> Filter
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center">{activeFilterCount}</span>
          )}
        </button>
        {isDesktopLayout && (
          <div>
            <ColumnMenu hiddenColumns={hiddenColumns} onToggleColumn={onToggleColumn} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm text-slate-500">{filtered.length} data{selected.length > 0 && ` · ${selected.length} dipilih`}</div>
        <div className="flex gap-2 flex-wrap">
          {selected.length > 0 && (
            <>
              <button onClick={onPrintSelected} className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnSecondaryCls}`}>
                <Printer size={14} /> Cetak Tanda Terima ({selected.length})
              </button>
              <button onClick={onOpenInvoiceFromSelection} className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-indigo-300 bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100">
                <ReceiptText size={14} /> Buat Invoice dari Pilihan ({selected.length})
              </button>
            </>
          )}
          <button onClick={onOpenInvoiceBuilder} className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnSecondaryCls}`}>
            <ReceiptText size={14} /> Buat Invoice
          </button>
          <button onClick={onExport} className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnSecondaryCls}`}>
            <Download size={14} /> Export CSV
          </button>
          <button onClick={onAdd} className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnPrimaryCls}`}>
            <Plus size={14} /> Barang Masuk
          </button>
        </div>
      </div>

      {!isDesktopLayout && (
      <div className="space-y-3">
        {groupedTickets.map((members) => {
          const first = members[0];
          const firstUnfinished = members.find((c) => c.status !== "Selesai");
          return (
            <div key={first.groupId} className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
              <button onClick={() => onOpenDetail(first)} className="w-full text-left p-4">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-3">
                    <Avatar name={first.customerName} />
                    <div>
                      <div className="font-medium text-slate-800">{first.customerName}</div>
                      <div className="text-xs text-slate-400 font-mono">{first.customerPhone}</div>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">Terima {fmtDate(first.tanggalTerima)}</span>
                </div>
              </button>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {members.map((c) => {
                  const overdue = daysSince(c.tanggalTerima) > 30 && c.status !== "Selesai";
                  return (
                    <div key={c.id} onClick={() => onOpenDetail(c)} className="w-full text-left px-4 py-3 flex items-center justify-between gap-2 cursor-pointer">
                      <div className="min-w-0 flex items-center gap-2">
                        <input type="checkbox" onClick={(e) => e.stopPropagation()} checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm text-slate-700 truncate">{c.brand} {c.produk}</div>
                          {claimSnList(c).map((sn) => (
                            <div key={sn.label} className="text-[11px] text-slate-400 font-mono truncate">
                              {sn.label !== "SN Diterima" && <span className="text-slate-300">{sn.label}: </span>}
                              {sn.value}
                              {sn.label === "SN Diterima" && overdue && <AlertTriangle size={11} className="inline ml-1 text-amber-500" />}
                            </div>
                          ))}
                          {Number(c.biayaToko) > 0 && (
                            <div className="text-[11px] text-slate-500 mt-0.5">Biaya: <span className="font-medium text-slate-700">{rupiah(c.biayaToko)}</span></div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <StatusBadge status={c.status} />
                        {c.status !== "Selesai" && (
                          <span className="text-[10px] text-slate-400">{daysSinceUpdate(c)} hari berjalan</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className={`grid ${firstUnfinished ? "grid-cols-2" : "grid-cols-1"} gap-2 px-4 py-3 border-t border-slate-100`}>
                {firstUnfinished && (
                  <button onClick={() => onOpenProgress(firstUnfinished)} className="flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-indigo-600 text-white text-xs font-medium active:bg-indigo-700">
                    <ArrowRight size={13} /> Update
                  </button>
                )}
                <button onClick={() => sendTrackingLinkWA(first.customerName, first.customerPhone)} className="flex items-center justify-center gap-1.5 py-2.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium active:bg-emerald-100">
                  <MessageCircle size={13} /> WA
                </button>
              </div>
            </div>
          );
        })}
        {groupedTickets.length === 0 && (
          <div className="text-center text-slate-400 py-10 bg-white rounded-3xl border border-slate-200">Belum ada data yang cocok dengan filter.</div>
        )}
      </div>
      )}

      {isDesktopLayout && (
      <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
              <th className="p-3 w-8"><input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll} /></th>
              <Th label="Status" sortKeyName="status" />
              <Th label="Hari Berjalan" sortKeyName="hariBerjalan" />
              <Th label="Tgl Terima" sortKeyName="tanggalTerima" />
              <Th label="Customer" sortKeyName="customerName" />
              {show("noHp") && <Th label="No HP" sortKeyName="customerPhone" />}
              <Th label="Brand / Produk" sortKeyName="brand" />
              {show("produkSku") && <Th label="SKU Produk" sortKeyName="produkSku" />}
              <Th label="SN Diterima" sortKeyName="snDiterima" />
              <Th label="SN Pengganti (Stok)" sortKeyName="snStok" />
              <Th label="SN Pengganti (Supplier)" sortKeyName="snSupplier" />
              <Th label="SN Restock (Klaim Balik)" sortKeyName="snRestock" />
              {show("garansi") && <Th label="Garansi" sortKeyName="garansi" />}
              {show("jenis") && <Th label="Jenis" sortKeyName="jenis" />}
              {show("kelengkapan") && <Th label="Kelengkapan" sortKeyName="kelengkapan" />}
              {show("hasilSupplier") && <Th label="Hasil dari Supplier" sortKeyName="hasilSupplier" />}
              {show("sumber") && <Th label="Sumber Penyelesaian" sortKeyName="sumber" />}
              {show("supplier") && <Th label="Supplier" sortKeyName="supplier" />}
              {show("biayaToko") && <Th label="Biaya Toko" sortKeyName="biayaToko" />}
              {show("biayaSupplier") && <Th label="Biaya Supplier" sortKeyName="biayaSupplier" />}
              {show("batch") && <Th label="Kode Batch" sortKeyName="batch" />}
              {show("tglKirim") && <Th label="Tgl Kirim" sortKeyName="tglKirim" />}
              {show("tglKembaliSupplier") && <Th label="Tgl Kembali" sortKeyName="tglKembaliSupplier" />}
              {show("tglAmbilCustomer") && <Th label="Tgl Diambil" sortKeyName="tglAmbilCustomer" />}
              {show("catatan") && <Th label="Catatan" sortKeyName="catatan" />}
              <th className="p-3 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {sortedFiltered.map((c) => {
              const overdue = daysSince(c.tanggalTerima) > 30 && c.status !== "Selesai";
              const batch = batches.find((b) => b.id === c.batchId);
              return (
                <tr key={c.id} onClick={() => onOpenDetail(c)} className="cursor-pointer hover:bg-slate-50/60 border-b border-slate-50">
                  <td className="p-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} /></td>
                  <td className="p-3"><StatusBadge status={c.status} /></td>
                  <td className="p-3 whitespace-nowrap">{c.status !== "Selesai" ? `${daysSinceUpdate(c)} hari` : "-"}</td>
                  <td className="p-3 whitespace-nowrap">
                    {fmtDate(c.tanggalTerima)}
                    {overdue && <AlertTriangle size={12} className="inline ml-1 text-amber-500" title={`${daysSince(c.tanggalTerima)} hari sejak terima`} />}
                  </td>
                  <td className="p-3 whitespace-nowrap font-medium">
                    <div className="flex items-center gap-2">
                      <Avatar name={c.customerName} size={7} />
                      {c.customerName}
                    </div>
                  </td>
                  {show("noHp") && <td className="p-3 whitespace-nowrap font-mono text-xs">{c.customerPhone}</td>}
                  <td className="p-3 whitespace-nowrap">{c.brand}<div className="text-xs text-slate-400">{c.produk}</div></td>
                  {show("produkSku") && <td className="p-3 font-mono text-xs whitespace-nowrap">{c.produkSku || "-"}</td>}
                  <td className="p-3 font-mono text-xs whitespace-nowrap">{c.snDiterima}</td>
                  <td className="p-3 font-mono text-xs whitespace-nowrap">{c.snPenggantiStock || "-"}</td>
                  <td className="p-3 font-mono text-xs whitespace-nowrap">{c.snPenggantiSupplier || "-"}</td>
                  <td className="p-3 font-mono text-xs whitespace-nowrap">{c.stokReimbursedReceivedSN || "-"}</td>
                  {show("garansi") && <td className="p-3">{c.garansi}</td>}
                  {show("jenis") && <td className="p-3 whitespace-nowrap">{c.jenis || "-"}</td>}
                  {show("kelengkapan") && <td className="p-3 whitespace-nowrap max-w-[140px] truncate" title={c.kelengkapan}>{c.kelengkapan || "-"}</td>}
                  {show("hasilSupplier") && <td className="p-3 whitespace-nowrap">{c.hasilSupplier || "-"}</td>}
                  {show("sumber") && <td className="p-3 whitespace-nowrap">{c.sumberPenyelesaian || "-"}</td>}
                  {show("supplier") && <td className="p-3 whitespace-nowrap">{c.supplier || "-"}</td>}
                  {show("biayaToko") && <td className="p-3 whitespace-nowrap">{rupiah(c.biayaToko)}</td>}
                  {show("biayaSupplier") && (
                    <td className="p-3 whitespace-nowrap">
                      {rupiah(c.biayaSupplier)}
                    </td>
                  )}
                  {show("batch") && <td className="p-3 whitespace-nowrap text-xs">{batch ? batch.kodeBatch : "-"}</td>}
                  {show("tglKirim") && <td className="p-3 whitespace-nowrap">{fmtDate(c.tanggalKirimSupplier)}</td>}
                  {show("tglKembaliSupplier") && <td className="p-3 whitespace-nowrap">{fmtDate(c.tanggalKembaliSupplier)}</td>}
                  {show("tglAmbilCustomer") && <td className="p-3 whitespace-nowrap">{fmtDate(c.tanggalAmbilCustomer)}</td>}
                  {show("catatan") && <td className="p-3 max-w-[140px] truncate" title={c.catatan}>{c.catatan || "-"}</td>}
                  <td className="p-3" onClick={(e) => e.stopPropagation()}><RowActions c={c} onPreview={onPreview} onOpenInvoice={onOpenInvoiceSingle} onViewInvoice={onViewInvoice} onOpenProgress={onOpenProgress} role={role} hasInvoice={hasInvoice} /></td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={100} className="p-8 text-center text-slate-400">Belum ada data yang cocok dengan filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

// ---------- Add claim modal (intake) ----------
function AddClaimModal({ settings, onClose, onAddOption, onAddProduct, isDuplicateSN, onSubmit }) {
  const [customer, setCustomer] = useState({ name: "", phone: "", tanggalTerima: todayStr() });
  const [rows, setRows] = useState([emptyRow()]);

  const updateRow = (rowId, patch) => setRows((rs) => rs.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  const canSubmit = customer.name.trim() && rows.every((r) => r.brand && r.produk && r.snDiterima.trim() && r.garansi && r.kelengkapan.trim());
  const products = settings.products || [];

  return (
    <Modal title="Barang Masuk" subtitle="Foto tanda terima ber-TTD diupload belakangan, setelah dicetak dan ditandatangani customer" onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Field label="Nama Customer">
          <CustomerCombo
            value={customer.name}
            customers={settings.customers || []}
            placeholder="Ketik nama customer..."
            onChange={(name, phone) => setCustomer((c) => ({ ...c, name, ...(phone !== undefined ? { phone } : {}) }))}
          />
        </Field>
        <Field label="No HP"><input type="tel" inputMode="numeric" className={inputCls} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: digitsOnly(e.target.value) })} /></Field>
        <Field label="Tanggal Terima"><input type="date" className={inputCls} value={customer.tanggalTerima} onChange={(e) => setCustomer({ ...customer, tanggalTerima: e.target.value })} /></Field>
      </div>

      <div className="space-y-4">
        {rows.map((r, i) => (
          <div key={r.rowId} className="border border-slate-200 rounded-2xl p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase">Produk {i + 1}</span>
              {rows.length > 1 && (
                <button onClick={() => setRows(rows.filter((x) => x.rowId !== r.rowId))} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Brand">
                <ComboInput value={r.brand} options={settings.brands} placeholder="Pilih brand"
                  onChange={(v) => updateRow(r.rowId, { brand: v })} onAddOption={(v) => onAddOption("brands", v)} />
              </Field>
              <Field label="Produk / Model">
                <ProductCombo value={r.produk} skuValue={r.produkSku} products={products} placeholder="Cari nama atau SKU..."
                  onChange={(name, sku) => updateRow(r.rowId, { produk: name, produkSku: sku })} onAddProduct={onAddProduct} />
              </Field>
              <Field label="SN Diterima">
                <input className={inputCls} value={r.snDiterima} onChange={(e) => updateRow(r.rowId, { snDiterima: e.target.value })} />
                {isDuplicateSN(r.snDiterima) && <p className="text-xs text-amber-600 mt-1">SN ini sudah ada di data lain</p>}
              </Field>
              <Field label="Garansi">
                <select className={inputCls} value={r.garansi} onChange={(e) => updateRow(r.rowId, { garansi: e.target.value })}>
                  <option>Ya</option><option>Tidak</option>
                </select>
              </Field>
              <Field label="Kelengkapan Barang" className="col-span-1 sm:col-span-2">
                <input className={inputCls} placeholder="dus, kabel, adaptor... (isi '-' jika tidak ada)" value={r.kelengkapan} onChange={(e) => updateRow(r.rowId, { kelengkapan: e.target.value })} />
              </Field>
              <Field label="Keluhan / Kerusakan" className="col-span-1 sm:col-span-2 lg:col-span-4">
                <input className={inputCls} placeholder="mis. gambar bergaris, mati total, tidak connect ke app..." value={r.catatan} onChange={(e) => updateRow(r.rowId, { catatan: e.target.value })} />
              </Field>
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setRows([...rows, emptyRow()])} className="mt-3 flex items-center gap-1.5 text-sm text-indigo-600 font-medium">
        <Plus size={14} /> Tambah produk lain untuk customer ini
      </button>

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
        <button onClick={onClose} className={`px-4 py-2 text-sm ${btnSecondaryCls} border-none hover:bg-slate-50`}>Batal</button>
        <button disabled={!canSubmit} onClick={() => onSubmit(customer, rows)}
          className={`px-4 py-2 text-sm ${btnPrimaryCls}`}>
          Simpan {rows.length > 1 ? `(${rows.length} produk)` : ""}
        </button>
      </div>
    </Modal>
  );
}

function TicketMenu({ onPrint, onUpload, printLabel = "Cetak Tanda Terima", uploadLabel = "Upload Foto Tanda Terima" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-700 p-1 -m-1" title="Menu lainnya">
        <MoreVertical size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-2xl shadow-lg z-50 py-1">
            <button onClick={() => { setOpen(false); onPrint(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
              <Printer size={14} /> {printLabel}
            </button>
            <button onClick={() => { setOpen(false); onUpload(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
              <Camera size={14} /> {uploadLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TicketDetailModal({ claim, claims, settings, role, hasInvoice, claimNeedsInvoice, canDeleteFn, onClose, onPrint, onUpload, onEdit, onDelete, onGoToProgress, onOpenInvoiceSingle, onOpenInvoiceMulti, onViewInvoice }) {
  const siblings = claims.filter((c) => c.groupId === claim.groupId);
  const first = siblings[0] || claim;

  const menu = (
    <TicketMenu
      onPrint={() => onPrint(siblings.length ? siblings : [claim])}
      onUpload={() => onUpload(siblings.length ? siblings : [claim])}
    />
  );

  const invoiceableIds = siblings.filter((c) => (c.status === "Siap Diambil" || c.status === "Selesai") && claimNeedsInvoice(c)).map((c) => c.id);

  return (
    <Modal title={first.customerName} subtitle={`${first.customerPhone} · Terima ${fmtDate(first.tanggalTerima)}`} onClose={onClose} headerExtra={menu} wide>
      <div className="flex items-center gap-3 mb-4 -mt-1">
        <Avatar name={first.customerName} size={11} />
        <div className="text-xs text-slate-400">{siblings.length} produk diserahkan bersama</div>
      </div>

      {invoiceableIds.length > 0 && (
        <button
          onClick={() => onOpenInvoiceMulti(invoiceableIds, first.customerPhone)}
          className={`w-full flex items-center justify-center gap-2 mb-4 px-4 py-2.5 text-sm ${btnPrimaryCls}`}
        >
          <ReceiptText size={14} /> Buat Invoice ({invoiceableIds.length} barang siap & ada biaya)
        </button>
      )}

      {first.fotoTandaTerimaCustomer ? (
        <div className="mb-4">
          <label className="flex items-center gap-1 text-xs font-medium text-slate-400 mb-1"><Camera size={11} /> Foto Tanda Terima</label>
          <img src={first.fotoTandaTerimaCustomer} className="h-20 rounded-lg border border-slate-200" />
        </div>
      ) : (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800">
          Foto tanda terima ber-TTD belum diupload. Cetak dulu, minta TTD customer, lalu upload lewat menu "⋮" di atas.
        </div>
      )}

      <div className="space-y-3">
        {siblings.map((c) => {
          const invoiced = hasInvoice(c.id);
          const eligible = c.status === "Siap Diambil" || c.status === "Selesai";
          const canInvoice = eligible && (role === "pusat" || !invoiced);
          const hasCostDetail = (c.partsUsed || []).length > 0 || c.biayaJasaServis || c.biayaSupplier || c.biayaToko;
          const hasSnTrail = c.snPenggantiStock || c.snPenggantiSupplier || c.stokReimbursedReceivedSN;
          return (
            <div key={c.id} className="border border-slate-200 rounded-2xl p-3">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div>
                  <div className="font-medium text-slate-800 text-sm">{c.brand} {c.produk}</div>
                  <div className="text-xs text-slate-400 font-mono">SN {c.snDiterima}{c.produkSku ? ` · SKU ${c.produkSku}` : ""}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={c.status} />
                  {c.status !== "Selesai" && (
                    <span className="text-[10px] text-slate-400">{daysSinceUpdate(c)} hari berjalan</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${c.garansi === "Ya" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  Garansi {c.garansi}
                </span>
                {c.jenis && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">{c.jenis}</span>}
                {c.kelengkapan && <span className="text-[11px] text-slate-400">Kelengkapan: {c.kelengkapan}</span>}
                {invoiced && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">Sudah Diinvoice</span>}
                {!invoiced && eligible && claimNeedsInvoice(c) && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Perlu Invoice</span>}
              </div>
              {c.catatan && (
                <div className="mb-2 p-2 rounded-lg bg-slate-50 text-xs text-slate-700">🔧 {c.catatan}</div>
              )}

              {hasSnTrail && (
                <div className="mb-2 p-2 rounded-lg bg-indigo-50/60 text-xs text-slate-700 space-y-0.5">
                  {c.snPenggantiStock && <div>SN diberikan ke customer: <span className="font-mono font-medium">{c.snPenggantiStock}</span></div>}
                  {c.snPenggantiSupplier && <div>SN pengganti dari supplier (servis): <span className="font-mono font-medium">{c.snPenggantiSupplier}</span></div>}
                  {c.stokReimbursedReceivedSN && <div>SN restock dari supplier (klaim balik): <span className="font-mono font-medium">{c.stokReimbursedReceivedSN}</span></div>}
                  {c.jenis === "Ganti Baru" && c.sumberPenyelesaian === "Stok Toko" && !c.stokReimbursed && (
                    <div className="text-amber-700">Unit lama belum dikirim ke supplier untuk klaim balik.</div>
                  )}
                </div>
              )}

              {hasCostDetail && (
                <div className="mb-2 p-2 rounded-lg bg-slate-50 text-xs text-slate-700 space-y-0.5">
                  {(c.partsUsed || []).map((pu, i) => {
                    const part = (settings.spareParts || []).find((p) => p.id === pu.partId);
                    return (
                      <div key={i} className="flex items-center justify-between">
                        <span>{part ? part.name : "Sparepart"} x{pu.qty}</span>
                        <span>{pu.price ? rupiah(pu.qty * pu.price) : "-"}</span>
                      </div>
                    );
                  })}
                  {c.biayaJasaServis && (
                    <div className="flex items-center justify-between"><span>Jasa Servis</span><span>{rupiah(c.biayaJasaServis)}</span></div>
                  )}
                  <div className="flex items-center justify-between font-medium pt-0.5 border-t border-slate-200">
                    <span>Biaya ke Customer</span><span>{rupiah(c.biayaToko)}</span>
                  </div>
                </div>
              )}
              {c.biayaSupplier && (
                <div className="mb-2 p-2 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800 flex items-center justify-between">
                  <span>Biaya dari Supplier (internal, bukan ditagih ke customer)</span><span className="font-medium">{rupiah(c.biayaSupplier)}</span>
                </div>
              )}

              <div className="flex gap-2">
                {c.status !== "Selesai" ? (
                  <button onClick={() => onGoToProgress(c)} className="flex-1 py-2 rounded-full bg-indigo-600 text-white text-xs font-medium">Update</button>
                ) : (
                  <span className="flex-1 flex items-center justify-center gap-1 py-2 text-xs text-emerald-600 font-medium">
                    <CheckCircle2 size={13} /> Sudah diambil customer
                  </span>
                )}
                {invoiced && (
                  <button onClick={() => onViewInvoice(c.id)} className="px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 text-xs font-medium hover:bg-emerald-100">Lihat Invoice</button>
                )}
                {canInvoice && role === "pusat" && (
                  <button onClick={() => onOpenInvoiceSingle(c)} className={`px-3 py-2 text-xs ${btnSecondaryCls}`}>{invoiced ? "Edit Invoice" : "Invoice"}</button>
                )}
                {canInvoice && role !== "pusat" && !invoiced && (
                  <button onClick={() => onOpenInvoiceSingle(c)} className={`px-3 py-2 text-xs ${btnSecondaryCls}`}>Invoice</button>
                )}
                <button onClick={() => onEdit(c)} className={`px-3 py-2 text-xs ${btnSecondaryCls}`} title="Edit data"><Pencil size={13} /></button>
                {canDeleteFn(c) && (
                  <button onClick={() => onDelete(c)} className="px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs hover:bg-red-50" title="Hapus"><X size={13} /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function DeleteConfirmModal({ claim, onClose, onConfirm }) {
  return (
    <Modal title="Hapus Tiket Ini?" onClose={onClose}>
      <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-800 mb-4">
        <div className="font-medium mb-1">{claim.customerName} — {claim.brand} {claim.produk}</div>
        <div className="text-xs">SN: {claim.snDiterima}</div>
      </div>
      <p className="text-sm text-slate-600 mb-4">Tindakan ini permanen dan tidak bisa dibatalkan. Hanya untuk kasus salah input dobel yang belum diproses sama sekali.</p>
      <div className="flex gap-2">
        <button onClick={onClose} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
        <button onClick={onConfirm} className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-red-600 text-white">Ya, Hapus</button>
      </div>
    </Modal>
  );
}

function TicketOptionsMenu({ onInvoice, onEdit, onDelete, canDelete, deleteLabel, canInvoice, invoiceLabel }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-700 p-1 -m-1" title="Menu lainnya">
        <MoreVertical size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-60 bg-white border border-slate-200 rounded-2xl shadow-lg z-50 py-1">
            {canInvoice && (
              <button onClick={() => { setOpen(false); onInvoice(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                <ReceiptText size={14} /> {invoiceLabel || "Buat Invoice"}
              </button>
            )}
            <button onClick={() => { setOpen(false); onEdit(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
              <Pencil size={14} /> Edit Data Lengkap
            </button>
            <button
              onClick={() => { if (canDelete) { setOpen(false); onDelete(); } }}
              title={!canDelete ? "Tidak bisa dihapus — sudah ada perubahan/update pada barang ini" : undefined}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${canDelete ? "text-red-600 hover:bg-red-50" : "text-slate-300 cursor-not-allowed"}`}
            >
              <X size={14} /> {deleteLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function BulkPickupBar({ items, onConfirm }) {
  const [tanggal, setTanggal] = useState(todayStr());
  const [metode, setMetode] = useState("Cash");
  const [confirming, setConfirming] = useState(false);
  const blocked = items.filter((c) => c.needsInvoice);
  const eligible = items.filter((c) => !c.needsInvoice);
  const anyChargeable = eligible.some((c) => Number(c.biayaToko) > 0 && !c.metodeSet);
  if (eligible.length < 2) return null;

  return (
    <div className="mt-4 p-3 rounded-2xl bg-sky-50 border border-sky-200 space-y-2">
      <p className="text-sm text-sky-900 font-medium">{eligible.length} barang dicentang — bisa ditandai diambil bersamaan.</p>
      {blocked.length > 0 && (
        <p className="text-xs text-amber-700">{blocked.length} barang lain yang dicentang belum bisa ikut (invoice belum dibuat, ada biaya).</p>
      )}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Tanggal Diambil</label>
        <input type="date" className={inputCls} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
      </div>
      {anyChargeable && (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Metode Bayar</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMetode("Cash")} className={`flex-1 px-3 py-2 rounded-full text-sm font-medium border ${metode === "Cash" ? "bg-emerald-600 text-white border-emerald-600" : "border-slate-300 text-slate-600"}`}>Cash</button>
            <button type="button" onClick={() => setMetode("Transfer")} className={`flex-1 px-3 py-2 rounded-full text-sm font-medium border ${metode === "Transfer" ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-300 text-slate-600"}`}>Transfer</button>
          </div>
        </div>
      )}
      {!confirming ? (
        <button onClick={() => setConfirming(true)} className={`w-full flex items-center justify-center gap-2 px-3 py-3 text-sm rounded-full bg-sky-600 text-white font-medium`}>
          <CheckCircle2 size={15} /> Tandai {eligible.length} Diambil oleh Customer
        </button>
      ) : (
        <div className="p-3 rounded-xl bg-white border border-sky-300 space-y-2">
          <p className="text-sm text-sky-900">{eligible.length} barang akan ditandai sudah diambil customer pada {fmtDate(tanggal)}. Yakin?</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirming(false)} className={`flex-1 px-3 py-2 text-sm ${btnSecondaryCls}`}>Batal</button>
            <button onClick={() => onConfirm(eligible.map((c) => c.id), tanggal, anyChargeable ? metode : "")} className="flex-1 px-3 py-2 rounded-full bg-sky-600 text-white text-sm font-medium">Ya, Tandai Semua</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressItemPanel({ claim, settings, batches, hasInvoice, claimNeedsInvoice, onSetJenis, onMarkReadyFromStock, onMarkServicedOnSite, onMarkPickedUp, onGoToSendSupplier, onGoToReceiveSupplier, onOpenInvoice, onPrintPickup, onAddSparepart }) {
  const pending = claim.status === "Menunggu Konfirmasi";
  const [jenisDraft, setJenisDraft] = useState(claim.garansi !== "Ya" ? "Servis" : "");
  const [path, setPath] = useState(null);
  const [snStockDraft, setSnStockDraft] = useState("");
  const [biayaGantiDraft, setBiayaGantiDraft] = useState("");
  const [biayaJasaDraft, setBiayaJasaDraft] = useState("");
  const [servisParts, setServisParts] = useState([]);
  const [tanggalAksi, setTanggalAksi] = useState(todayStr());
  const [confirmGanti, setConfirmGanti] = useState(false);
  const [confirmServis, setConfirmServis] = useState(false);
  const [confirmPickup, setConfirmPickup] = useState(false);
  const [metodeBayarDraft, setMetodeBayarDraft] = useState("Cash");
  const [quickAddPartOpen, setQuickAddPartOpen] = useState(false);
  const [quickAddPartName, setQuickAddPartName] = useState("");
  const [quickAddPartUnit, setQuickAddPartUnit] = useState("pcs");
  function submitQuickAddPart() {
    if (!quickAddPartName.trim()) return;
    onAddSparepart({ name: quickAddPartName.trim(), unit: quickAddPartUnit.trim() || "pcs", qty: 0 });
    setQuickAddPartName("");
    setQuickAddPartUnit("pcs");
    setQuickAddPartOpen(false);
  }
  const batch = batches.find((b) => b.id === claim.batchId);
  const effectiveJenis = pending ? jenisDraft : claim.jenis;
  const sparepartTotal = servisParts.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.price) || 0), 0);
  const servisTotal = sparepartTotal + (Number(biayaJasaDraft) || 0);

  function addServisPart() {
    setServisParts((l) => [...l, { id: uid(), partId: "", qty: "1", price: "" }]);
  }
  function updateServisPart(id, patch) {
    setServisParts((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function removeServisPart(id) {
    setServisParts((l) => l.filter((x) => x.id !== id));
  }

  function confirmGantiBaru() {
    onMarkReadyFromStock({ sn: snStockDraft.trim(), biaya: biayaGantiDraft, jenisOverride: pending ? "Ganti Baru" : undefined, tanggal: tanggalAksi });
  }
  function confirmServisToko() {
    onMarkServicedOnSite({
      biaya: servisTotal ? String(servisTotal) : "",
      biayaJasaServis: biayaJasaDraft,
      partsUsed: servisParts.filter((r) => r.partId && Number(r.qty) > 0).map((r) => ({ partId: r.partId, qty: Number(r.qty), price: Number(r.price) || 0 })),
      jenisOverride: pending ? "Servis" : undefined,
      tanggal: tanggalAksi,
    });
  }
  function confirmKirimSupplier() {
    onGoToSendSupplier();
  }

  const needsInvoiceNow = (claim.status === "Siap Diambil") && claimNeedsInvoice(claim);
  const invoiced = hasInvoice(claim.id);
  const invoiceForClaimUnsetMetode = claim.status === "Siap Diambil" && invoiced;
  const hasCharge = Number(claim.biayaToko) > 0;

  return (
    <div>
      {pending && claim.garansi === "Ya" && (
        <div className="space-y-3 mb-3">
          <p className="text-sm text-slate-600">Tentukan jenis penanganan untuk barang ini:</p>
          <select className={inputCls} value={jenisDraft} onChange={(e) => { setJenisDraft(e.target.value); setPath(null); }}>
            <option value="">— Pilih jenis —</option>
            <option value="Ganti Baru">Ganti Baru</option>
            <option value="Servis">Servis</option>
          </select>
        </div>
      )}
      {pending && claim.garansi !== "Ya" && (
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">Jenis: Servis</span>
          <span className="text-xs text-slate-400">otomatis — barang tanpa garansi tidak bisa ganti unit baru gratis</span>
        </div>
      )}

      {(claim.status === "Baru" || pending) && effectiveJenis === "Ganti Baru" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Barang ini <strong>Ganti Baru</strong>. Berikan unit pengganti ke customer:</p>
          <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100 space-y-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tanggal</label>
              <input type="date" className={inputCls} value={tanggalAksi} onChange={(e) => setTanggalAksi(e.target.value)} />
            </div>
            <input placeholder="SN unit pengganti" value={snStockDraft} onChange={(e) => setSnStockDraft(e.target.value)} className={inputCls} />
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Biaya Penggantian (opsional — kosongkan kalau gratis)</label>
              <input type="number" placeholder="0" className={inputCls} value={biayaGantiDraft} onChange={(e) => setBiayaGantiDraft(e.target.value)} />
            </div>
            {!confirmGanti ? (
              <button
                disabled={!snStockDraft.trim()}
                onClick={() => setConfirmGanti(true)}
                className={`w-full px-3 py-2 text-sm rounded-full ${btnPrimaryCls}`}
              >
                Tandai Selesai {Number(biayaGantiDraft) > 0 ? "" : "(Gratis)"}
              </button>
            ) : (
              <div className="p-2.5 rounded-xl bg-white border border-indigo-200 space-y-2">
                <p className="text-xs text-slate-600">Yakin? Barang ditandai Siap Diambil{Number(biayaGantiDraft) > 0 ? ", invoice bisa dibuat sebelum diambil" : " tanpa biaya"}.</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmGanti(false)} className={`flex-1 px-3 py-1.5 text-xs ${btnSecondaryCls}`}>Batal</button>
                  <button onClick={confirmGantiBaru} className="flex-1 px-3 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-medium">Ya, Tandai</button>
                </div>
              </div>
            )}
            <p className="text-[11px] text-indigo-700">Setelah ini, unit lama akan tercatat "tertahan" di Inventaris — opsi kirim ke supplier untuk klaim balik muncul di sana.</p>
          </div>
        </div>
      )}

      {(claim.status === "Baru" || pending) && effectiveJenis === "Servis" && path === null && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Barang ini <strong>Servis</strong>. Pilih jalur penanganannya:</p>
          <div className="grid grid-cols-1 gap-2">
            <button onClick={() => setPath("toko")} className="py-3 rounded-2xl border border-slate-300 text-sm font-medium text-left px-4 hover:border-indigo-400 hover:bg-indigo-50">
              Servis di Toko <span className="block text-xs text-slate-400 font-normal">Bisa dikerjakan sendiri, selesai sekarang</span>
            </button>
            <button onClick={confirmKirimSupplier} className="py-3 rounded-2xl border border-slate-300 text-sm font-medium text-left px-4 hover:border-blue-400 hover:bg-blue-50">
              Kirim ke Supplier <span className="block text-xs text-slate-400 font-normal">Butuh service center resmi — dibuka lewat tab Proses ke Supplier</span>
            </button>
          </div>
        </div>
      )}

      {(claim.status === "Baru" || pending) && effectiveJenis === "Servis" && path === "toko" && (
        <div className="space-y-3">
          <button onClick={() => setPath(null)} className="text-xs text-slate-400 hover:text-slate-600">← Ganti pilihan</button>
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tanggal Selesai</label>
              <input type="date" className={inputCls} value={tanggalAksi} onChange={(e) => setTanggalAksi(e.target.value)} />
            </div>
            <div className="text-xs font-semibold text-slate-700">Sparepart Digunakan (opsional)</div>
            {servisParts.map((row) => (
              <div key={row.id} className="grid grid-cols-6 gap-2">
                <select className={inputCls + " col-span-3"} value={row.partId} onChange={(e) => updateServisPart(row.id, { partId: e.target.value })}>
                  <option value="">Pilih sparepart...</option>
                  {sortByName(settings.spareParts).map((p) => <option key={p.id} value={p.id}>{p.name} (stok: {p.qty} {p.unit})</option>)}
                </select>
                <input type="number" min="1" placeholder="Qty" className={inputCls + " col-span-1"} value={row.qty} onChange={(e) => updateServisPart(row.id, { qty: e.target.value })} />
                <input type="number" placeholder="Harga/pcs" className={inputCls + " col-span-1"} value={row.price} onChange={(e) => updateServisPart(row.id, { price: e.target.value })} />
                <button onClick={() => removeServisPart(row.id)} className="col-span-1 text-slate-400 hover:text-red-500 justify-self-center"><X size={14} /></button>
              </div>
            ))}
            <button onClick={addServisPart} className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium"><Plus size={12} /> Tambah sparepart</button>
            {!quickAddPartOpen ? (
              <button onClick={() => setQuickAddPartOpen(true)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 font-medium">
                <Upload size={12} /> Jenis sparepart belum ada di daftar? Tambah baru
              </button>
            ) : (
              <div className="grid grid-cols-6 gap-2 items-center p-2 rounded-xl bg-indigo-50/60 border border-indigo-100">
                <input placeholder="Nama sparepart" className={inputCls + " col-span-3"} value={quickAddPartName} onChange={(e) => setQuickAddPartName(e.target.value)} />
                <input placeholder="Satuan (pcs)" className={inputCls + " col-span-2"} value={quickAddPartUnit} onChange={(e) => setQuickAddPartUnit(e.target.value)} />
                <button onClick={submitQuickAddPart} disabled={!quickAddPartName.trim()} className="col-span-1 text-indigo-600 disabled:text-slate-300 font-medium text-xs">OK</button>
              </div>
            )}
            <div className="text-xs font-semibold text-slate-700 pt-1">Biaya Jasa Servis</div>
            <input type="number" placeholder="Biaya jasa (kosongkan jika gratis)" value={biayaJasaDraft} onChange={(e) => setBiayaJasaDraft(e.target.value)} className={inputCls} />
            {(sparepartTotal > 0 || biayaJasaDraft) && (
              <div className="flex items-center justify-between text-xs text-slate-600 pt-1 border-t border-slate-200">
                <span>Sparepart {rupiah(sparepartTotal)} + Jasa {rupiah(Number(biayaJasaDraft) || 0)}</span>
                <span className="font-semibold text-slate-800">Total {rupiah(servisTotal)}</span>
              </div>
            )}
            {!confirmServis ? (
              <button onClick={() => setConfirmServis(true)} className={`w-full px-3 py-2 text-sm rounded-full ${btnPrimaryCls}`}>
                Tandai Selesai {servisTotal ? "" : "(Gratis)"}
              </button>
            ) : (
              <div className="p-2.5 rounded-xl bg-white border border-slate-300 space-y-2">
                <p className="text-xs text-slate-600">Yakin? Barang ditandai Siap Diambil{servisTotal ? `, total ${rupiah(servisTotal)} — invoice bisa dibuat sekarang atau nanti sebelum diambil` : " tanpa biaya"}.</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmServis(false)} className={`flex-1 px-3 py-1.5 text-xs ${btnSecondaryCls}`}>Batal</button>
                  <button onClick={confirmServisToko} className="flex-1 px-3 py-1.5 rounded-full bg-slate-800 text-white text-xs font-medium">Ya, Tandai Selesai</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {claim.status === "Baru" && !claim.jenis && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-800">
          Jenis penanganan belum tercatat. Buka "Edit Data Lengkap" untuk mengisinya.
        </div>
      )}

      {claim.status === "Di Supplier" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <LockedField label="Supplier" value={claim.supplier} />
            <LockedField label="Tgl Kirim" value={fmtDate(claim.tanggalKirimSupplier)} />
            <LockedField label="Kode Batch" value={batch ? batch.kodeBatch : "-"} />
          </div>
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-100 space-y-2">
            <p className="text-sm text-amber-900">Barang ini sedang di supplier. Tandai sudah kembali lewat "Terima dari Supplier" di tab Proses ke Supplier — satu prosedur yang sama juga dipakai untuk penerimaan banyak barang sekaligus.</p>
            <button onClick={onGoToReceiveSupplier} className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm rounded-full bg-amber-600 text-white font-medium`}>
              <PackageCheck size={14} /> Buka Terima dari Supplier
            </button>
          </div>
        </div>
      )}

      {claim.status === "Siap Diambil" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <LockedField label="Sumber Penyelesaian" value={claim.sumberPenyelesaian} />
            <LockedField label="SN / Hasil" value={claim.snPenggantiStock || claim.snPenggantiSupplier || claim.hasilSupplier || "-"} />
          </div>
          {hasCharge && (
            <LockedField label="Biaya ke Customer" value={rupiah(claim.biayaToko)} />
          )}

          {needsInvoiceNow ? (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
              <p className="text-sm text-amber-900 font-medium">⚠️ Invoice belum dibuat. Barang ini ada biaya {rupiah(claim.biayaToko)}, wajib dibuat invoice dulu sebelum bisa ditandai diambil.</p>
              <button onClick={() => onOpenInvoice([claim.id])} className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm rounded-full ${btnPrimaryCls}`}>
                <ReceiptText size={14} /> Buat Invoice
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Tanggal Diambil</label>
                <input type="date" className={inputCls} value={tanggalAksi} onChange={(e) => setTanggalAksi(e.target.value)} />
              </div>
              {hasCharge && !invoiced && (
                <p className="text-xs text-slate-400">Barang ini gratis (biaya 0) jadi boleh langsung diambil tanpa invoice.</p>
              )}
              {invoiced && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Metode Bayar</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setMetodeBayarDraft("Cash")} className={`flex-1 px-3 py-2 rounded-full text-sm font-medium border ${metodeBayarDraft === "Cash" ? "bg-emerald-600 text-white border-emerald-600" : "border-slate-300 text-slate-600"}`}>Cash</button>
                    <button type="button" onClick={() => setMetodeBayarDraft("Transfer")} className={`flex-1 px-3 py-2 rounded-full text-sm font-medium border ${metodeBayarDraft === "Transfer" ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-300 text-slate-600"}`}>Transfer</button>
                  </div>
                </div>
              )}
              {!confirmPickup ? (
                <button onClick={() => setConfirmPickup(true)} className={`w-full flex items-center justify-center gap-2 px-3 py-3 text-sm rounded-full bg-sky-600 text-white font-medium`}>
                  <CheckCircle2 size={15} /> Tandai Diambil oleh Customer
                </button>
              ) : (
                <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 space-y-2">
                  <p className="text-sm text-sky-900">Barang akan ditandai sudah diambil customer pada {fmtDate(tanggalAksi)} dan status jadi Selesai. Yakin?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmPickup(false)} className={`flex-1 px-3 py-2 text-sm ${btnSecondaryCls}`}>Batal</button>
                    <button onClick={() => onMarkPickedUp(tanggalAksi, invoiced ? metodeBayarDraft : "")} className="flex-1 px-3 py-2 rounded-full bg-sky-600 text-white text-sm font-medium">Ya, Tandai Diambil</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {claim.status === "Selesai" && (
        <div className="space-y-4">
          <LockedField label="Tanggal Diambil Customer" value={fmtDate(claim.tanggalAmbilCustomer)} />
          {claim.metodeBayarAmbil && <LockedField label="Metode Bayar" value={claim.metodeBayarAmbil} />}
          <button onClick={onPrintPickup} className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm ${btnSecondaryCls}`}>
            <Printer size={14} /> Cetak Tanda Terima
          </button>
        </div>
      )}
    </div>
  );
}

function ProgressModal({ claim, claims, settings, batches, role, hasInvoice, claimNeedsInvoice, canDeleteFn, onClose, onSetJenis, onMarkReadyFromStock, onMarkServicedOnSite, onMarkPickedUp, onMarkPickedUpBulk, onGoToSendSupplier, onGoToReceiveSupplier, onOpenFullEdit, onOpenInvoiceBuilder, onDeleteClaim, onPreview, onPrintPickup, onAddSparepart }) {
  const siblings = claims.filter((c) => c.groupId === claim.groupId);
  const first = siblings[0] || claim;
  const [checked, setChecked] = useState({ [claim.id]: true });
  const [expandedId, setExpandedId] = useState(claim.id);

  function toggleCheck(id) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const checkedIds = Object.keys(checked).filter((id) => checked[id]);
  const checkedClaims = siblings.filter((c) => checkedIds.includes(c.id) && c.status === "Siap Diambil");
  const bulkItems = checkedClaims.map((c) => ({ id: c.id, biayaToko: c.biayaToko, needsInvoice: claimNeedsInvoice(c), metodeSet: !!(hasInvoice(c.id) && (invoicesMetodeIsSet(c))) }));
  function invoicesMetodeIsSet() { return false; }
  const activeClaim = siblings.find((c) => c.id === expandedId) || first;
  const canDeleteActive = canDeleteFn(activeClaim);
  const activeInvoiced = hasInvoice(activeClaim.id);
  const canInvoiceActive = role === "pusat" || !activeInvoiced;

  const headerExtra = (
    <TicketOptionsMenu
      onInvoice={() => onOpenInvoiceBuilder(checkedIds.length > 0 ? checkedIds : [activeClaim.id])}
      onEdit={() => onOpenFullEdit(activeClaim)}
      onDelete={() => onDeleteClaim(activeClaim)}
      canDelete={canDeleteActive}
      deleteLabel={`Hapus ${activeClaim.brand} ${activeClaim.produk}`}
      canInvoice={canInvoiceActive}
      invoiceLabel={activeInvoiced ? "Edit Invoice" : "Buat Invoice"}
    />
  );

  return (
    <Modal title={first.customerName} subtitle={`${first.customerPhone} · Terima ${fmtDate(first.tanggalTerima)}`} onClose={onClose} headerExtra={headerExtra} wide>
      <div className="space-y-3">
        {siblings.map((c) => {
          const isExpanded = expandedId === c.id;
          return (
            <div key={c.id} className={`border rounded-2xl overflow-hidden ${isExpanded ? "border-indigo-300" : "border-slate-200"}`}>
              <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                <input
                  type="checkbox"
                  onClick={(e) => e.stopPropagation()}
                  checked={!!checked[c.id]}
                  onChange={() => toggleCheck(c.id)}
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{c.brand} {c.produk}</div>
                  <div className="text-xs text-slate-400 font-mono truncate">SN {c.snDiterima}{c.produkSku ? ` · SKU ${c.produkSku}` : ""}</div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusBadge status={c.status} />
                  {c.status !== "Selesai" && <span className="text-[10px] text-slate-400">{daysSinceUpdate(c)} hari</span>}
                </div>
                {isExpanded ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
              </div>
              {isExpanded && (
                <div className="px-3 pb-3 pt-3 border-t border-slate-100">
                  {c.catatan && <p className="text-xs text-slate-500 mb-3">🔧 {c.catatan}</p>}
                  <ProgressItemPanel
                    claim={c}
                    settings={settings}
                    batches={batches}
                    hasInvoice={hasInvoice}
                    claimNeedsInvoice={claimNeedsInvoice}
                    onSetJenis={(jenis) => onSetJenis(c.id, jenis)}
                    onMarkReadyFromStock={(payload) => onMarkReadyFromStock(c.id, payload)}
                    onMarkServicedOnSite={(payload) => onMarkServicedOnSite(c.id, payload)}
                    onMarkPickedUp={(tanggal, metode) => onMarkPickedUp(c.id, tanggal, metode)}
                    onGoToSendSupplier={() => onGoToSendSupplier(c.id)}
                    onGoToReceiveSupplier={() => onGoToReceiveSupplier(c.id)}
                    onOpenInvoice={(ids) => onOpenInvoiceBuilder(ids)}
                    onPrintPickup={() => onPrintPickup(c)}
                    onAddSparepart={onAddSparepart}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <BulkPickupBar items={bulkItems} onConfirm={(ids, tanggal, metode) => onMarkPickedUpBulk(ids, tanggal, metode)} />

      <div className="flex gap-2 mt-5 pt-4 border-t border-slate-100">
        <button onClick={() => onPreview(first.customerPhone)} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs ${btnSecondaryCls}`}>
          <Eye size={13} /> Tampilan Customer
        </button>
        <button onClick={() => sendTrackingLinkWA(first.customerName, first.customerPhone)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100">
          <MessageCircle size={13} /> Kirim Link (WA)
        </button>
      </div>
    </Modal>
  );
}

// ---------- Edit claim modal: data correction only ----------
function EditClaimModal({ claim, settings, batches, claims, invoices, role, onClose, onSave, onAddOption, onAddProduct, onSaveCustomerAlamat, isDuplicateSN, onPrint, onSwitch }) {
  const [f, setF] = useState({ ...claim, partsUsed: claim.partsUsed || [] });
  const customerRecord = (settings.customers || []).find((c) => c.name.trim().toLowerCase() === (claim.customerName || "").trim().toLowerCase());
  const [alamat, setAlamat] = useState(customerRecord?.alamat || "");
  const batch = batches.find((b) => b.id === claim.batchId);
  const siblings = claims.filter((c) => c.groupId === claim.groupId);
  const hasSiblings = siblings.length > 1;
  const dirty = JSON.stringify(f) !== JSON.stringify(claim);
  const canManage = role === "pusat";
  const hasInvoice = (invoices || []).some((inv) => (inv.claimIds || []).includes(claim.id));
  const canEditParts = canManage || !hasInvoice;
  const fotoRef = useRef();

  async function handleFotoTandaTerima(e) {
    const file = e.target.files[0];
    if (!file) return;
    const dataUrl = await compressImage(file);
    setF((prev) => ({ ...prev, fotoTandaTerimaCustomer: dataUrl }));
  }

  return (
    <Modal title={`Edit Data — ${claim.customerName}`} subtitle={`${claim.brand} ${claim.produk} · SN ${claim.snDiterima}`} onClose={onClose} wide>
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <StatusBadge status={claim.status} />
        {hasInvoice && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">Sudah Diinvoice</span>}
      </div>

      {hasSiblings && (
        <div className="mb-4">
          <div className="text-xs text-slate-400 mb-1.5">Diserahkan bersama {siblings.length} produk — pilih untuk edit:</div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {siblings.map((s) => (
              <button
                key={s.id}
                onClick={() => s.id !== claim.id && onSwitch(s)}
                className={`shrink-0 px-3 py-2 rounded-full text-sm font-medium border transition ${
                  s.id === claim.id
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300"
                }`}
              >
                {s.brand} {s.produk}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Data Barang Masuk</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Field label="Nama Customer"><input className={inputCls} value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} /></Field>
        <Field label="No HP"><input type="tel" inputMode="numeric" className={inputCls} value={f.customerPhone} onChange={(e) => setF({ ...f, customerPhone: digitsOnly(e.target.value) })} /></Field>
        <Field label="Alamat Customer (opsional, buat kirim balik barang)"><input className={inputCls} value={alamat} onChange={(e) => setAlamat(e.target.value)} /></Field>
        <Field label="Tanggal Terima"><input type="date" className={inputCls} value={f.tanggalTerima} onChange={(e) => setF({ ...f, tanggalTerima: e.target.value })} /></Field>
        <Field label="Brand">
          <ComboInput value={f.brand} options={settings.brands} onChange={(v) => setF({ ...f, brand: v })} onAddOption={(v) => onAddOption("brands", v)} />
        </Field>
        <Field label="Produk / Model">
          <ProductCombo value={f.produk} skuValue={f.produkSku} products={settings.products || []} placeholder="Cari nama atau SKU..."
            onChange={(name, sku) => setF({ ...f, produk: name, produkSku: sku })} onAddProduct={onAddProduct} />
        </Field>
        <Field label="SN Diterima">
          <input className={inputCls} value={f.snDiterima} onChange={(e) => setF({ ...f, snDiterima: e.target.value })} />
          {isDuplicateSN(f.snDiterima, claim.id) && <p className="text-xs text-amber-600 mt-1">SN ini sudah ada di data lain</p>}
        </Field>
        <Field label="Garansi">
          <select className={inputCls} value={f.garansi} onChange={(e) => setF({ ...f, garansi: e.target.value })}><option>Ya</option><option>Tidak</option></select>
        </Field>
        <Field label="Jenis Penanganan">
          <select className={inputCls} value={f.jenis} onChange={(e) => setF({ ...f, jenis: e.target.value })}>
            <option value="">— Belum ditentukan —</option>
            {JENIS.map((j) => <option key={j}>{j}</option>)}
          </select>
        </Field>
        <Field label="Kelengkapan Barang"><input className={inputCls} value={f.kelengkapan} onChange={(e) => setF({ ...f, kelengkapan: e.target.value })} /></Field>
        {canManage ? (
          <Field label="Biaya ke Customer"><input type="number" className={inputCls} value={f.biayaToko} onChange={(e) => setF({ ...f, biayaToko: e.target.value })} /></Field>
        ) : (
          <LockedField label="Biaya ke Customer (koreksi: Admin Pusat)" value={rupiah(f.biayaToko)} />
        )}
        <Field label="Keluhan Kerusakan / Catatan" className="col-span-1 sm:col-span-2"><input className={inputCls} value={f.catatan} onChange={(e) => setF({ ...f, catatan: e.target.value })} /></Field>
      </div>

      <div className="mb-4">
        <label className="flex items-center gap-1 text-xs font-medium text-slate-500 mb-1"><Camera size={11} /> Foto Tanda Terima (sudah TTD Customer)</label>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => fotoRef.current.click()} className="flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-500 hover:border-indigo-400">
            <Camera size={14} /> {f.fotoTandaTerimaCustomer ? "Ganti foto" : "Upload foto"}
          </button>
          <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={handleFotoTandaTerima} />
          {f.fotoTandaTerimaCustomer && <img src={f.fotoTandaTerimaCustomer} className="h-16 rounded-lg border border-slate-200" />}
        </div>
        {!f.fotoTandaTerimaCustomer && <p className="text-[11px] text-slate-400 mt-1">Belum diupload. Cetak tanda terima dulu, minta TTD customer, lalu foto di sini.</p>}
      </div>

      <div className="mb-4">
        <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Sparepart Digunakan (opsional)</div>
        {canEditParts ? (
          <div className="space-y-2">
            {(f.partsUsed || []).map((pu, idx) => (
              <div key={idx} className="grid grid-cols-6 gap-2">
                <select
                  className={inputCls + " col-span-4"}
                  value={pu.partId}
                  onChange={(e) => { const next = [...f.partsUsed]; next[idx] = { ...next[idx], partId: e.target.value }; setF({ ...f, partsUsed: next }); }}
                >
                  <option value="">Pilih sparepart...</option>
                  {sortByName(settings.spareParts).map((sp) => (
                    <option key={sp.id} value={sp.id}>{sp.name} (stok: {sp.qty} {sp.unit})</option>
                  ))}
                </select>
                <input
                  type="number" min="1" className={inputCls + " col-span-1"}
                  value={pu.qty}
                  onChange={(e) => { const next = [...f.partsUsed]; next[idx] = { ...next[idx], qty: Number(e.target.value) || 1 }; setF({ ...f, partsUsed: next }); }}
                />
                <button onClick={() => setF({ ...f, partsUsed: f.partsUsed.filter((_, i) => i !== idx) })} className="col-span-1 text-slate-400 hover:text-red-500 justify-self-center"><X size={14} /></button>
              </div>
            ))}
            <button onClick={() => setF({ ...f, partsUsed: [...(f.partsUsed || []), { partId: "", qty: 1 }] })} className="flex items-center gap-1.5 text-sm text-indigo-600 font-medium">
              <Plus size={14} /> Tambah sparepart
            </button>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
            {(f.partsUsed || []).length > 0 ? (f.partsUsed || []).map((pu, idx) => {
              const part = (settings.spareParts || []).find((sp) => sp.id === pu.partId);
              return (
                <div key={idx} className="px-3 py-2 text-sm text-slate-600 flex items-center justify-between">
                  <span>{part ? part.name : "Sparepart"}</span>
                  <span className="text-slate-400">x{pu.qty}</span>
                </div>
              );
            }) : (
              <div className="px-3 py-2 text-sm text-slate-400">Tidak ada sparepart tercatat.</div>
            )}
            <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 flex items-center gap-1.5">
              <Lock size={11} /> Terkunci — sudah ada invoice untuk barang ini. Koreksi lewat Admin Pusat.
            </div>
          </div>
        )}
      </div>

      {claim.supplier && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Riwayat Proses ke Supplier (terkunci)</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <LockedField label="Supplier" value={claim.supplier} />
            <LockedField label="Tgl Kirim" value={fmtDate(claim.tanggalKirimSupplier)} />
            <LockedField label="Kode Batch" value={batch ? batch.kodeBatch : "-"} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {canManage ? (
              <Field label="Biaya Supplier (koreksi jika perlu)"><input type="number" className={inputCls} value={f.biayaSupplier} onChange={(e) => setF({ ...f, biayaSupplier: e.target.value })} /></Field>
            ) : (
              <LockedField label="Biaya Supplier (koreksi: Admin Pusat)" value={rupiah(f.biayaSupplier)} />
            )}
          </div>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button onClick={() => onPrint(siblings.length ? siblings : [claim])} className={`flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm ${btnSecondaryCls}`}>
            <Printer size={14} /> Tanda Terima Masuk{hasSiblings ? ` (${siblings.length})` : ""}
          </button>
          <button onClick={() => sendTrackingLinkWA(f.customerName, f.customerPhone)} className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100">
            <MessageCircle size={14} /> Kirim Link Status (WA)
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
          <button
            disabled={!dirty && alamat === (customerRecord?.alamat || "")}
            onClick={() => {
              if (dirty) onSave({ ...f, partsUsed: (f.partsUsed || []).filter((p) => p.partId && p.qty > 0) });
              if (alamat !== (customerRecord?.alamat || "")) onSaveCustomerAlamat(f.customerName, alamat);
              if (!dirty) onClose();
            }}
            className={`flex-1 px-4 py-2.5 text-sm ${btnPrimaryCls}`}
          >
            Simpan Perubahan
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Proses ke Supplier tab ----------
function claimsInBatch(claims, batchId) {
  return claims.filter((c) => c.batchId === batchId || c.stokReimbursedBatchId === batchId);
}
function batchItemState(c) {
  if (c.stokReimbursedBatchId) return c.stokReimbursedReceivedSN ? "selesai" : "menunggu-sn";
  return c.status === "Di Supplier" ? "di-supplier" : "kembali";
}
const isDoneState = (state) => state === "kembali" || state === "selesai";
function docsCompleteFor(batch, claims) {
  const anyKembali = claimsInBatch(claims, batch.id).some((c) => isDoneState(batchItemState(c)));
  return !!batch.fotoSuratJalanTTD && !!batch.fotoResi && (!anyKembali || !!batch.fotoBuktiTerimaBalik);
}

const SUPPLIER_STATE_META = {
  "kembali": { label: "Sudah Kembali", bg: "bg-emerald-100", text: "text-emerald-800", icon: CheckCircle2, iconColor: "text-emerald-600" },
  "selesai": { label: "Barang Pengganti Diterima", bg: "bg-emerald-100", text: "text-emerald-800", icon: CheckCircle2, iconColor: "text-emerald-600" },
  "di-supplier": { label: "Di Supplier", bg: "bg-amber-100", text: "text-amber-800", icon: Clock, iconColor: "text-amber-600" },
  "menunggu-sn": { label: "Menunggu Barang Pengganti", bg: "bg-blue-100", text: "text-blue-800", icon: Clock, iconColor: "text-blue-600" },
};
const SUPPLIER_EMPTY_FILTERS = { supplier: "", jenis: "", state: "", dokumen: "", minHari: "", from: "", to: "" };

function SupplierBatchOptionsMenu({ onPrint, onEdit, onDelete, canManage = true }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-700 p-1.5 -m-1.5 rounded-lg hover:bg-slate-100" title="Menu lainnya">
        <MoreVertical size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-2xl shadow-lg z-50 py-1">
            <button onClick={() => { setOpen(false); onPrint(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
              <Printer size={14} /> Cetak Surat Jalan
            </button>
            {canManage && (
              <>
                <button onClick={() => { setOpen(false); onEdit(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                  <Pencil size={14} /> Edit Batch
                </button>
                <button onClick={() => { setOpen(false); onDelete(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left">
                  <X size={14} /> Hapus Batch
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SupplierBatchCard({ batch, items, docsComplete, canManage, onOpenBatch, onPrint, onEdit, onDelete }) {
  const total = items.length;
  const done = items.filter((c) => isDoneState(batchItemState(c))).length;
  const allDone = done === total;

  return (
    <div className={`bg-white rounded-3xl border overflow-hidden ${allDone ? "border-slate-200" : "border-amber-200"}`}>
      <button onClick={() => onOpenBatch(batch)} className="w-full text-left">
        <div className="p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium text-slate-800 truncate">{batch.kodeBatch}</div>
            <div className="text-xs text-slate-400">{batch.supplier} · kirim {fmtDate(batch.tanggalKirim)}</div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${allDone ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {done}/{total} kembali
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${docsComplete ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
              {docsComplete ? "Dokumen lengkap" : "Dokumen belum lengkap"}
            </span>
          </div>
        </div>
      </button>
      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {items.map((c) => {
          const state = batchItemState(c);
          const meta = SUPPLIER_STATE_META[state];
          const Icon = meta.icon;
          const isReimb = c.jenis === "Ganti Baru";
          const hari = !isDoneState(state) ? daysSince(batch.tanggalKirim) : null;
          const overdue = hari !== null && hari >= 14;
          return (
            <button key={c.id} onClick={() => onOpenBatch(batch)} className="w-full text-left flex items-start gap-3 px-4 py-2.5">
              <Icon size={14} className={`shrink-0 mt-0.5 ${meta.iconColor}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm text-slate-700 truncate">{c.customerName} — {c.brand} {c.produk}</div>
                  <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${meta.bg} ${meta.text}`}>{meta.label}</span>
                </div>
                <div className="text-xs text-slate-400 font-mono break-all mt-0.5">{c.snDiterima}</div>
                {c.snPenggantiSupplier && (
                  <div className="text-xs text-indigo-600 font-mono break-all">→ SN Pengganti: {c.snPenggantiSupplier}</div>
                )}
                {c.stokReimbursedReceivedSN && (
                  <div className="text-xs text-emerald-600 font-mono break-all">→ SN Restock: {c.stokReimbursedReceivedSN}</div>
                )}
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {hari !== null && (
                    <span className={`text-[11px] font-medium flex items-center gap-0.5 ${overdue ? "text-red-600" : "text-slate-400"}`}>
                      {overdue && <AlertTriangle size={10} />} {hari} hari
                    </span>
                  )}
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${isReimb ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>{isReimb ? "Klaim Balik" : "Servis"}</span>
                </div>
              </div>
            </button>
          );
        })}
        {items.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">Tidak ada barang.</div>}
      </div>
      <div className="flex items-center justify-end px-3 py-2 border-t border-slate-100">
        <SupplierBatchOptionsMenu onPrint={() => onPrint(batch)} onEdit={() => onEdit(batch.id)} onDelete={() => onDelete(batch.id)} canManage={canManage} />
      </div>
    </div>
  );
}

function SupplierFilterPanel({ filters, settings, onApply, onClose }) {
  const [f, setF] = useState(filters);
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 mt-1 w-full sm:w-80 bg-white border border-slate-200 rounded-3xl shadow-lg z-40 p-4">
        <div className="space-y-3">
          <Field label="Supplier">
            <select className={inputCls} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })}>
              <option value="">Semua supplier</option>
              {(settings.suppliers || []).map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Jenis">
            <div className="flex gap-2">
              {["", "Servis", "Ganti Baru"].map((j) => (
                <button key={j || "all"} onClick={() => setF({ ...f, jenis: j })}
                  className={`flex-1 px-2 py-1.5 rounded-full text-xs font-medium border ${f.jenis === j ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-300 text-slate-600"}`}>
                  {j === "" ? "Semua" : j === "Ganti Baru" ? "Klaim Balik" : j}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Status Item">
            <select className={inputCls} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
              <option value="">Semua status</option>
              <option value="di-supplier">Di Supplier</option>
              <option value="menunggu-sn">Menunggu Barang Pengganti</option>
              <option value="kembali">Sudah Kembali</option>
              <option value="selesai">Barang Pengganti Diterima</option>
            </select>
          </Field>
          <Field label="Dokumen">
            <select className={inputCls} value={f.dokumen} onChange={(e) => setF({ ...f, dokumen: e.target.value })}>
              <option value="">Semua</option>
              <option value="lengkap">Lengkap</option>
              <option value="belum">Belum lengkap</option>
            </select>
          </Field>
          <Field label="Sudah Berapa Hari (belum kembali)">
            <input type="number" min="0" placeholder="mis. 14" className={inputCls} value={f.minHari} onChange={(e) => setF({ ...f, minHari: e.target.value })} />
            <p className="text-[11px] text-slate-400 mt-1">Cuma berlaku ke barang yang masih di supplier / belum kembali.</p>
          </Field>
          <Field label="Rentang Tanggal Kirim">
            <div className="flex gap-2">
              <input type="date" className={inputCls + " min-w-0"} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
              <input type="date" className={inputCls + " min-w-0"} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </div>
          </Field>
        </div>
        <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
          <button onClick={() => onApply(SUPPLIER_EMPTY_FILTERS)} className={`flex-1 px-3 py-2 text-sm ${btnSecondaryCls}`}>Reset</button>
          <button onClick={() => onApply(f)} className={`flex-1 px-3 py-2 text-sm ${btnPrimaryCls}`}>Terapkan</button>
        </div>
      </div>
    </>
  );
}

function SupplierTh({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  return (
    <th className="p-3 select-none">
      <button onClick={() => onSort(sortKey)} className={`flex items-center gap-1 hover:text-slate-700 whitespace-nowrap ${active ? "text-slate-700" : ""}`}>
        {label}
        {active ? (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={12} className="text-slate-300" />}
      </button>
    </th>
  );
}

function SupplierTab({ batches, claims, settings, role, isDesktopLayout, onOpenSend, onOpenReceive, onView, onPrintSuratJalan, onViewDoc, onUploadDoc, onEditBatch, onDeleteBatch, canDeleteBatch }) {
  const canManage = role === "pusat";
  const [tab, setTab] = useState("aktif");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState(SUPPLIER_EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState({ key: "hari", dir: "desc" });

  function onSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "hari" ? "desc" : "asc" }));
  }

  const batchesForView = useMemo(() => {
    return batches
      .map((b) => ({ batch: b, allItems: claimsInBatch(claims, b.id) }))
      .filter(({ batch, allItems }) => {
        const batchDone = allItems.length > 0 && allItems.every((c) => isDoneState(batchItemState(c)));
        if (tab === "aktif" && batchDone) return false;
        if (tab === "selesai" && !batchDone) return false;
        if (filters.supplier && batch.supplier !== filters.supplier) return false;
        if (filters.from && batch.tanggalKirim < filters.from) return false;
        if (filters.to && batch.tanggalKirim > filters.to) return false;
        const docsComplete = docsCompleteFor(batch, claims);
        if (filters.dokumen === "lengkap" && !docsComplete) return false;
        if (filters.dokumen === "belum" && docsComplete) return false;
        return true;
      })
      .map(({ batch, allItems }) => {
        const docsComplete = docsCompleteFor(batch, claims);
        const filteredItems = allItems.filter((c) => {
          const state = batchItemState(c);
          if (tab === "aktif" && isDoneState(state)) return false;
          if (tab === "selesai" && !isDoneState(state)) return false;
          if (filters.jenis && c.jenis !== filters.jenis) return false;
          if (filters.state && state !== filters.state) return false;
          if (filters.minHari) {
            const hari = daysSince(batch.tanggalKirim);
            if (isDoneState(state) || hari < Number(filters.minHari)) return false;
          }
          if (q) {
            const hay = `${batch.kodeBatch} ${batch.supplier} ${c.customerName} ${c.snDiterima} ${c.produk} ${c.snPenggantiSupplier} ${c.stokReimbursedReceivedSN} ${c.snPenggantiStock}`.toLowerCase();
            if (!hay.includes(q.toLowerCase())) return false;
          }
          return true;
        });
        return { batch, items: allItems, filteredItems, docsComplete };
      })
      .filter((b) => b.filteredItems.length > 0)
      .sort((a, b) => (b.batch.tanggalKirim || "").localeCompare(a.batch.tanggalKirim || ""));
  }, [batches, claims, tab, filters, q]);

  const rows = useMemo(() => {
    const r = [];
    batchesForView.forEach(({ batch, filteredItems, docsComplete }) => {
      filteredItems.forEach((c) => {
        const state = batchItemState(c);
        const hari = !isDoneState(state) ? daysSince(batch.tanggalKirim) : null;
        r.push({ rowId: `${batch.id}-${c.id}`, batch, state, hari, docsComplete, claim: c });
      });
    });
    if (!sort.key) return r;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...r].sort((a, b) => {
      let av, bv;
      switch (sort.key) {
        case "status": av = SUPPLIER_STATE_META[a.state]?.label || ""; bv = SUPPLIER_STATE_META[b.state]?.label || ""; break;
        case "hari": return ((a.hari ?? -1) - (b.hari ?? -1)) * dir;
        case "biayaSupplier": return ((Number(a.claim.biayaSupplier) || 0) - (Number(b.claim.biayaSupplier) || 0)) * dir;
        case "biayaCustomer": return ((Number(a.claim.biayaToko) || 0) - (Number(b.claim.biayaToko) || 0)) * dir;
        case "kodeBatch": av = a.batch.kodeBatch; bv = b.batch.kodeBatch; break;
        case "supplier": av = a.batch.supplier; bv = b.batch.supplier; break;
        case "tanggalKirim": av = a.batch.tanggalKirim; bv = b.batch.tanggalKirim; break;
        case "customerName": av = a.claim.customerName; bv = b.claim.customerName; break;
        case "produk": av = `${a.claim.brand} ${a.claim.produk}`; bv = `${b.claim.brand} ${b.claim.produk}`; break;
        case "snDiterima": av = a.claim.snDiterima; bv = b.claim.snDiterima; break;
        case "jenis": av = a.claim.jenis; bv = b.claim.jenis; break;
        case "snPenggantiSupplier": av = a.claim.snPenggantiSupplier || ""; bv = b.claim.snPenggantiSupplier || ""; break;
        case "snRestock": av = a.claim.stokReimbursedReceivedSN || ""; bv = b.claim.stokReimbursedReceivedSN || ""; break;
        default: av = ""; bv = "";
      }
      return String(av || "").localeCompare(String(bv || "")) * dir;
    });
  }, [batchesForView, sort]);

  const allPendingClaims = claims.filter((c) => !isDoneState(batchItemState(c)) && (c.status === "Di Supplier" || (c.stokReimbursedBatchId && !c.stokReimbursedReceivedSN)));
  const allAktifCount = allPendingClaims.length;
  const allSelesaiCount = claims.filter((c) => (c.batchId || c.stokReimbursedBatchId) && isDoneState(batchItemState(c))).length;
  const activeFilterCount = Object.keys(filters).filter((k) => filters[k]).length;

  return (
    <div>
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={onOpenSend} className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnPrimaryCls}`}>
          <PackagePlus size={14} /> Kirim ke Supplier
        </button>
        <button onClick={() => onOpenReceive()} className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-amber-300 text-amber-700 bg-amber-50 text-sm font-medium hover:bg-amber-100">
          <PackageCheck size={14} /> Terima dari Supplier
          {allAktifCount > 0 && <span className="ml-1 bg-amber-600 text-white text-[10px] rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{allAktifCount}</span>}
        </button>
      </div>

      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-full w-fit">
        <button onClick={() => setTab("aktif")} className={`px-4 py-1.5 rounded-full text-sm font-medium ${tab === "aktif" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>
          Perlu Tindak Lanjut ({allAktifCount})
        </button>
        <button onClick={() => setTab("selesai")} className={`px-4 py-1.5 rounded-full text-sm font-medium ${tab === "selesai" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>
          Selesai ({allSelesaiCount})
        </button>
      </div>

      <div className="flex gap-2 mb-4 relative">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode batch, customer, SN..." className={inputCls + " pl-8"} />
        </div>
        <button onClick={() => setFilterOpen((o) => !o)} className={`relative flex items-center gap-1.5 px-3 py-2 text-sm ${btnSecondaryCls}`}>
          <SlidersHorizontal size={14} /> Filter
          {activeFilterCount > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center">{activeFilterCount}</span>}
        </button>
        {filterOpen && (
          <SupplierFilterPanel filters={filters} settings={settings} onClose={() => setFilterOpen(false)} onApply={(f) => { setFilters(f); setFilterOpen(false); }} />
        )}
      </div>

      <div className="text-sm text-slate-500 mb-3">{rows.length} barang · {batchesForView.length} batch</div>

      {!isDesktopLayout && (
        <div className="space-y-3">
          {batchesForView.map(({ batch, filteredItems, docsComplete }) => (
            <SupplierBatchCard
              key={batch.id}
              batch={batch}
              items={filteredItems}
              docsComplete={docsComplete}
              canManage={canManage}
              onOpenBatch={(b) => onView(b.id)}
              onPrint={(b) => onPrintSuratJalan(b, claimsInBatch(claims, b.id))}
              onEdit={onEditBatch}
              onDelete={onDeleteBatch}
            />
          ))}
          {batchesForView.length === 0 && (
            <div className="text-center text-slate-400 py-10 bg-white rounded-3xl border border-slate-200 text-sm">Tidak ada data yang cocok dengan filter.</div>
          )}
        </div>
      )}

      {isDesktopLayout && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
                <SupplierTh label="Status" sortKey="status" sort={sort} onSort={onSort} />
                <SupplierTh label="Kode Batch" sortKey="kodeBatch" sort={sort} onSort={onSort} />
                <SupplierTh label="Supplier" sortKey="supplier" sort={sort} onSort={onSort} />
                <SupplierTh label="Tgl Kirim" sortKey="tanggalKirim" sort={sort} onSort={onSort} />
                <SupplierTh label="Hari" sortKey="hari" sort={sort} onSort={onSort} />
                <SupplierTh label="Customer" sortKey="customerName" sort={sort} onSort={onSort} />
                <SupplierTh label="Brand / Produk" sortKey="produk" sort={sort} onSort={onSort} />
                <SupplierTh label="SN" sortKey="snDiterima" sort={sort} onSort={onSort} />
                <SupplierTh label="Jenis" sortKey="jenis" sort={sort} onSort={onSort} />
                <SupplierTh label="SN Pengganti (Supplier)" sortKey="snPenggantiSupplier" sort={sort} onSort={onSort} />
                <SupplierTh label="SN Restock (Klaim Balik)" sortKey="snRestock" sort={sort} onSort={onSort} />
                <SupplierTh label="Biaya Supplier" sortKey="biayaSupplier" sort={sort} onSort={onSort} />
                <SupplierTh label="Biaya Customer" sortKey="biayaCustomer" sort={sort} onSort={onSort} />
                <th className="p-3">Dokumen</th>
                <th className="p-3"></th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = SUPPLIER_STATE_META[r.state];
                const isReimb = r.claim.jenis === "Ganti Baru";
                const overdue = r.hari !== null && r.hari >= 14;
                return (
                  <tr key={r.rowId} className="border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer" onClick={() => onView(r.batch.id)}>
                    <td className="p-3"><span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.text} whitespace-nowrap`}>{meta.label}</span></td>
                    <td className="p-3 whitespace-nowrap font-medium text-slate-700">{r.batch.kodeBatch}</td>
                    <td className="p-3 whitespace-nowrap">{r.batch.supplier}</td>
                    <td className="p-3 whitespace-nowrap">{fmtDate(r.batch.tanggalKirim)}</td>
                    <td className="p-3 whitespace-nowrap">
                      {r.hari !== null ? (
                        <span className={`inline-flex items-center gap-1 font-medium ${overdue ? "text-red-600" : "text-slate-600"}`}>
                          {overdue && <AlertTriangle size={11} />} {r.hari} hari
                        </span>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="p-3 whitespace-nowrap">{r.claim.customerName}</td>
                    <td className="p-3 whitespace-nowrap">{r.claim.brand} {r.claim.produk}</td>
                    <td className="p-3 font-mono text-xs whitespace-nowrap">{r.claim.snDiterima}</td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${isReimb ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>{isReimb ? "Klaim Balik" : "Servis"}</span>
                    </td>
                    <td className="p-3 font-mono text-xs max-w-[140px] break-all">{r.claim.snPenggantiSupplier || "-"}</td>
                    <td className="p-3 font-mono text-xs max-w-[140px] break-all">{r.claim.stokReimbursedReceivedSN || "-"}</td>
                    <td className="p-3 whitespace-nowrap">{!isReimb ? rupiah(r.claim.biayaSupplier) : "-"}</td>
                    <td className="p-3 whitespace-nowrap">{!isReimb ? rupiah(r.claim.biayaToko) : "-"}</td>
                    <td className="p-3 whitespace-nowrap">
                      {r.docsComplete ? (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">Lengkap</span>
                      ) : (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">Belum lengkap</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {!isDoneState(r.state) && (
                        <button onClick={() => onOpenReceive([r.claim.id])} className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 whitespace-nowrap">
                          <PackageCheck size={12} /> Terima
                        </button>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <SupplierBatchOptionsMenu
                        onPrint={() => onPrintSuratJalan(r.batch, claimsInBatch(claims, r.batch.id))}
                        onEdit={() => onEditBatch(r.batch.id)}
                        onDelete={() => onDeleteBatch(r.batch.id)}
                        canManage={canManage}
                      />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={16} className="p-8 text-center text-slate-400">Tidak ada data yang cocok dengan filter.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SendToSupplierModal({ claims, settings, preselectIds, onClose, onSend, onAddOption }) {
  const [supplier, setSupplier] = useState("");
  const [tanggalKirim, setTanggalKirim] = useState(todayStr());
  const [picked, setPicked] = useState(preselectIds || []);
  const [q, setQ] = useState("");
  const [brandFilter, setBrandFilter] = useState("");

  const available = claims.filter((c) => {
    const isServisBaru = c.status === "Baru" && c.jenis === "Servis";
    const isReimbursement = c.jenis === "Ganti Baru" && c.garansi === "Ya" && c.sumberPenyelesaian === "Stok Toko" && !c.stokReimbursed;
    const isPendingPreselected = (preselectIds || []).includes(c.id) && (c.status === "Menunggu Konfirmasi" || c.status === "Baru");
    if (!isServisBaru && !isReimbursement && !isPendingPreselected) return false;
    if (brandFilter && c.brand !== brandFilter) return false;
    if (q) {
      const hay = `${c.customerName} ${c.snDiterima} ${c.produk}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const kodeBatch = supplier ? `KRM-${tanggalKirim.replace(/-/g, "")}-${supplier.replace(/\s+/g, "").slice(0, 6).toUpperCase()}` : "";
  const pickedItems = claims.filter((c) => picked.includes(c.id));
  const [reviewing, setReviewing] = useState(false);

  if (reviewing) {
    return (
      <Modal title="Konfirmasi Kirim ke Supplier" subtitle="Cek dulu sebelum dikirim — cetak surat jalan & upload foto resi bisa dilakukan setelah ini" onClose={onClose} wide>
        <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 mb-4 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-slate-400">Supplier</span>
            <span className="text-slate-800 font-medium">{supplier}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-slate-400">Tanggal Kirim</span>
            <span className="text-slate-800 font-medium">{fmtDate(tanggalKirim)}</span>
          </div>
        </div>
        <div className="text-xs font-semibold text-slate-400 uppercase mb-2">{pickedItems.length} Barang</div>
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-50 max-h-56 overflow-y-auto mb-4">
          {pickedItems.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="font-mono text-xs text-slate-500 w-28 truncate">{c.snDiterima}</span>
              <span className="flex-1">{c.customerName} — {c.brand} {c.produk}</span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${c.jenis === "Ganti Baru" ? "bg-indigo-100 text-indigo-700" : "bg-blue-100 text-blue-700"}`}>
                {c.jenis === "Ganti Baru" ? "Klaim Balik" : "Servis"}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setReviewing(false)} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>← Kembali</button>
          <button
            onClick={() => onSend({ supplier, itemIds: picked, fotoResi: null, tanggalKirim, kodeBatch })}
            className={`flex-1 px-4 py-2.5 text-sm ${btnPrimaryCls}`}
          >
            Ya, Kirim Sekarang
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Kirim ke Supplier" subtitle="Barang servis yang siap dikirim, digabung dengan barang garansi yang perlu diklaim balik ke supplier" onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <Field label="Supplier Tujuan">
          <ComboInput value={supplier} options={settings.suppliers} placeholder="Pilih supplier"
            onChange={setSupplier} onAddOption={(v) => onAddOption("suppliers", v)} />
        </Field>
        <Field label="Tanggal Kirim"><input type="date" className={inputCls} value={tanggalKirim} onChange={(e) => setTanggalKirim(e.target.value)} /></Field>
      </div>
      <p className="text-xs text-slate-400 mb-4">Foto resi diupload belakangan setelah barang benar-benar dikirim — cetak surat jalan dulu, baru foto resinya lewat menu "⋮" di detail pengiriman ini.</p>

      <div className="grid grid-cols-3 gap-2 mb-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari customer / SN / produk..." className={inputCls + " col-span-2"} />
        <select className={inputCls + " col-span-1"} value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}>
          <option value="">Semua brand</option>
          {settings.brands.map((b) => <option key={b}>{b}</option>)}
        </select>
      </div>
      <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Barang siap dikirim ({available.length} tersedia)</div>
      <div className="border border-slate-200 rounded-xl max-h-64 overflow-y-auto divide-y divide-slate-50">
        {available.map((c) => {
          const isReimbursement = c.jenis === "Ganti Baru";
          return (
            <label key={c.id} className="flex items-center gap-3 p-3 text-sm hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
              <span className="font-mono text-xs text-slate-500 w-32 truncate">{c.snDiterima}</span>
              <span className="flex-1">{c.customerName} — {c.brand} {c.produk}</span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${isReimbursement ? "bg-indigo-100 text-indigo-700" : "bg-blue-100 text-blue-700"}`}>
                {isReimbursement ? "Klaim Balik" : "Servis"}
              </span>
            </label>
          );
        })}
        {available.length === 0 && <div className="p-4 text-sm text-slate-400">Tidak ada barang yang perlu dikirim saat ini.</div>}
      </div>

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
        <button onClick={onClose} className={`px-4 py-2 text-sm ${btnSecondaryCls} border-none`}>Batal</button>
        <button
          disabled={!supplier || picked.length === 0}
          onClick={() => setReviewing(true)}
          className={`px-4 py-2 text-sm ${btnPrimaryCls}`}
        >
          Kirim ({picked.length} barang)
        </button>
      </div>
    </Modal>
  );
}

function ReceiveFromSupplierModal({ claims, batches, preselectIds, onClose, onReceive }) {
  const [supplierFilter, setSupplierFilter] = useState("");
  const [q, setQ] = useState("");
  const [tanggalTerima, setTanggalTerima] = useState(todayStr());
  const [checked, setChecked] = useState(() => {
    const s = {};
    (preselectIds || []).forEach((id) => { s[id] = true; });
    return s;
  });
  const [hasilMap, setHasilMap] = useState({});
  const [snMap, setSnMap] = useState({});
  const [biayaMap, setBiayaMap] = useState({});
  const [biayaCustomerMap, setBiayaCustomerMap] = useState({});
  const [reimburseSnMap, setReimburseSnMap] = useState({});
  const [reviewing, setReviewing] = useState(false);

  const isReimbursement = (c) => c.jenis === "Ganti Baru" && !!c.stokReimbursedBatchId;
  const pendingServis = claims.filter((c) => c.status === "Di Supplier");
  const pendingReimbursement = claims.filter((c) => c.jenis === "Ganti Baru" && c.stokReimbursed && !c.stokReimbursedReceivedSN);
  const allPending = [...pendingServis, ...pendingReimbursement];
  const suppliers = [...new Set(allPending.map((c) => c.supplier || c.stokReimbursedSupplier).filter(Boolean))];
  const pending = allPending
    .filter((c) => !supplierFilter || (c.supplier || c.stokReimbursedSupplier) === supplierFilter)
    .filter((c) => !q || `${c.customerName} ${c.snDiterima} ${c.produk}`.toLowerCase().includes(q.toLowerCase()));

  const groups = useMemo(() => {
    const map = {};
    pending.forEach((c) => {
      const bid = c.batchId || c.stokReimbursedBatchId || "__no_batch__";
      if (!map[bid]) map[bid] = { batch: batches.find((b) => b.id === bid) || null, items: [] };
      map[bid].items.push(c);
    });
    return Object.values(map).sort((a, b) => (b.batch?.tanggalKirim || "").localeCompare(a.batch?.tanggalKirim || ""));
  }, [pending, batches]);

  const toggle = (id) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const toggleGroup = (items) => {
    const allChecked = items.every((c) => checked[c.id]);
    setChecked((prev) => {
      const next = { ...prev };
      items.forEach((c) => { next[c.id] = !allChecked; });
      return next;
    });
  };
  const checkedIds = Object.keys(checked).filter((id) => checked[id]);
  const canSubmit = checkedIds.length > 0 && checkedIds.every((id) => {
    const c = claims.find((x) => x.id === id);
    if (!c) return false;
    if (isReimbursement(c)) return !!(reimburseSnMap[id] || "").trim();
    const h = hasilMap[id];
    if (!h) return false;
    if (h === "Diganti Unit Baru") return !!(snMap[id] || "").trim();
    return true;
  });

  function buildEntries() {
    return checkedIds.map((id) => {
      const c = claims.find((x) => x.id === id);
      if (isReimbursement(c)) {
        return { id, type: "reimbursement", sn: (reimburseSnMap[id] || "").trim() };
      }
      return {
        id,
        type: "servis",
        hasilSupplier: hasilMap[id],
        snPenggantiSupplier: hasilMap[id] === "Diganti Unit Baru" ? (snMap[id] || "").trim() : "",
        biayaSupplier: biayaMap[id] || "",
        biayaCustomer: biayaCustomerMap[id] || "",
      };
    });
  }

  if (reviewing) {
    const entries = buildEntries();
    return (
      <Modal title="Konfirmasi Terima dari Supplier" subtitle="Cek dulu sebelum disimpan" onClose={onClose} wide>
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-50 max-h-72 overflow-y-auto mb-4">
          {entries.map((e) => {
            const c = claims.find((x) => x.id === e.id);
            return (
              <div key={e.id} className="p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>{c.customerName} — {c.brand} {c.produk}</span>
                  <span className="text-xs text-slate-400 font-mono">{c.snDiterima}</span>
                </div>
                {e.type === "reimbursement" ? (
                  <div className="text-xs text-indigo-600 mt-0.5">SN pengganti (klaim balik): {e.sn}</div>
                ) : (
                  <div className="text-xs text-slate-500 mt-0.5">{e.hasilSupplier}{e.snPenggantiSupplier ? ` — SN ${e.snPenggantiSupplier}` : ""}{Number(e.biayaCustomer) > 0 ? ` — Biaya ke customer ${rupiah(e.biayaCustomer)}` : " — Gratis"}</div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setReviewing(false)} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>← Kembali</button>
          <button onClick={() => onReceive(entries, tanggalTerima)} className={`flex-1 px-4 py-2.5 text-sm rounded-full bg-amber-600 text-white font-medium`}>Ya, Tandai Kembali</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Terima dari Supplier" subtitle="Dikelompokkan per pengiriman — centang per SN yang sudah kembali atau sudah dapat SN pengganti, cocok untuk penerimaan bertahap" onClose={onClose} wide>
      <div className="mb-3">
        <label className="block text-xs font-medium text-slate-500 mb-1">Tanggal Diterima (berlaku untuk semua yang dicentang)</label>
        <input type="date" className={inputCls + " sm:w-56 min-w-0"} value={tanggalTerima} onChange={(e) => setTanggalTerima(e.target.value)} />
      </div>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari customer / SN / produk..." className="w-full sm:w-auto sm:flex-1 sm:min-w-0 border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        <select className={inputCls + " sm:w-52"} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
          <option value="">Semua supplier</option>
          {suppliers.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="border border-slate-200 rounded-xl divide-y divide-slate-200 max-h-[28rem] overflow-y-auto">
        {groups.map(({ batch, items }) => {
          const allChecked = items.every((c) => checked[c.id]);
          return (
            <div key={batch ? batch.id : "no-batch"}>
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 sticky top-0">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={allChecked} onChange={() => toggleGroup(items)} />
                  {batch ? batch.kodeBatch : "Tanpa kode batch"}
                  <span className="font-normal text-slate-400">· {batch?.supplier} · kirim {fmtDate(batch?.tanggalKirim)} · {items.length} barang</span>
                </label>
              </div>
              <div className="divide-y divide-slate-50">
                {items.map((c) => {
                  const reimb = isReimbursement(c);
                  return (
                    <div key={c.id} className="p-3 pl-6">
                      <label className="flex items-center gap-3 text-sm cursor-pointer">
                        <input type="checkbox" checked={!!checked[c.id]} onChange={() => toggle(c.id)} />
                        <span className="font-mono text-xs text-slate-500 w-32 truncate">{c.snDiterima}</span>
                        <span className="flex-1">{c.customerName} — {c.brand} {c.produk}</span>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${reimb ? "bg-indigo-100 text-indigo-700" : "bg-blue-100 text-blue-700"}`}>
                          {reimb ? "Klaim Balik" : "Servis"}
                        </span>
                      </label>
                      {checked[c.id] && (
                        <div className="mt-2 ml-7 space-y-2">
                          {reimb ? (
                            <input
                              placeholder="SN unit pengganti dari supplier"
                              className={inputCls}
                              value={reimburseSnMap[c.id] || ""}
                              onChange={(e) => setReimburseSnMap((m) => ({ ...m, [c.id]: e.target.value }))}
                            />
                          ) : (
                            <>
                              <HasilSupplierPicker
                                value={hasilMap[c.id] || ""}
                                sn={snMap[c.id] || ""}
                                onChangeValue={(v) => setHasilMap((m) => ({ ...m, [c.id]: v }))}
                                onChangeSn={(v) => setSnMap((m) => ({ ...m, [c.id]: v }))}
                              />
                              {hasilMap[c.id] === "Diservis" && (
                                <>
                                  <input type="number" placeholder="Biaya dari supplier (jika ada)" className={inputCls} value={biayaMap[c.id] || ""} onChange={(e) => setBiayaMap((m) => ({ ...m, [c.id]: e.target.value }))} />
                                  <input type="number" placeholder="Biaya ke customer (0 kalau gratis/customer menolak servis)" className={inputCls} value={biayaCustomerMap[c.id] || ""} onChange={(e) => setBiayaCustomerMap((m) => ({ ...m, [c.id]: e.target.value }))} />
                                </>
                              )}
                              {hasilMap[c.id] === "Diganti Unit Baru" && (
                                <p className="text-[11px] text-slate-400">Unit diganti baru oleh supplier — tidak ada biaya ke toko maupun customer.</p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {groups.length === 0 && <div className="p-4 text-sm text-slate-400">Tidak ada barang yang sedang di supplier atau menunggu barang pengganti.</div>}
      </div>

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
        <button onClick={onClose} className={`px-4 py-2 text-sm ${btnSecondaryCls} border-none`}>Batal</button>
        <button
          disabled={!canSubmit}
          onClick={() => setReviewing(true)}
          className="px-4 py-2 rounded-full text-sm font-medium bg-amber-600 text-white disabled:opacity-40"
        >
          Lanjut ({checkedIds.length} barang)
        </button>
      </div>
    </Modal>
  );
}

function SupplierBatchDetailModal({ batch, claims, role, onClose, onPrintSuratJalan, onViewDoc, onUploadDoc, onEdit, onDelete, canDeleteBatch, onReceiveItem }) {
  if (!batch) return null;
  const items = claimsInBatch(claims, batch.id);
  const anyKembali = items.some((c) => isDoneState(batchItemState(c)));
  const menu = (
    <SupplierBatchOptionsMenu
      onPrint={() => onPrintSuratJalan(batch, items)}
      onEdit={() => onEdit(batch.id)}
      onDelete={() => onDelete(batch.id)}
      canManage={role === "pusat"}
    />
  );

  function docTarget(docKey, label) {
    return { batchId: batch.id, docKey, label, kodeBatch: batch.kodeBatch, dataUrl: batch[docKey] };
  }

  return (
    <Modal title={batch.kodeBatch} subtitle={`${batch.supplier} · kirim ${fmtDate(batch.tanggalKirim)}`} onClose={onClose} wide headerExtra={menu}>
      <div className="mb-5">
        <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Dokumen</div>
        <p className="text-[11px] text-slate-400 mb-2">Foto bukti fisik yang sudah ditandatangani. Buat cetak format surat jalan kosong, pakai menu "⋮" di atas.</p>
        <div className="border border-slate-200 rounded-xl px-3">
          <DocRow icon={FileText} label="Foto Surat Jalan (TTD Supplier)" hasFile={!!batch.fotoSuratJalanTTD}
            onView={() => onViewDoc(docTarget("fotoSuratJalanTTD", "Foto Surat Jalan (TTD Supplier)"))}
            onUpload={() => onUploadDoc(docTarget("fotoSuratJalanTTD", "Foto Surat Jalan (TTD Supplier)"))} />
          <DocRow icon={Printer} label="Foto Resi Kirim" hasFile={!!batch.fotoResi}
            onView={() => onViewDoc(docTarget("fotoResi", "Foto Resi Kirim"))}
            onUpload={() => onUploadDoc(docTarget("fotoResi", "Foto Resi Kirim"))} />
          <DocRow icon={Camera} label="Bukti Terima Balik" hasFile={!!batch.fotoBuktiTerimaBalik}
            onView={() => onViewDoc(docTarget("fotoBuktiTerimaBalik", "Bukti Terima Balik"))}
            onUpload={() => onUploadDoc(docTarget("fotoBuktiTerimaBalik", "Bukti Terima Balik"))}
            disabledHint={!anyKembali ? "belum ada barang kembali" : null} />
        </div>
      </div>

      <div className="text-xs font-semibold text-slate-400 uppercase mb-2">{items.length} Barang</div>
      <div className="space-y-2">
        {items.map((c) => {
          const state = batchItemState(c);
          const meta = SUPPLIER_STATE_META[state];
          const isReimb = c.jenis === "Ganti Baru";
          return (
            <div key={c.id} className="border border-slate-200 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="text-sm min-w-0">
                  <span className="font-medium">{c.customerName}</span>
                  <span className="text-slate-400"> — {c.brand} {c.produk}</span>
                  <div className="font-mono text-xs text-slate-500 break-all">{c.snDiterima}</div>
                </div>
                <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${meta.bg} ${meta.text}`}>{meta.label}</span>
              </div>
              <div className="flex items-start gap-2 flex-wrap text-xs">
                <span className={`shrink-0 px-1.5 py-0.5 rounded-full font-medium ${isReimb ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>{isReimb ? "Klaim Balik" : "Servis"}</span>
                {c.snPenggantiSupplier && <span className="text-slate-500 break-all">SN pengganti: <span className="font-mono">{c.snPenggantiSupplier}</span></span>}
                {c.stokReimbursedReceivedSN && <span className="text-emerald-600 break-all">SN restock: <span className="font-mono">{c.stokReimbursedReceivedSN}</span></span>}
                {!isReimb && isDoneState(state) && (
                  <span className="text-slate-500">Biaya Supplier: {rupiah(c.biayaSupplier)} · Biaya Customer: {rupiah(c.biayaToko)}</span>
                )}
              </div>
              {!isDoneState(state) && (
                <button onClick={() => onReceiveItem(c.id)} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-600 text-white text-xs font-medium hover:bg-amber-700">
                  <PackageCheck size={12} /> Terima Barang Ini
                </button>
              )}
            </div>
          );
        })}
        {items.length === 0 && <div className="text-sm text-slate-400 text-center py-6">Tidak ada barang di pengiriman ini.</div>}
      </div>
    </Modal>
  );
}

function DocRow({ icon: Icon, label, hasFile, disabledHint, onView, onUpload }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-slate-50 last:border-b-0">
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <Icon size={13} className="text-slate-400 shrink-0" />
        {label}
      </div>
      {disabledHint ? (
        <span className="text-[11px] text-slate-300">{disabledHint}</span>
      ) : hasFile ? (
        <button onClick={onView} className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full hover:bg-emerald-100 flex items-center gap-1">
          <CheckCircle2 size={11} /> Lihat
        </button>
      ) : (
        <button onClick={onUpload} className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full hover:bg-amber-100 flex items-center gap-1">
          <Camera size={11} /> Upload
        </button>
      )}
    </div>
  );
}

function EditBatchModal({ batch, onClose, onSave }) {
  const [supplier, setSupplier] = useState(batch?.supplier || "");
  const [tanggal, setTanggal] = useState(batch?.tanggalKirim || "");
  if (!batch) return null;
  return (
    <Modal title="Edit Batch" subtitle={batch.kodeBatch} onClose={onClose}>
      <div className="space-y-3 mb-5">
        <Field label="Supplier"><input className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field>
        <Field label="Tanggal Kirim"><input type="date" className={inputCls} value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></Field>
      </div>
      <p className="text-xs text-slate-400 mb-4">Koreksi ini juga akan ikut mengubah catatan supplier/tanggal kirim di setiap barang dalam batch ini. Item-item di dalamnya sendiri tidak berubah.</p>
      <div className="flex gap-2">
        <button onClick={onClose} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
        <button
          disabled={!supplier.trim() || !tanggal}
          onClick={() => onSave({ supplier: supplier.trim(), tanggalKirim: tanggal })}
          className={`flex-1 px-4 py-2.5 text-sm ${btnPrimaryCls}`}
        >
          Simpan Perubahan
        </button>
      </div>
    </Modal>
  );
}

function DeleteBatchModal({ batch, canDelete, onClose, onConfirm }) {
  if (!batch) return null;
  return (
    <Modal title="Hapus Batch Ini?" onClose={onClose}>
      <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-800 mb-4">
        <div className="font-medium mb-1">{batch.kodeBatch}</div>
        <div className="text-xs">{batch.supplier} · {(batch.itemIds || []).length} barang di dalamnya</div>
      </div>
      {canDelete ? (
        <>
          <p className="text-sm text-slate-600 mb-4">Barang di dalamnya akan dikembalikan ke status sebelum dikirim (Baru / belum diklaim balik). Tindakan ini permanen.</p>
          <div className="flex gap-2">
            <button onClick={onClose} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
            <button onClick={onConfirm} className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-red-600 text-white">Ya, Hapus</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600 mb-4">Batch ini tidak bisa dihapus karena sudah ada barang yang ditandai kembali dari supplier. Menghapusnya sekarang akan menghilangkan catatan hasil yang sudah tercatat.</p>
          <button onClick={onClose} className={`w-full py-2.5 text-sm ${btnPrimaryCls}`}>Tutup</button>
        </>
      )}
    </Modal>
  );
}

// ---------- Inventaris (dulu "Stok & Barang") ----------
function groupByProduct(claims) {
  const map = {};
  claims.forEach((c) => {
    const key = `${c.brand}||${c.produk}`;
    if (!map[key]) map[key] = { brand: c.brand, produk: c.produk, items: [] };
    map[key].items.push(c);
  });
  return Object.values(map).sort((a, b) => b.items.length - a.items.length);
}

function heldStockRows(claims) {
  const gantiBaru = claims.filter((c) => c.jenis === "Ganti Baru" && c.garansi === "Ya" && c.sumberPenyelesaian === "Stok Toko" && !c.stokReimbursed)
    .map((c) => ({ ...c, kategori: "Ganti Baru — Stok Kita", ket: `diambil ${fmtDate(c.tanggalAmbilCustomer || c.tanggalTerima)}` }));
  const awaitingSN = claims.filter((c) => c.jenis === "Ganti Baru" && c.stokReimbursed && !c.stokReimbursedReceivedSN)
    .map((c) => ({ ...c, kategori: "Menunggu Barang Pengganti", ket: "menunggu barang pengganti dari supplier" }));
  const servisHeld = claims.filter((c) => c.jenis === "Servis" && (c.status === "Di Supplier" || c.status === "Baru"))
    .map((c) => ({ ...c, kategori: "Servis — Barang Customer", ket: c.status === "Di Supplier" ? `di ${c.supplier || "supplier"} sejak ${fmtDate(c.tanggalKirimSupplier)}` : "belum dikirim ke supplier" }));
  return [...gantiBaru, ...awaitingSN, ...servisHeld];
}

function HeldStockDesktopTable({ rows }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
            <th className="p-3">Kategori</th>
            <th className="p-3">Customer</th>
            <th className="p-3">Brand / Produk</th>
            <th className="p-3">SN</th>
            <th className="p-3">Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-slate-50">
              <td className="p-3 whitespace-nowrap">
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${c.kategori === "Ganti Baru — Stok Kita" ? "bg-indigo-100 text-indigo-700" : c.kategori === "Menunggu Barang Pengganti" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{c.kategori}</span>
              </td>
              <td className="p-3 whitespace-nowrap">{c.customerName}</td>
              <td className="p-3 whitespace-nowrap">{c.brand} {c.produk}</td>
              <td className="p-3 font-mono text-xs whitespace-nowrap">{c.snDiterima}</td>
              <td className="p-3 text-slate-500">{c.ket}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">Tidak ada barang tertahan.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function HeldStockRow({ claim, tag }) {
  return (
    <div className="p-3 flex items-center justify-between gap-3 text-sm">
      <div>
        <div className="text-slate-800">{claim.customerName} · SN {claim.snDiterima}</div>
        <div className="text-xs text-slate-400">{claim.ket}</div>
      </div>
    </div>
  );
}

function BarangTertahanTab({ claims, isDesktopLayout, onGoToSupplierTab }) {
  const [query, setQuery] = useState("");
  const rows = heldStockRows(claims);
  const filtered = query.trim()
    ? rows.filter((c) => `${c.brand} ${c.produk} ${c.customerName} ${c.snDiterima}`.toLowerCase().includes(query.trim().toLowerCase()))
    : rows;

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="text-sm font-semibold text-slate-700">Barang Tertahan (masih rusak, fisik ada di toko / di supplier)</div>
        <button onClick={onGoToSupplierTab} className="shrink-0 text-xs text-indigo-600 font-medium flex items-center gap-1 hover:text-indigo-700">
          Kelola di Proses ke Supplier <ArrowRight size={12} />
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3">Bukan stok siap jual — laporan barang rusak/klaim yang masih di toko atau di supplier, belum selesai.</p>
      {rows.length > 5 && (
        <div className="relative mb-3">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className={inputCls + " pl-8"} placeholder="Cari produk, customer, atau SN..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}
      {isDesktopLayout ? (
        <HeldStockDesktopTable rows={filtered} />
      ) : (
        <div className="space-y-4">
          {["Ganti Baru — Stok Kita", "Menunggu Barang Pengganti", "Servis — Barang Customer"].map((kat) => {
            const items = filtered.filter((c) => c.kategori === kat);
            if (items.length === 0) return null;
            return (
              <div key={kat}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{kat}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">{items.length} unit</span>
                </div>
                <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100">
                  {groupByProduct(items).map((g) => (
                    <div key={g.brand + g.produk}>
                      <div className="px-3 pt-2.5 pb-1 text-sm font-medium text-slate-700">{g.brand} {g.produk} <span className="text-xs text-slate-400 font-normal">({g.items.length})</span></div>
                      <div className="divide-y divide-slate-50">
                        {g.items.map((c) => <HeldStockRow key={c.id} claim={c} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="text-center text-slate-400 py-10 bg-white rounded-3xl border border-slate-200 text-sm">Tidak ada barang tertahan.</div>}
        </div>
      )}
    </div>
  );
}

function StockItemFormModal({ title, subtitle, initial, onClose, onSave }) {
  const [name, setName] = useState(initial.name || "");
  const [unit, setUnit] = useState(initial.unit || "");
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      <div className="space-y-3 mb-5">
        <Field label="Nama"><input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Satuan"><input className={inputCls} placeholder="pcs / meter / unit" value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
        <button disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), unit: unit.trim() })} className={`flex-1 px-4 py-2.5 text-sm ${btnPrimaryCls}`}>Simpan</button>
      </div>
    </Modal>
  );
}

function SparepartStockTable({ items, canManage, onAdd, onUpdate, onRemove, onOpenStockIn, onImportSpareparts }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = sortByName(query.trim()
    ? items.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : items);
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
        <div className="text-sm font-semibold text-slate-700">Stok Sparepart</div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Upload size={13} /> Import
          </button>
          <button onClick={() => setAddOpen(true)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs ${btnSecondaryCls}`}>
            <Plus size={13} /> Jenis Baru
          </button>
          <button onClick={onOpenStockIn} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs ${btnPrimaryCls}`}>
            <PackagePlus size={13} /> Barang Masuk
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">Kabel, konektor, baterai, dll untuk keperluan servis. Berkurang otomatis saat dipakai servis atau dipakai di invoice.</p>

      {items.length > 5 && (
        <div className="relative mb-2">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className={inputCls + " pl-8"} placeholder="Cari nama..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto mb-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
              <th className="p-3">Nama</th>
              <th className="p-3">Satuan</th>
              <th className="p-3 w-28">Stok</th>
              <th className="p-3 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-slate-50">
                <td className="p-3 whitespace-nowrap">{p.name}</td>
                <td className="p-3 text-slate-500 whitespace-nowrap">{p.unit || "-"}</td>
                <td className="p-3">
                  <span className={`font-medium ${p.qty <= 3 ? "text-amber-700" : "text-slate-700"}`}>{p.qty}</span>
                  {p.qty <= 3 && <div className="text-[10px] text-amber-600">Stok menipis</div>}
                </td>
                <td className="p-3 text-right">
                  {canManage && (
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditItem(p)} className="text-slate-300 hover:text-indigo-600 p-1" title="Edit nama/satuan"><Pencil size={13} /></button>
                      <button onClick={() => setDeleteItem(p)} className="text-slate-300 hover:text-red-500 p-1" title="Hapus"><X size={14} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-slate-400">{query ? "Tidak ada yang cocok." : "Belum ada data."}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <StockItemFormModal
          title="Jenis Baru — Sparepart"
          subtitle="Stok awal 0, isi lewat Barang Masuk setelah ini dibuat."
          initial={{ name: "", unit: "pcs" }}
          onClose={() => setAddOpen(false)}
          onSave={(v) => { onAdd({ name: v.name, unit: v.unit || "pcs", qty: 0 }); setAddOpen(false); }}
        />
      )}
      {editItem && (
        <StockItemFormModal
          title="Edit Sparepart"
          initial={{ name: editItem.name, unit: editItem.unit || "" }}
          onClose={() => setEditItem(null)}
          onSave={(v) => { onUpdate(editItem.id, { name: v.name, unit: v.unit || "pcs" }); setEditItem(null); }}
        />
      )}
      {deleteItem && (
        <Modal title="Hapus Jenis Ini?" onClose={() => setDeleteItem(null)}>
          <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-800 mb-4">
            <div className="font-medium">{deleteItem.name}</div>
            <div className="text-xs">Stok saat ini: {deleteItem.qty} {deleteItem.unit || ""}</div>
          </div>
          <p className="text-sm text-slate-600 mb-4">Riwayat untuk jenis ini tidak ikut terhapus, tapi jenis ini tidak akan muncul lagi di daftar.</p>
          <div className="flex gap-2">
            <button onClick={() => setDeleteItem(null)} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
            <button onClick={() => { onRemove(deleteItem.id); setDeleteItem(null); }} className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-red-600 text-white">Ya, Hapus</button>
          </div>
        </Modal>
      )}
      {showImport && (
        <ImportPasteModal
          title="Import Sparepart"
          description="Isi jenis sparepart & stok awal sekaligus banyak"
          columns={[{ key: "name", label: "Nama", required: true }, { key: "unit", label: "Satuan" }, { key: "qty", label: "Qty Awal" }]}
          sampleRow="Kabel UTP Cat6, meter, 100"
          onClose={() => setShowImport(false)}
          onImport={onImportSpareparts}
        />
      )}
    </div>
  );
}

function StockMovementHistoryPanel({ log, claims, canDelete, onDelete, onOpenTicket }) {
  const sorted = [...(log || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || ""));
  return (
    <div className="mb-6">
      <div className="text-sm font-semibold text-slate-700 mb-1">Riwayat Sparepart (Masuk & Keluar)</div>
      <p className="text-xs text-slate-500 mb-3">Setiap penambahan (Barang Masuk) maupun pengurangan (dipakai servis / invoice) tercatat di sini — yang keluar bisa diklik buat lihat tiketnya.{canDelete && " Entri masuk bisa dihapus kalau keinput dobel."}</p>
      <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-50 max-h-80 overflow-y-auto">
        {sorted.map((entry) => {
          const isMasuk = entry.type !== "keluar";
          const linkedClaims = isMasuk ? [] : (entry.claimIds || []).map((cid) => (claims || []).find((c) => c.id === cid)).filter(Boolean);
          return (
            <div key={entry.id} className="p-3 text-sm flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isMasuk ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{isMasuk ? "Masuk" : "Keluar"}</span>
                  <span className="text-xs text-slate-400">{fmtDate(entry.date)}{entry.note ? ` · ${entry.note}` : ""}</span>
                </div>
                <ul className="space-y-0.5">
                  {entry.items.map((it, i) => (
                    <li key={i} className="text-slate-700">{it.name} <span className={`font-medium ${isMasuk ? "text-emerald-600" : "text-red-600"}`}>{isMasuk ? "+" : "-"}{it.qty}</span></li>
                  ))}
                </ul>
                {linkedClaims.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {linkedClaims.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => onOpenTicket(c.id)}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium"
                      >
                        {c.customerName} — {c.brand} {c.produk}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {canDelete && isMasuk && (
                <button onClick={() => onDelete(entry.id)} className="text-slate-300 hover:text-red-500 shrink-0" title="Hapus (keinput dobel)"><X size={14} /></button>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && <div className="p-4 text-sm text-slate-400">Belum ada riwayat.</div>}
      </div>
    </div>
  );
}

function SparepartTab({ spareParts, sparepartStockLog, claims, role, onAddSparepart, onUpdateSparepart, onRemoveSparepart, onStockInSpareparts, onDeleteStockInEntry, onOpenTicket, onImportSpareparts }) {
  const [stockInOpen, setStockInOpen] = useState(false);
  const canManage = role === "pusat";
  return (
    <div>
      <SparepartStockTable
        items={spareParts}
        canManage={canManage}
        onAdd={onAddSparepart}
        onUpdate={onUpdateSparepart}
        onRemove={onRemoveSparepart}
        onOpenStockIn={() => setStockInOpen(true)}
        onImportSpareparts={onImportSpareparts}
      />
      <StockMovementHistoryPanel log={sparepartStockLog} claims={claims} canDelete={canManage} onDelete={onDeleteStockInEntry} onOpenTicket={onOpenTicket} />
      {!canManage && (
        <p className="text-xs text-slate-400 mb-6">Mode saat ini: Admin biasa. Hapus item/riwayat stok hanya bisa dilakukan Admin Pusat.</p>
      )}
      {stockInOpen && (
        <SparepartStockInModal
          spareParts={spareParts}
          onClose={() => setStockInOpen(false)}
          onConfirm={(tanggal, entries) => { onStockInSpareparts(tanggal, entries); setStockInOpen(false); }}
        />
      )}
    </div>
  );
}

function SparepartStockInModal({ spareParts, onClose, onConfirm }) {
  const [tanggal, setTanggal] = useState(todayStr());
  const [rows, setRows] = useState([{ id: uid(), partId: "", qty: "" }]);
  const [reviewing, setReviewing] = useState(false);

  const updateRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { id: uid(), partId: "", qty: "" }]);
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r.id !== id));
  const validRows = rows.filter((r) => r.partId && Number(r.qty) > 0);
  const canConfirm = validRows.length > 0;

  if (reviewing) {
    return (
      <Modal title="Konfirmasi Barang Masuk" subtitle="Cek dulu sebelum disimpan — stok akan langsung bertambah" onClose={onClose}>
        <div className="mb-4 text-sm text-slate-500">Tanggal: <span className="text-slate-800 font-medium">{fmtDate(tanggal)}</span></div>
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-50 mb-4">
          {validRows.map((r) => {
            const part = spareParts.find((p) => p.id === r.partId);
            return (
              <div key={r.id} className="flex items-center justify-between p-3 text-sm">
                <span>{part ? part.name : "-"}</span>
                <span className="text-emerald-600 font-medium">+{r.qty} {part ? part.unit : ""}</span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setReviewing(false)} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>← Kembali Edit</button>
          <button
            onClick={() => onConfirm(tanggal, validRows.map((r) => ({ partId: r.partId, qty: Number(r.qty) })))}
            className={`flex-1 px-4 py-2.5 text-sm ${btnPrimaryCls}`}
          >
            Ya, Simpan
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Barang Masuk — Sparepart" subtitle="Bisa catat beberapa sparepart sekaligus dalam satu kali input" onClose={onClose} wide>
      <Field label="Tanggal Masuk" className="mb-4">
        <input type="date" className={inputCls + " sm:w-56 min-w-0"} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
      </Field>

      <div className="space-y-2 mb-2">
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-6 gap-2 items-center">
            <select className={inputCls + " col-span-4"} value={r.partId} onChange={(e) => updateRow(r.id, { partId: e.target.value })}>
              <option value="">Pilih sparepart...</option>
              {sortByName(spareParts).map((p) => <option key={p.id} value={p.id}>{p.name} (stok: {p.qty} {p.unit})</option>)}
            </select>
            <input type="number" min="1" className={inputCls + " col-span-1"} placeholder="Qty" value={r.qty} onChange={(e) => updateRow(r.id, { qty: e.target.value })} />
            <button onClick={() => removeRow(r.id)} className="col-span-1 text-slate-400 hover:text-red-500 justify-self-center"><X size={14} /></button>
          </div>
        ))}
      </div>
      <button onClick={addRow} className="flex items-center gap-1.5 text-sm text-indigo-600 font-medium mb-4">
        <Plus size={14} /> Tambah Baris
      </button>

      <div className="flex gap-2 pt-4 border-t border-slate-100">
        <button onClick={onClose} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
        <button
          disabled={!canConfirm}
          onClick={() => setReviewing(true)}
          className={`flex-1 px-4 py-2.5 text-sm ${btnPrimaryCls}`}
        >
          Lanjut Konfirmasi
        </button>
      </div>
    </Modal>
  );
}

function InventarisTab({ claims, settings, spareParts, sparepartStockLog, role, isDesktopLayout, onAddSparepart, onUpdateSparepart, onRemoveSparepart, onStockInSpareparts, onDeleteStockInEntry, onGoToSupplierTab, onOpenTicket, onImportSpareparts }) {
  const [invTab, setInvTab] = useState("tertahan");
  return (
    <div>
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-full w-fit">
        <button onClick={() => setInvTab("tertahan")} className={`px-4 py-1.5 rounded-full text-sm font-medium ${invTab === "tertahan" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>
          Barang Tertahan
        </button>
        <button onClick={() => setInvTab("sparepart")} className={`px-4 py-1.5 rounded-full text-sm font-medium ${invTab === "sparepart" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>
          Sparepart
        </button>
      </div>
      {invTab === "tertahan" && (
        <BarangTertahanTab claims={claims} isDesktopLayout={isDesktopLayout} onGoToSupplierTab={onGoToSupplierTab} />
      )}
      {invTab === "sparepart" && (
        <SparepartTab
          spareParts={spareParts}
          sparepartStockLog={sparepartStockLog}
          claims={claims}
          role={role}
          onAddSparepart={onAddSparepart}
          onUpdateSparepart={onUpdateSparepart}
          onRemoveSparepart={onRemoveSparepart}
          onStockInSpareparts={onStockInSpareparts}
          onDeleteStockInEntry={onDeleteStockInEntry}
          onOpenTicket={onOpenTicket}
          onImportSpareparts={onImportSpareparts}
        />
      )}
    </div>
  );
}

// ---------- Kas Service ----------
const KAS_TABS = [
  ["masuk", "Uang Masuk (Cash)"],
  ["transfer", "Transfer"],
  ["setoran", "Setoran ke Atasan"],
  ["biayaSupplier", "Biaya ke Supplier"],
];
const KAS_PERIODS = [
  ["bulan", "Bulan Ini"],
  ["tahun", "Tahun Ini"],
  ["custom", "Custom"],
  ["semua", "Semua"],
];

function kasPeriodBounds(period) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  if (period.mode === "bulan") {
    const from = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const to = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastDay)}`;
    return { from, to };
  }
  if (period.mode === "tahun") {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  }
  if (period.mode === "custom") {
    return { from: period.from || "", to: period.to || "" };
  }
  return { from: "", to: "" };
}
function inKasPeriod(dateStr, bounds) {
  if (!dateStr) return false;
  if (bounds.from && dateStr < bounds.from) return false;
  if (bounds.to && dateStr > bounds.to) return false;
  return true;
}

function SetoranFormModal({ initial, onClose, onSave }) {
  const [tanggal, setTanggal] = useState(initial?.tanggal || todayStr());
  const [jumlah, setJumlah] = useState(initial?.jumlah ? String(initial.jumlah) : "");
  const [penyetor, setPenyetor] = useState(initial?.penyetor || "");
  const [catatan, setCatatan] = useState(initial?.catatan || "");
  const canSave = tanggal && Number(jumlah) > 0 && penyetor.trim();
  return (
    <Modal title={initial ? "Edit Setoran" : "Tambah Setoran ke Atasan"} onClose={onClose}>
      <div className="space-y-3 mb-5">
        <Field label="Tanggal"><input type="date" className={inputCls} value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></Field>
        <Field label="Jumlah"><input type="number" placeholder="0" className={inputCls} value={jumlah} onChange={(e) => setJumlah(e.target.value)} /></Field>
        <Field label="Disetor oleh"><input className={inputCls} value={penyetor} onChange={(e) => setPenyetor(e.target.value)} /></Field>
        <Field label="Catatan (opsional)"><input className={inputCls} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></Field>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
        <button
          disabled={!canSave}
          onClick={() => onSave({ tanggal, jumlah: Number(jumlah), penyetor: penyetor.trim(), catatan: catatan.trim() })}
          className={`flex-1 px-4 py-2.5 text-sm ${btnPrimaryCls}`}
        >
          Simpan
        </button>
      </div>
    </Modal>
  );
}

function KasPeriodPicker({ period, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(period);
  const activeLabel = KAS_PERIODS.find(([k]) => k === period.mode)?.[1] || "Bulan Ini";
  return (
    <div className="relative">
      <button onClick={() => { setDraft(period); setOpen((o) => !o); }} className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnSecondaryCls} whitespace-nowrap`}>
        <SlidersHorizontal size={14} /> {activeLabel}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-3xl shadow-lg z-40 p-3">
            <div className="grid grid-cols-2 gap-2 mb-2">
              {KAS_PERIODS.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDraft({ ...draft, mode: key })}
                  className={`px-2 py-1.5 rounded-full text-xs font-medium border ${draft.mode === key ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-300 text-slate-600"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {draft.mode === "custom" && (
              <div className="flex gap-2 mb-2">
                <input type="date" className={inputCls + " min-w-0"} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
                <input type="date" className={inputCls + " min-w-0"} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
              </div>
            )}
            <button onClick={() => { onChange(draft); setOpen(false); }} className={`w-full px-3 py-1.5 text-xs ${btnPrimaryCls}`}>Terapkan</button>
          </div>
        </>
      )}
    </div>
  );
}

function KasServiceTab({ claims, invoices, setoranList, role, isDesktopLayout, onAddSetoran, onUpdateSetoran, onRemoveSetoran, onToggleVerified, onUpdateMetodeBayar }) {
  const canManage = role === "pusat";
  const [kasTab, setKasTab] = useState("masuk");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState({ mode: "bulan", from: "", to: "" });
  const [setoranFormOpen, setSetoranFormOpen] = useState(false);
  const [editSetoran, setEditSetoran] = useState(null);
  const [deleteSetoranId, setDeleteSetoranId] = useState(null);
  const [editMetodeInvoiceId, setEditMetodeInvoiceId] = useState(null);
  const [confirmVerify, setConfirmVerify] = useState(null);

  const bounds = useMemo(() => kasPeriodBounds(period), [period]);
  const q = query.trim().toLowerCase();

  const totalMasukAll = invoices.filter((inv) => inv.metodeBayar === "Cash").reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
  const totalSetoranAll = setoranList.reduce((sum, s) => sum + (Number(s.jumlah) || 0), 0);
  const saldoKas = totalMasukAll - totalSetoranAll;

  const cashInvoices = useMemo(() => invoices
    .filter((inv) => inv.metodeBayar === "Cash" && inKasPeriod(inv.date, bounds))
    .filter((inv) => !q || `${inv.invoiceNo} ${inv.customerName}`.toLowerCase().includes(q))
    .slice().reverse().sort((a, b) => (b.date || "").localeCompare(a.date || "")), [invoices, bounds, q]);
  const transferInvoices = useMemo(() => invoices
    .filter((inv) => inv.metodeBayar === "Transfer" && inKasPeriod(inv.date, bounds))
    .filter((inv) => !q || `${inv.invoiceNo} ${inv.customerName}`.toLowerCase().includes(q))
    .slice().reverse().sort((a, b) => (b.date || "").localeCompare(a.date || "")), [invoices, bounds, q]);
  const supplierCosts = useMemo(() => claims
    .filter((c) => Number(c.biayaSupplier) > 0 && inKasPeriod(c.tanggalKembaliSupplier, bounds))
    .filter((c) => !q || `${c.customerName} ${c.brand} ${c.produk} ${c.supplier}`.toLowerCase().includes(q))
    .slice().reverse().sort((a, b) => (b.tanggalKembaliSupplier || "").localeCompare(a.tanggalKembaliSupplier || "")), [claims, bounds, q]);
  const sortedSetoran = useMemo(() => setoranList
    .filter((s) => inKasPeriod(s.tanggal, bounds))
    .filter((s) => !q || `${s.penyetor} ${s.catatan}`.toLowerCase().includes(q))
    .slice().reverse().sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || "")), [setoranList, bounds, q]);

  const periodMasuk = cashInvoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
  const periodSetoran = sortedSetoran.reduce((sum, s) => sum + (Number(s.jumlah) || 0), 0);
  const periodLabel = KAS_PERIODS.find(([k]) => k === period.mode)?.[1] || "Bulan Ini";

  const activeTabTotal =
    kasTab === "masuk" ? cashInvoices.reduce((s, inv) => s + (Number(inv.total) || 0), 0) :
    kasTab === "transfer" ? transferInvoices.reduce((s, inv) => s + (Number(inv.total) || 0), 0) :
    kasTab === "setoran" ? sortedSetoran.reduce((s, x) => s + (Number(x.jumlah) || 0), 0) :
    supplierCosts.reduce((s, c) => s + (Number(c.biayaSupplier) || 0), 0);

  return (
    <div>
      <div className="bg-white rounded-3xl border border-slate-200 p-5 mb-5">
        <PanelHeader icon={Wallet} title="Saldo Kas" description="Dihitung dari semua waktu — mewakili kas fisik yang ada sekarang" />
        <div className={`text-3xl font-bold ${saldoKas < 0 ? "text-red-600" : "text-slate-800"}`}>{rupiah(saldoKas)}</div>
        <div className="flex gap-4 mt-2 text-xs text-slate-500 flex-wrap">
          <span>Uang Masuk (Cash) — {periodLabel}: <span className="font-medium text-emerald-700">{rupiah(periodMasuk)}</span></span>
          <span>Setoran ke Atasan — {periodLabel}: <span className="font-medium text-slate-700">{rupiah(periodSetoran)}</span></span>
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-full overflow-x-auto">
        {KAS_TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setKasTab(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${kasTab === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 mb-3 text-sm">
        <span className="text-slate-500">Total {KAS_TABS.find(([k]) => k === kasTab)?.[1]} — {periodLabel}</span>
        <span className="font-semibold text-slate-800">{rupiah(activeTabTotal)}</span>
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari invoice, customer, penyetor..." className={inputCls + " pl-8"} />
        </div>
        <KasPeriodPicker period={period} onChange={setPeriod} />
      </div>

      {kasTab === "masuk" && (
        isDesktopLayout ? (
          <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
                  <th className="p-3">No Invoice</th><th className="p-3">Customer</th><th className="p-3">Tanggal</th><th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {cashInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50">
                    <td className="p-3 whitespace-nowrap font-medium text-slate-700">{inv.invoiceNo}</td>
                    <td className="p-3 whitespace-nowrap">{inv.customerName}</td>
                    <td className="p-3 whitespace-nowrap">{fmtDate(inv.date)}</td>
                    <td className="p-3 whitespace-nowrap text-right font-medium text-emerald-700">{rupiah(inv.total)}</td>
                  </tr>
                ))}
                {cashInvoices.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-400">Tidak ada data di periode ini.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100">
            {cashInvoices.map((inv) => (
              <div key={inv.id} className="p-3 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">{inv.invoiceNo}</div>
                  <div className="text-xs text-slate-400">{inv.customerName} · {fmtDate(inv.date)}</div>
                </div>
                <span className="shrink-0 font-medium text-emerald-700">{rupiah(inv.total)}</span>
              </div>
            ))}
            {cashInvoices.length === 0 && <div className="p-6 text-center text-slate-400 text-sm">Tidak ada data di periode ini.</div>}
          </div>
        )
      )}

      {kasTab === "transfer" && (
        isDesktopLayout ? (
          <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
                  <th className="p-3">No Invoice</th><th className="p-3">Customer</th><th className="p-3">Tanggal</th><th className="p-3 text-right">Total</th><th className="p-3">Verifikasi</th><th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {transferInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50">
                    <td className="p-3 whitespace-nowrap font-medium text-slate-700">{inv.invoiceNo}</td>
                    <td className="p-3 whitespace-nowrap">{inv.customerName}</td>
                    <td className="p-3 whitespace-nowrap">{fmtDate(inv.date)}</td>
                    <td className="p-3 whitespace-nowrap text-right font-medium text-indigo-700">{rupiah(inv.total)}</td>
                    <td className="p-3 whitespace-nowrap">
                      {inv.verified && role !== "pusat" ? (
                        <span className="text-[11px] px-2 py-1 rounded-full font-medium flex items-center gap-1 bg-emerald-100 text-emerald-700 w-fit">
                          <BadgeCheck size={11} /> Terverifikasi
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmVerify({ invoice: inv, action: inv.verified ? "unverify" : "verify" })}
                          className={`text-[11px] px-2 py-1 rounded-full font-medium flex items-center gap-1 ${inv.verified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                        >
                          <BadgeCheck size={11} /> {inv.verified ? "Terverifikasi" : "Belum"}
                        </button>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {canManage && (
                        <button onClick={() => setEditMetodeInvoiceId(inv.id)} className="text-slate-300 hover:text-indigo-600 p-1" title="Koreksi metode bayar"><Pencil size={13} /></button>
                      )}
                    </td>
                  </tr>
                ))}
                {transferInvoices.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-400">Tidak ada data di periode ini.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100">
            {transferInvoices.map((inv) => (
              <div key={inv.id} className="p-3 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">{inv.invoiceNo}</div>
                  <div className="text-xs text-slate-400">{inv.customerName} · {fmtDate(inv.date)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-medium text-indigo-700">{rupiah(inv.total)}</span>
                  {inv.verified && role !== "pusat" ? (
                    <span className="text-[11px] px-2 py-1 rounded-full font-medium flex items-center gap-1 bg-emerald-100 text-emerald-700">
                      <BadgeCheck size={11} /> Terverifikasi
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmVerify({ invoice: inv, action: inv.verified ? "unverify" : "verify" })}
                      className={`text-[11px] px-2 py-1 rounded-full font-medium flex items-center gap-1 ${inv.verified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                    >
                      <BadgeCheck size={11} /> {inv.verified ? "Terverifikasi" : "Belum Diverifikasi"}
                    </button>
                  )}
                  {canManage && (
                    <button onClick={() => setEditMetodeInvoiceId(inv.id)} className="text-slate-300 hover:text-indigo-600 p-1" title="Koreksi metode bayar"><Pencil size={13} /></button>
                  )}
                </div>
              </div>
            ))}
            {transferInvoices.length === 0 && <div className="p-6 text-center text-slate-400 text-sm">Tidak ada data di periode ini.</div>}
          </div>
        )
      )}

      {kasTab === "setoran" && (
        <div>
          <button onClick={() => setSetoranFormOpen(true)} className={`flex items-center gap-1.5 px-3 py-2 text-sm ${btnPrimaryCls} mb-3`}>
            <Plus size={14} /> Tambah Setoran
          </button>
          {isDesktopLayout ? (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
                    <th className="p-3">Tanggal</th><th className="p-3 text-right">Jumlah</th><th className="p-3">Disetor Oleh</th><th className="p-3">Catatan</th><th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSetoran.map((s) => (
                    <tr key={s.id} className="border-b border-slate-50">
                      <td className="p-3 whitespace-nowrap">{fmtDate(s.tanggal)}</td>
                      <td className="p-3 whitespace-nowrap text-right font-medium text-slate-700">{rupiah(s.jumlah)}</td>
                      <td className="p-3 whitespace-nowrap">{s.penyetor}</td>
                      <td className="p-3 max-w-[220px] truncate" title={s.catatan}>{s.catatan || "-"}</td>
                      <td className="p-3 whitespace-nowrap text-right">
                        {canManage && (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setEditSetoran(s)} className="text-slate-300 hover:text-indigo-600 p-1" title="Edit"><Pencil size={13} /></button>
                            <button onClick={() => setDeleteSetoranId(s.id)} className="text-slate-300 hover:text-red-500 p-1" title="Hapus"><X size={14} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {sortedSetoran.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">Tidak ada data di periode ini.</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100">
              {sortedSetoran.map((s) => (
                <div key={s.id} className="p-3 flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800">{rupiah(s.jumlah)}</div>
                    <div className="text-xs text-slate-400 truncate">{fmtDate(s.tanggal)} · disetor oleh {s.penyetor}{s.catatan ? ` · ${s.catatan}` : ""}</div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditSetoran(s)} className="text-slate-300 hover:text-indigo-600 p-1" title="Edit"><Pencil size={13} /></button>
                      <button onClick={() => setDeleteSetoranId(s.id)} className="text-slate-300 hover:text-red-500 p-1" title="Hapus"><X size={14} /></button>
                    </div>
                  )}
                </div>
              ))}
              {sortedSetoran.length === 0 && <div className="p-6 text-center text-slate-400 text-sm">Tidak ada data di periode ini.</div>}
            </div>
          )}
        </div>
      )}

      {kasTab === "biayaSupplier" && (
        isDesktopLayout ? (
          <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
                  <th className="p-3">Customer</th><th className="p-3">Brand / Produk</th><th className="p-3">Supplier</th><th className="p-3">Tgl Kembali</th><th className="p-3 text-right">Biaya</th>
                </tr>
              </thead>
              <tbody>
                {supplierCosts.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50">
                    <td className="p-3 whitespace-nowrap">{c.customerName}</td>
                    <td className="p-3 whitespace-nowrap">{c.brand} {c.produk}</td>
                    <td className="p-3 whitespace-nowrap">{c.supplier}</td>
                    <td className="p-3 whitespace-nowrap">{fmtDate(c.tanggalKembaliSupplier)}</td>
                    <td className="p-3 whitespace-nowrap text-right font-medium text-slate-700">{rupiah(c.biayaSupplier)}</td>
                  </tr>
                ))}
                {supplierCosts.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">Tidak ada data di periode ini.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-100">
            {supplierCosts.map((c) => (
              <div key={c.id} className="p-3 flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">{c.customerName} — {c.brand} {c.produk}</div>
                  <div className="text-xs text-slate-400 truncate">{c.supplier} · {fmtDate(c.tanggalKembaliSupplier)}</div>
                </div>
                <span className="shrink-0 font-medium text-slate-700">{rupiah(c.biayaSupplier)}</span>
              </div>
            ))}
            {supplierCosts.length === 0 && <div className="p-6 text-center text-slate-400 text-sm">Tidak ada data di periode ini.</div>}
          </div>
        )
      )}

      {setoranFormOpen && (
        <SetoranFormModal
          onClose={() => setSetoranFormOpen(false)}
          onSave={(entry) => { onAddSetoran(entry); setSetoranFormOpen(false); }}
        />
      )}
      {editSetoran && (
        <SetoranFormModal
          initial={editSetoran}
          onClose={() => setEditSetoran(null)}
          onSave={(patch) => { onUpdateSetoran(editSetoran.id, patch); setEditSetoran(null); }}
        />
      )}
      {deleteSetoranId && (
        <Modal title="Hapus Setoran Ini?" onClose={() => setDeleteSetoranId(null)}>
          <p className="text-sm text-slate-600 mb-4">Tindakan ini tidak bisa dibatalkan.</p>
          <div className="flex gap-2">
            <button onClick={() => setDeleteSetoranId(null)} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
            <button onClick={() => { onRemoveSetoran(deleteSetoranId); setDeleteSetoranId(null); }} className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-red-600 text-white">Ya, Hapus</button>
          </div>
        </Modal>
      )}
      {editMetodeInvoiceId && (
        <Modal title="Koreksi Metode Bayar" onClose={() => setEditMetodeInvoiceId(null)}>
          <p className="text-sm text-slate-600 mb-4">Pindahkan invoice ini ke tab yang benar.</p>
          <div className="flex gap-2 mb-5">
            <button onClick={() => { onUpdateMetodeBayar(editMetodeInvoiceId, "Cash"); setEditMetodeInvoiceId(null); }} className="flex-1 px-3 py-2.5 rounded-full text-sm font-medium border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">Cash</button>
            <button onClick={() => { onUpdateMetodeBayar(editMetodeInvoiceId, "Transfer"); setEditMetodeInvoiceId(null); }} className="flex-1 px-3 py-2.5 rounded-full text-sm font-medium border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100">Transfer</button>
          </div>
          <button onClick={() => setEditMetodeInvoiceId(null)} className={`w-full py-2 text-sm ${btnSecondaryCls}`}>Batal</button>
        </Modal>
      )}
      {confirmVerify && (
        <Modal title={confirmVerify.action === "verify" ? "Verifikasi Transfer Ini?" : "Batalkan Verifikasi?"} onClose={() => setConfirmVerify(null)}>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm mb-4">
            <div className="font-medium text-slate-800">{confirmVerify.invoice.invoiceNo}</div>
            <div className="text-xs text-slate-500">{confirmVerify.invoice.customerName} · {rupiah(confirmVerify.invoice.total)}</div>
          </div>
          {confirmVerify.action === "verify" ? (
            <p className="text-sm text-slate-600 mb-4">Pastikan mutasi transfernya udah beneran masuk ke rekening sebelum verifikasi. Setelah diverifikasi, status ini <strong>terkunci</strong> — Admin biasa nggak bisa batalin lagi, cuma Admin Pusat yang bisa.</p>
          ) : (
            <p className="text-sm text-slate-600 mb-4">Ini bakal ngebalikin status jadi "Belum Diverifikasi". Cuma dipakai kalau ternyata verifikasinya keliru.</p>
          )}
          <div className="flex gap-2">
            <button onClick={() => setConfirmVerify(null)} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
            <button
              onClick={() => { onToggleVerified(confirmVerify.invoice.id); setConfirmVerify(null); }}
              className={`flex-1 px-4 py-2.5 rounded-full text-sm font-medium ${confirmVerify.action === "verify" ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"}`}
            >
              {confirmVerify.action === "verify" ? "Ya, Verifikasi" : "Ya, Batalkan"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Data Master (dulu "Kelola Brand & Supplier") ----------
function ImportPasteModal({ title, description, columns, sampleRow, onClose, onImport }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function parseRows() {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.includes("\t") ? line.split("\t") : line.split(",");
        const obj = {};
        columns.forEach((col, i) => { obj[col.key] = (parts[i] || "").trim(); });
        return obj;
      });
  }

  const preview = text.trim() ? parseRows() : [];
  const validRows = preview.filter((r) => columns.every((c) => !c.required || r[c.key]));
  const invalidCount = preview.length - validRows.length;

  async function handleSubmit() {
    if (validRows.length === 0) { setError("Belum ada baris valid buat diimport."); return; }
    setSubmitting(true);
    setError("");
    try {
      await onImport(validRows);
      onClose();
    } catch (e) {
      setError(`Gagal menyimpan ke server: ${e?.message || "coba lagi."} Data belum tersimpan, pop-up ini sengaja tidak ditutup — cek koneksi lalu coba lagi.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={submitting ? undefined : onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="font-semibold text-slate-800">{title}</p>
            <p className="text-xs text-slate-400 mt-0.5">{description}</p>
          </div>
          <button onClick={onClose} disabled={submitting} className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-3">
          <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">
            <p className="font-medium text-slate-600 mb-1">
              Paste dari Excel/Sheets langsung bisa — satu baris satu data, kolom otomatis kebaca dari Tab.
              Kalau ngetik manual, pisahkan kolom pakai koma. Urutan kolom:
            </p>
            <p className="font-mono text-[11px]">
              {columns.map((c) => c.label + (c.required ? "*" : "")).join("  ,  ")}
            </p>
            {sampleRow && <p className="font-mono text-[11px] text-slate-400 mt-1">Contoh: {sampleRow}</p>}
            <p className="text-[10px] text-slate-400 mt-1">* wajib diisi, baris tanpa ini dilewati</p>
          </div>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setError(""); }}
            rows={8}
            disabled={submitting}
            placeholder="Paste data di sini, satu baris per data..."
            className="w-full rounded-xl border border-slate-200 p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50"
          />
          {text.trim() && !error && (
            <p className="text-xs text-slate-500">
              {validRows.length} baris siap diimport
              {invalidCount > 0 ? `, ${invalidCount} baris dilewati (data belum lengkap)` : ""}.
              Data yang namanya/SKU-nya sudah ada otomatis dilewati (gak dobel).
            </p>
          )}
          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-full text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-30">Batal</button>
          <button onClick={handleSubmit} disabled={submitting || validRows.length === 0} className="px-4 py-2 rounded-full text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? `Menyimpan ${validRows.length} data...` : `Import${validRows.length > 0 ? ` (${validRows.length})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function DataMasterTab({ settings, onSave, claims, batches, role, onAddProduct, onUpdateProduct, onRemoveProduct, onAddCustomer, onUpdateCustomer, onRemoveCustomer, onImportProducts, onImportCustomers, onAddSupplier, onUpdateSupplier, onRemoveSupplier, onImportSuppliers }) {
  const [newBrand, setNewBrand] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const canManage = role === "pusat";

  const addBrand = () => { if (newBrand.trim()) { onSave({ ...settings, brands: [...settings.brands, newBrand.trim()] }); setNewBrand(""); } };

  function requestRemoveBrand(b) {
    if (!canManage) return;
    const count = claims.filter((c) => c.brand === b).length;
    setConfirmDelete({ type: "brand", name: b, blocked: count > 0, count });
  }
  function confirmRemove() {
    if (!canManage || !confirmDelete || confirmDelete.blocked) return;
    onSave({ ...settings, brands: settings.brands.filter((x) => x !== confirmDelete.name) });
    setConfirmDelete(null);
  }

  return (
    <div className="max-w-2xl">
      {!canManage && (
        <div className="mb-4 p-3 rounded-2xl bg-slate-100 text-xs text-slate-500">
          Anda masuk sebagai Admin Cabang — hapus Brand/Supplier/Produk cuma bisa dilakukan Super Admin. Data Customer boleh ditambah & diedit, hapus tetap khusus Super Admin.
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 p-5 mb-4">
        <div className="text-sm font-semibold text-slate-700 mb-3">Brand</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {settings.brands.map((b) => (
            <span key={b} className="flex items-center gap-1 bg-slate-100 rounded-full pl-3 pr-1 py-1 text-sm">
              {b}
              {canManage && (
                <button onClick={() => requestRemoveBrand(b)} className="text-slate-400 hover:text-red-500"><X size={12} /></button>
              )}
            </span>
          ))}
          {settings.brands.length === 0 && <span className="text-sm text-slate-400">Belum ada brand.</span>}
        </div>
        {confirmDelete?.type === "brand" && (
          <div className={`mb-3 p-3 rounded-xl border text-sm space-y-2 ${confirmDelete.blocked ? "bg-red-50 border-red-100 text-red-800" : "bg-amber-50 border-amber-100 text-amber-900"}`}>
            {confirmDelete.blocked ? (
              <p>"{confirmDelete.name}" masih dipakai di {confirmDelete.count} data claim — tidak bisa dihapus.</p>
            ) : (
              <>
                <p>Hapus brand "{confirmDelete.name}"?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(null)} className="flex-1 px-3 py-1.5 rounded-full border border-slate-300 text-sm text-slate-600 bg-white">Batal</button>
                  <button onClick={confirmRemove} className="flex-1 px-3 py-1.5 rounded-full bg-red-600 text-white text-sm font-medium">Ya, Hapus</button>
                </div>
              </>
            )}
            {confirmDelete.blocked && (
              <button onClick={() => setConfirmDelete(null)} className="text-xs text-red-700 underline">Tutup</button>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <input className={inputCls} value={newBrand} onChange={(e) => setNewBrand(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addBrand()} placeholder="Tambah brand..." />
          <button onClick={addBrand} className={`px-4 text-sm ${btnPrimaryCls}`}>Tambah</button>
        </div>
      </div>

      <SupplierSettingsPanel settings={settings} claims={claims} batches={batches} role={role} onAddSupplier={onAddSupplier} onUpdateSupplier={onUpdateSupplier} onRemoveSupplier={onRemoveSupplier} onImportSuppliers={onImportSuppliers} />
      <ProdukSettingsPanel settings={settings} claims={claims} role={role} onAddProduct={onAddProduct} onUpdateProduct={onUpdateProduct} onRemoveProduct={onRemoveProduct} onImportProducts={onImportProducts} />
      <CustomerSettingsPanel settings={settings} claims={claims} role={role} onAddCustomer={onAddCustomer} onUpdateCustomer={onUpdateCustomer} onRemoveCustomer={onRemoveCustomer} onImportCustomers={onImportCustomers} />
    </div>
  );
}

function SupplierSettingsPanel({ settings, claims, batches, role, onAddSupplier, onUpdateSupplier, onRemoveSupplier, onImportSuppliers }) {
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const canManage = role === "pusat";
  const list = settings.supplierDetails || [];
  const filtered = sortByName(query.trim()
    ? list.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()) || (s.phone || "").includes(query.trim()))
    : list);

  function requestRemove(s) {
    if (!canManage) return;
    const count = claims.filter((c) => c.supplier === s.name).length + batches.filter((bt) => bt.supplier === s.name).length;
    setConfirmDelete({ id: s.id, name: s.name, blocked: count > 0, count });
  }
  function confirmRemove() {
    if (!canManage || !confirmDelete || confirmDelete.blocked) return;
    onRemoveSupplier(confirmDelete.id);
    setConfirmDelete(null);
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-5 mb-4">
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="text-sm font-semibold text-slate-700">Supplier</div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400">{list.length} supplier</span>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Upload size={13} /> Import
          </button>
          <button onClick={() => setAddOpen(true)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs ${btnPrimaryCls}`}>
            <Plus size={13} /> Tambah Supplier
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">Nama, No Telepon, dan Alamat supplier — dipakai di "Proses ke Supplier" &amp; laporan Data Master.</p>

      {list.length > 5 && (
        <div className="relative mb-2">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className={inputCls + " pl-8"} placeholder="Cari nama atau no telepon..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      <div className="space-y-2 mb-1">
        {filtered.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{s.name}</p>
              <p className="text-xs text-slate-400 truncate">{s.phone || "-"}{s.address ? ` · ${s.address}` : ""}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setEditSupplier(s)} className="text-slate-400 hover:text-indigo-600 p-1"><Pencil size={13} /></button>
              {canManage && (
                <button onClick={() => requestRemove(s)} className="text-slate-400 hover:text-red-500 p-1"><X size={14} /></button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-slate-400 py-2">Belum ada supplier.</p>}
      </div>

      {(addOpen || editSupplier) && (
        <SupplierFormModal
          title={editSupplier ? "Edit Supplier" : "Tambah Supplier"}
          initial={editSupplier || {}}
          onClose={() => { setAddOpen(false); setEditSupplier(null); }}
          onSave={(v) => {
            if (editSupplier) onUpdateSupplier(editSupplier.id, v);
            else onAddSupplier(v);
            setAddOpen(false); setEditSupplier(null);
          }}
        />
      )}
      {confirmDelete && (
        <Modal title="Hapus Supplier Ini?" onClose={() => setConfirmDelete(null)}>
          {confirmDelete.blocked ? (
            <>
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-800 mb-4">
                "{confirmDelete.name}" masih dipakai di {confirmDelete.count} data (claim/pengiriman) — tidak bisa dihapus.
              </div>
              <button onClick={() => setConfirmDelete(null)} className={`w-full py-2.5 text-sm ${btnPrimaryCls}`}>Tutup</button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 mb-4">Hapus supplier "{confirmDelete.name}"? Tindakan ini tidak bisa dibatalkan.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(null)} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
                <button onClick={confirmRemove} className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-red-600 text-white">Ya, Hapus</button>
              </div>
            </>
          )}
        </Modal>
      )}
      {showImport && (
        <ImportPasteModal
          title="Import Supplier"
          description="Isi daftar supplier sekaligus banyak"
          columns={[{ key: "name", label: "Nama", required: true }, { key: "phone", label: "No Telepon" }, { key: "address", label: "Alamat" }]}
          sampleRow="DAHUA SERVICE CENTER, 0858-8175-7061, Jakarta"
          onClose={() => setShowImport(false)}
          onImport={onImportSuppliers}
        />
      )}
    </div>
  );
}

function SupplierFormModal({ title, initial, onClose, onSave }) {
  const [name, setName] = useState(initial.name || "");
  const [phone, setPhone] = useState(initial.phone || "");
  const [address, setAddress] = useState(initial.address || "");
  const canSave = name.trim();
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3 mb-2">
        <Field label="Nama Supplier"><input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="No Telepon"><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Alamat"><input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={onClose} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
        <button disabled={!canSave} onClick={() => onSave({ name: name.trim(), phone: phone.trim(), address: address.trim() })} className={`flex-1 px-4 py-2.5 text-sm ${btnPrimaryCls}`}>Simpan</button>
      </div>
    </Modal>
  );
}

function ProdukSettingsPanel({ settings, claims, role, onAddProduct, onUpdateProduct, onRemoveProduct, onImportProducts }) {
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const canManage = role === "pusat";
  const list = settings.products || [];
  const filtered = sortByName(query.trim()
    ? list.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()) || (p.sku || "").toLowerCase().includes(query.trim().toLowerCase()))
    : list).slice(0, 200);

  function skuOrNameTaken(name, sku, excludeId) {
    const n = name.trim().toLowerCase();
    const s = sku.trim().toLowerCase();
    return list.some((p) => p.id !== excludeId && (p.name.trim().toLowerCase() === n || (s && (p.sku || "").trim().toLowerCase() === s)));
  }

  function requestRemoveProduk(p) {
    if (!canManage) return;
    const count = claims.filter((c) => c.produk === p.name || (p.sku && c.produkSku === p.sku)).length;
    setConfirmDelete({ id: p.id, name: p.name, blocked: count > 0, count });
  }
  function confirmRemoveProduk() {
    if (!canManage || !confirmDelete || confirmDelete.blocked) return;
    onRemoveProduct(confirmDelete.id);
    setConfirmDelete(null);
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-5 mt-4">
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="text-sm font-semibold text-slate-700">Daftar Produk</div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400">{list.length} produk</span>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Upload size={13} /> Import
          </button>
          <button onClick={() => setAddOpen(true)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs ${btnPrimaryCls}`}>
            <Plus size={13} /> Tambah Produk
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Tiap produk WAJIB punya <strong>SKU</strong> (kode baku, format [BRAND]-[TIPE]-[VARIASI]) dan <strong>Nama</strong> (label yang ditampilkan). Dipakai di field "Produk / Model" saat input claim.
        {canManage ? " Salah ketik SKU? Tekan ikon pensil di baris produknya untuk perbaiki." : " Koreksi SKU yang salah ketik hanya bisa dilakukan Admin Pusat."}
      </p>
      <div className="relative mb-2">
        <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
        <input className={inputCls + " pl-8"} placeholder="Cari nama atau SKU..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="border border-slate-100 rounded-2xl divide-y divide-slate-50 max-h-72 overflow-y-auto">
        {filtered.map((p) => (
          <div key={p.id} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="truncate">{p.name}</span>
              <span className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded ${p.sku ? "bg-slate-100 text-slate-500" : "bg-red-100 text-red-600"}`}>
                {p.sku || "SKU KOSONG"}
              </span>
            </div>
            {canManage && (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditProduct(p)} className="text-slate-400 hover:text-indigo-600 p-1" title="Edit SKU/Nama"><Pencil size={14} /></button>
                <button onClick={() => requestRemoveProduk(p)} className="text-slate-300 hover:text-red-500 p-1" title="Hapus"><X size={14} /></button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <div className="px-3 py-6 text-sm text-slate-400 text-center">{query ? "Tidak ada produk yang cocok." : "Belum ada produk."}</div>}
        {list.length > 200 && !query && <div className="px-3 py-2 text-xs text-slate-400 text-center">Menampilkan 200 dari {list.length} — ketik untuk mencari yang lain.</div>}
      </div>

      {addOpen && (
        <ProductFormModal
          title="Tambah Produk"
          initial={{ name: "", sku: "" }}
          isTaken={(name, sku) => skuOrNameTaken(name, sku, null)}
          onClose={() => setAddOpen(false)}
          onSave={(v) => { onAddProduct(v.name, v.sku); setAddOpen(false); }}
        />
      )}
      {editProduct && (
        <ProductFormModal
          title="Edit Produk"
          initial={{ name: editProduct.name, sku: editProduct.sku || "" }}
          isTaken={(name, sku) => skuOrNameTaken(name, sku, editProduct.id)}
          onClose={() => setEditProduct(null)}
          onSave={(v) => { onUpdateProduct(editProduct.id, { name: v.name, sku: v.sku }); setEditProduct(null); }}
        />
      )}
      {confirmDelete && (
        <Modal title="Hapus Produk Ini?" onClose={() => setConfirmDelete(null)}>
          {confirmDelete.blocked ? (
            <>
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-800 mb-4">
                "{confirmDelete.name}" masih dipakai di {confirmDelete.count} data claim — tidak bisa dihapus.
              </div>
              <button onClick={() => setConfirmDelete(null)} className={`w-full py-2.5 text-sm ${btnPrimaryCls}`}>Tutup</button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 mb-4">Hapus produk "{confirmDelete.name}"? Tindakan ini tidak bisa dibatalkan.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(null)} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
                <button onClick={confirmRemoveProduk} className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-red-600 text-white">Ya, Hapus</button>
              </div>
            </>
          )}
        </Modal>
      )}
      {showImport && (
        <ImportPasteModal
          title="Import Produk"
          description="Isi katalog produk sekaligus banyak"
          columns={[{ key: "sku", label: "SKU", required: true }, { key: "name", label: "Nama Produk", required: true }]}
          sampleRow="HIK-DVR-4CH, DVR Hikvision 4 Channel"
          onClose={() => setShowImport(false)}
          onImport={onImportProducts}
        />
      )}
    </div>
  );
}

function ProductFormModal({ title, initial, isTaken, onClose, onSave }) {
  const [name, setName] = useState(initial.name || "");
  const [sku, setSku] = useState(initial.sku || "");
  const taken = (name.trim() || sku.trim()) && isTaken(name, sku);
  const canSave = name.trim() && sku.trim() && !taken;
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3 mb-2">
        <Field label="Nama Produk"><input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="SKU (wajib)"><input className={inputCls + " font-mono"} placeholder="BRAND-TIPE-VARIASI" value={sku} onChange={(e) => setSku(e.target.value)} /></Field>
      </div>
      {taken && <p className="text-[11px] text-red-600 mb-3">Nama atau SKU ini sudah dipakai produk lain.</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={onClose} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
        <button disabled={!canSave} onClick={() => onSave({ name: name.trim(), sku: sku.trim() })} className={`flex-1 px-4 py-2.5 text-sm ${btnPrimaryCls}`}>Simpan</button>
      </div>
    </Modal>
  );
}

function CustomerSettingsPanel({ settings, claims, role, onAddCustomer, onUpdateCustomer, onRemoveCustomer, onImportCustomers }) {
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const canDelete = role === "pusat";
  const list = settings.customers || [];
  const filtered = query.trim()
    ? list.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()) || (c.phone || "").includes(query.trim()))
    : list;

  function requestRemove(c) {
    if (!canDelete) return;
    const count = claims.filter((cl) => cl.customerPhone === c.phone || cl.customerName.toLowerCase() === c.name.toLowerCase()).length;
    setConfirmDelete({ id: c.id, name: c.name, blocked: count > 0, count });
  }
  function confirmRemove() {
    if (!canDelete || !confirmDelete || confirmDelete.blocked) return;
    onRemoveCustomer(confirmDelete.id);
    setConfirmDelete(null);
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-5 mt-4">
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="text-sm font-semibold text-slate-700">Daftar Customer</div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400">{list.length} customer</span>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Upload size={13} /> Import
          </button>
          <button onClick={() => setAddOpen(true)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs ${btnPrimaryCls}`}>
            <Plus size={13} /> Tambah Customer
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Dipakai buat autocomplete pas isi Nama Customer di Barang Masuk — sekali tersimpan, nggak perlu ketik ulang no HP tiap kali customer yang sama datang lagi. Admin cabang boleh nambah & edit; hapus khusus Admin Pusat.
      </p>
      <div className="relative mb-2">
        <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
        <input className={inputCls + " pl-8"} placeholder="Cari nama atau no HP..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="border border-slate-100 rounded-2xl divide-y divide-slate-50 max-h-72 overflow-y-auto">
        {filtered.map((c) => (
          <div key={c.id} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium text-slate-700">{c.name}</div>
              <div className="text-xs text-slate-400 font-mono">{c.phone || "-"}{c.alamat ? ` · ${c.alamat}` : ""}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setEditCustomer(c)} className="text-slate-400 hover:text-indigo-600 p-1" title="Edit"><Pencil size={14} /></button>
              {canDelete && (
                <button onClick={() => requestRemove(c)} className="text-slate-300 hover:text-red-500 p-1" title="Hapus"><X size={14} /></button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="px-3 py-6 text-sm text-slate-400 text-center">{query ? "Tidak ada customer yang cocok." : "Belum ada data customer."}</div>}
      </div>

      {addOpen && (
        <CustomerFormModal title="Tambah Customer" initial={{ name: "", phone: "", alamat: "" }} onClose={() => setAddOpen(false)} onSave={(v) => { onAddCustomer(v); setAddOpen(false); }} />
      )}
      {editCustomer && (
        <CustomerFormModal title="Edit Customer" initial={editCustomer} onClose={() => setEditCustomer(null)} onSave={(v) => { onUpdateCustomer(editCustomer.id, v); setEditCustomer(null); }} />
      )}
      {confirmDelete && (
        <Modal title="Hapus Customer Ini?" onClose={() => setConfirmDelete(null)}>
          {confirmDelete.blocked ? (
            <>
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-800 mb-4">
                "{confirmDelete.name}" masih tercatat di {confirmDelete.count} riwayat klaim — data ini boleh dihapus tapi riwayat klaim lama tidak akan berubah.
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(null)} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
                <button onClick={() => { onRemoveCustomer(confirmDelete.id); setConfirmDelete(null); }} className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-red-600 text-white">Ya, Hapus</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 mb-4">Hapus customer "{confirmDelete.name}"?</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(null)} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
                <button onClick={confirmRemove} className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-red-600 text-white">Ya, Hapus</button>
              </div>
            </>
          )}
        </Modal>
      )}
      {showImport && (
        <ImportPasteModal
          title="Import Customer"
          description="Isi daftar customer sekaligus banyak"
          columns={[{ key: "name", label: "Nama", required: true }, { key: "phone", label: "No HP" }, { key: "alamat", label: "Alamat" }]}
          sampleRow="Budi Santoso, 081234567890, Jl. Merdeka No.1"
          onClose={() => setShowImport(false)}
          onImport={onImportCustomers}
        />
      )}
    </div>
  );
}

function CustomerFormModal({ title, initial, onClose, onSave }) {
  const [name, setName] = useState(initial.name || "");
  const [phone, setPhone] = useState(initial.phone || "");
  const [alamat, setAlamat] = useState(initial.alamat || "");
  const canSave = name.trim();
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3 mb-2">
        <Field label="Nama"><input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="No HP"><input type="tel" inputMode="numeric" className={inputCls} value={phone} onChange={(e) => setPhone(digitsOnly(e.target.value))} /></Field>
        <Field label="Alamat (opsional, buat kirim balik barang)"><input className={inputCls} value={alamat} onChange={(e) => setAlamat(e.target.value)} /></Field>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={onClose} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
        <button disabled={!canSave} onClick={() => onSave({ name: name.trim(), phone: phone.trim(), alamat: alamat.trim() })} className={`flex-1 px-4 py-2.5 text-sm ${btnPrimaryCls}`}>Simpan</button>
      </div>
    </Modal>
  );
}

// ---------- Customer tracking page (public, read-only) ----------
function customerStatusText(c) {
  if (c.status === "Selesai" || c.status === "Siap Diambil") {
    if (c.hasilSupplier === "Diganti Unit Baru") return c.status === "Selesai" ? "Sudah diambil (unit diganti baru)" : "Unit pengganti baru siap diambil di toko";
    if (c.hasilSupplier === "Diservis") return c.status === "Selesai" ? "Sudah diambil (selesai diservis)" : "Sudah selesai diservis, siap diambil di toko";
    return c.status === "Selesai" ? "Sudah diambil" : "Unit siap diambil di toko";
  }
  if (c.status === "Di Supplier") return "Sedang diproses di service center";
  return "Barang diterima, menunggu diproses";
}
function customerStepIndex(c) {
  if (c.status === "Di Supplier") return 1;
  if (c.status === "Siap Diambil" || c.status === "Selesai") return 2;
  return 0;
}
function CustomerStepper({ step }) {
  const labels = ["Diterima", "Diproses", "Siap Diambil"];
  return (
    <div className="flex items-center">
      {labels.map((l, i) => (
        <React.Fragment key={l}>
          <div className="flex flex-col items-center">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
              i <= step ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-400"
            }`}>{i + 1}</div>
            <span className={`text-[11px] mt-1 ${i <= step ? "text-slate-700 font-medium" : "text-slate-400"}`}>{l}</span>
          </div>
          {i < 2 && <div className={`h-0.5 flex-1 mx-1 mb-4 ${i < step ? "bg-indigo-600" : "bg-slate-200"}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}
function CustomerTrackPage({ claims, initialPhone }) {
  const [phone, setPhone] = useState(initialPhone);
  const [searched, setSearched] = useState(!!initialPhone);
  const matches = useMemo(
    () => claims.filter((c) => phone.trim() && digitsOnly(c.customerPhone) === digitsOnly(phone)),
    [claims, phone]
  );

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center py-8 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-lg font-semibold text-slate-800">Cek Status Servis / Garansi</h1>
          <p className="text-sm text-slate-500">Masukkan nomor HP yang digunakan saat menyerahkan barang.</p>
        </div>

        <div className="flex gap-2 mb-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && digitsOnly(phone).length >= 9 && setSearched(true)}
            placeholder="08xxxxxxxxxx"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            disabled={digitsOnly(phone).length < 9}
            onClick={() => setSearched(true)}
            className={`px-4 py-2.5 text-sm flex items-center gap-1.5 ${btnPrimaryCls}`}
          >
            <Search size={14} /> Cek
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-6">Masukkan nomor HP lengkap — bukan sebagian, supaya data orang lain tidak bisa ikut kebuka.</p>

        {searched && matches.length === 0 && (
          <div className="text-center text-sm text-slate-400 bg-white border border-slate-200 rounded-3xl p-6">
            <PhoneCall className="mx-auto mb-2 text-slate-300" size={22} />
            Nomor tidak ditemukan. Pastikan nomor HP sesuai dengan yang didaftarkan saat menyerahkan barang.
          </div>
        )}

        <div className="space-y-3">
          {matches.map((c) => {
            const step = customerStepIndex(c);
            return (
              <div key={c.id} className="bg-white border border-slate-200 rounded-3xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-medium text-slate-800">{c.brand} {c.produk}</div>
                    <div className="text-xs text-slate-400 font-mono">SN: {c.snDiterima}</div>
                  </div>
                  <span className="text-xs text-slate-400">{fmtDate(c.tanggalTerima)}</span>
                </div>
                <CustomerStepper step={step} />
                <div className="text-sm text-slate-700 mt-3 font-medium">{customerStatusText(c)}</div>
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <div>Garansi: <span className="text-slate-700">{c.garansi}</span></div>
                  <div>Kelengkapan: <span className="text-slate-700">{c.kelengkapan || "-"}</span></div>
                </div>
                {Number(c.biayaToko) > 0 ? (
                  <div className="text-xs text-slate-500 mt-1">Biaya servis: {rupiah(c.biayaToko)} (dibayar saat pengambilan)</div>
                ) : null}
                {c.tanggalAmbilCustomer && (
                  <div className="text-xs text-emerald-600 mt-1">Diambil pada {fmtDate(c.tanggalAmbilCustomer)}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- Print modal shell (dipakai bareng oleh 4 jenis cetakan: tanda
// terima masuk, tanda terima pengambilan, surat jalan, invoice) supaya
// wrapper/tombol Tutup+Cetak nggak diduplikasi 4x. Isi tiap cetakan tetap unik
// lewat children, cuma bungkusnya yang digabung. ----------
function PrintModalShell({ onClose, children }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-start sm:items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full my-4">
        <div className="print-area p-8">{children}</div>
        <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className={`px-4 py-2 text-sm ${btnSecondaryCls} border-none`}>Tutup</button>
          <button onClick={() => window.print()} className={`flex items-center gap-1.5 px-4 py-2 text-sm ${btnPrimaryCls}`}>
            <Printer size={14} /> Cetak / Simpan PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function SignatureFooter({ leftLabel, rightLabel }) {
  return (
    <div className="flex justify-between text-sm mt-10">
      <div className="text-center">
        <div className="border-t border-slate-400 pt-1 mt-10 w-32">{leftLabel}</div>
      </div>
      <div className="text-center">
        <div className="border-t border-slate-400 pt-1 mt-10 w-32">{rightLabel}</div>
      </div>
    </div>
  );
}

function PrintReceipt({ items, onClose }) {
  const customerName = items[0]?.customerName;
  const customerPhone = items[0]?.customerPhone;
  const date = items[0]?.tanggalTerima;

  return (
    <PrintModalShell onClose={onClose}>
      <h2 className="text-lg font-bold text-center mb-1">TANDA TERIMA BARANG SERVIS</h2>
      <p className="text-center text-xs text-slate-500 mb-6">Tanggal: {fmtDate(date)}</p>
      <div className="text-sm mb-4">
        <div><strong>Nama:</strong> {customerName}</div>
        <div><strong>No HP:</strong> {customerPhone}</div>
      </div>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="border-b border-slate-300 text-left">
            <th className="py-1 pr-2">Brand / Produk</th>
            <th className="py-1 pr-2">SN</th>
            <th className="py-1 pr-2">Kelengkapan</th>
            <th className="py-1">Keluhan / Catatan</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-b border-slate-100">
              <td className="py-1 pr-2">{c.brand} {c.produk}</td>
              <td className="py-1 pr-2 font-mono text-xs">{c.snDiterima}</td>
              <td className="py-1 pr-2">{c.kelengkapan || "-"}</td>
              <td className="py-1">{c.catatan || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 mb-10">Barang di atas diterima dalam kondisi seperti tercatat, untuk keperluan proses servis/garansi.</p>
      <SignatureFooter leftLabel="Customer" rightLabel="Toko" />
    </PrintModalShell>
  );
}

function PrintSuratJalanReceipt({ batch, items, onClose }) {
  return (
    <PrintModalShell onClose={onClose}>
      <h2 className="text-lg font-bold text-center mb-1">SURAT JALAN KE SUPPLIER</h2>
      <p className="text-center text-xs text-slate-500 mb-6">{batch.kodeBatch}</p>
      <div className="text-sm mb-4">
        <div><strong>Supplier:</strong> {batch.supplier}</div>
        <div><strong>Tanggal Kirim:</strong> {fmtDate(batch.tanggalKirim)}</div>
      </div>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="border-b border-slate-300 text-left">
            <th className="py-1 pr-2">Brand / Produk</th>
            <th className="py-1 pr-2">SN</th>
            <th className="py-1 pr-2">Customer</th>
            <th className="py-1">Jenis</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-b border-slate-100">
              <td className="py-1 pr-2">{c.brand} {c.produk}</td>
              <td className="py-1 pr-2 font-mono text-xs">{c.snDiterima}</td>
              <td className="py-1 pr-2">{c.customerName}</td>
              <td className="py-1">{c.jenis === "Ganti Baru" ? "Klaim Balik" : "Servis"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 mb-10">Barang di atas diserahkan ke supplier sesuai daftar. Foto resi/tanda terima ditambahkan setelah pengiriman lewat menu "⋮" pada detail pengiriman ini.</p>
      <SignatureFooter leftLabel="Toko" rightLabel="Supplier" />
    </PrintModalShell>
  );
}

function PickupReceipt({ items, onClose }) {
  const customerName = items[0]?.customerName;
  const customerPhone = items[0]?.customerPhone;
  // Kolom "Penanganan" cuma menampilkan jenis (Ganti Baru / Servis) — tanpa
  // embel-embel sumber penyelesaian internal (mis. "Stok Toko"/"Supplier"),
  // karena itu detail proses toko yang nggak perlu diketahui customer.
  const penangananLabel = (c) => (c.jenis === "Ganti Baru" ? "Ganti Baru" : c.jenis === "Servis" ? "Servis" : (c.jenis || "-"));
  return (
    <PrintModalShell onClose={onClose}>
      <h2 className="text-lg font-bold text-center mb-1">TANDA TERIMA PENGAMBILAN BARANG</h2>
      <p className="text-center text-xs text-slate-500 mb-6">Tanggal: {fmtDate(todayStr())}</p>
      <div className="text-sm mb-4">
        <div><strong>Nama:</strong> {customerName}</div>
        <div><strong>No HP:</strong> {customerPhone}</div>
      </div>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="border-b border-slate-300 text-left">
            <th className="py-1 pr-2">Brand / Produk</th>
            <th className="py-1 pr-2">SN Diterima</th>
            <th className="py-1 pr-2">Penanganan</th>
            <th className="py-1">SN Pengganti</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} className="border-b border-slate-100">
              <td className="py-1 pr-2">{c.brand} {c.produk}</td>
              <td className="py-1 pr-2 font-mono text-xs">{c.snDiterima}</td>
              <td className="py-1 pr-2">{penangananLabel(c)}</td>
              <td className="py-1 font-mono text-xs">{c.snPenggantiStock || c.snPenggantiSupplier || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 mb-10">Barang di atas telah diperiksa dan diterima kembali oleh customer dalam keadaan baik, sesuai penanganan yang tercatat.</p>
      <SignatureFooter leftLabel="Customer" rightLabel="Toko" />
    </PrintModalShell>
  );
}

function UploadTandaTerimaModal({ items, onClose, onUpload }) {
  const existing = items[0]?.fotoTandaTerimaCustomer;
  const [preview, setPreview] = useState(existing || null);
  const [uploading, setUploading] = useState(false);
  const fotoRef = useRef();

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const dataUrl = await compressImage(file);
    setPreview(dataUrl);
    setUploading(false);
  }

  return (
    <Modal title="Upload Foto Tanda Terima" subtitle="Foto kertas tanda terima yang sudah ditandatangani customer" onClose={onClose}>
      <div className="space-y-3">
        {preview ? (
          <img src={preview} className="w-full rounded-xl border border-slate-200" />
        ) : (
          <div className="w-full h-40 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-slate-300">
            <ImageOff size={28} />
          </div>
        )}
        <button type="button" onClick={() => fotoRef.current.click()} className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:border-indigo-400">
          <Camera size={14} /> {uploading ? "Mengunggah..." : preview ? "Ganti Foto" : "Ambil / Pilih Foto"}
        </button>
        <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      <div className="flex gap-2 mt-6 pt-4 border-t border-slate-100">
        <button onClick={onClose} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
        <button
          disabled={!preview}
          onClick={() => onUpload(items.map((c) => c.id), preview)}
          className={`flex-1 px-4 py-2.5 text-sm ${btnPrimaryCls}`}
        >
          Simpan Foto
        </button>
      </div>
    </Modal>
  );
}

function UploadBatchDocModal({ target, onClose, onUpload }) {
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fotoRef = useRef();
  if (!target) return null;

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const dataUrl = await compressImage(file);
    setPreview(dataUrl);
    setUploading(false);
  }

  return (
    <Modal title={`Upload ${target.label}`} subtitle={target.kodeBatch} onClose={onClose}>
      <div className="space-y-3">
        {preview ? (
          <img src={preview} className="w-full rounded-xl border border-slate-200" />
        ) : (
          <div className="w-full h-40 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-slate-300">
            <ImageOff size={28} />
          </div>
        )}
        <button type="button" onClick={() => fotoRef.current.click()} className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:border-indigo-400">
          <Camera size={14} /> {uploading ? "Mengunggah..." : preview ? "Ganti Foto" : "Ambil / Pilih Foto"}
        </button>
        <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      <div className="flex gap-2 mt-6 pt-4 border-t border-slate-100">
        <button onClick={onClose} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
        <button
          disabled={!preview}
          onClick={() => onUpload(target.batchId, target.docKey, preview)}
          className={`flex-1 px-4 py-2.5 text-sm ${btnPrimaryCls}`}
        >
          Simpan Foto
        </button>
      </div>
    </Modal>
  );
}

function ViewBatchDocModal({ target, onClose }) {
  if (!target) return null;
  return (
    <Modal title={target.label} subtitle={target.kodeBatch} onClose={onClose}>
      {target.dataUrl ? (
        <img src={target.dataUrl} className="w-full rounded-xl border border-slate-200 max-h-[60vh] object-contain mb-4" />
      ) : (
        <div className="w-full h-56 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-300 mb-4">
          <ImageOff size={32} />
        </div>
      )}
      <button onClick={onClose} className={`w-full py-2 text-sm ${btnPrimaryCls}`}>Tutup</button>
    </Modal>
  );
}

// ---------- Invoice builder ----------
function sparepartLinesFromInvoice(inv) {
  if (!inv) return [];
  return (inv.lines || []).filter((l) => l.partId).map((l) => ({
    id: uid(), partId: l.partId, qty: l.qty, price: l.price, locked: !!l.locked,
  }));
}
function jasaLinesFromInvoice(inv) {
  if (!inv) return [];
  return (inv.lines || []).filter((l) => !l.partId && !l.isBarangInfo).map((l) => ({ id: uid(), label: l.label, price: l.price }));
}
function seedFromServiceClaims(claims, preselectIds, invoices) {
  const locked = [];
  const jasaSeed = [];
  (preselectIds || []).forEach((id) => {
    const c = claims.find((x) => x.id === id);
    if (!c) return;
    const alreadyInvoiced = (invoices || []).some((inv) => (inv.claimIds || []).includes(id));
    if (alreadyInvoiced) return;
    (c.partsUsed || []).forEach((pu) => {
      locked.push({ id: uid(), locked: true, partId: pu.partId, qty: pu.qty, price: pu.price || 0 });
    });
    if (Number(c.biayaJasaServis) > 0) {
      jasaSeed.push({ id: uid(), label: `Jasa Servis — ${c.brand} ${c.produk}`, price: c.biayaJasaServis });
    } else if (c.jenis === "Ganti Baru" && Number(c.biayaToko) > 0 && (!c.partsUsed || c.partsUsed.length === 0)) {
      jasaSeed.push({ id: uid(), label: `Biaya Penggantian — ${c.brand} ${c.produk}`, price: c.biayaToko });
    } else if (c.sumberPenyelesaian === "Supplier" && Number(c.biayaToko) > 0) {
      jasaSeed.push({ id: uid(), label: `Biaya Service — ${c.brand} ${c.produk}`, price: c.biayaToko });
    }
  });
  return { locked, jasaSeed };
}

function InvoiceBuilderModal({ claims, settings, invoices, role, initialPhone, preselectIds, editingInvoice, onClose, onGenerate }) {
  const isEditing = !!editingInvoice;
  const canManage = role === "pusat";

  function findInvoiceForClaim(claimId) {
    return (invoices || []).find((inv) => (inv.claimIds || []).includes(claimId));
  }

  const eligibleClaims = useMemo(() => claims.filter((c) => {
    if (!(c.status === "Siap Diambil" || c.status === "Selesai")) return false;
    const existing = findInvoiceForClaim(c.id);
    if (!existing) return true;
    if (isEditing && existing.id === editingInvoice.id) return true;
    return canManage;
  }), [claims, invoices, isEditing, editingInvoice, canManage]);

  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => preselectIds || []);
  const [customerName, setCustomerName] = useState(editingInvoice?.customerName || (claims.find((c) => (preselectIds || []).includes(c.id))?.customerName || ""));
  const [phone, setPhone] = useState(editingInvoice?.customerPhone || initialPhone || "");
  const [date, setDate] = useState(editingInvoice?.date || todayStr());

  const [sparepartLines, setSparepartLines] = useState(() =>
    isEditing ? sparepartLinesFromInvoice(editingInvoice) : seedFromServiceClaims(claims, preselectIds, invoices).locked
  );
  const [jasaLines, setJasaLines] = useState(() =>
    isEditing ? jasaLinesFromInvoice(editingInvoice) : seedFromServiceClaims(claims, preselectIds, invoices).jasaSeed
  );
  const [oldSparepartUsage] = useState(() =>
    sparepartLinesFromInvoice(editingInvoice).filter((l) => !l.locked).map((l) => ({ partId: l.partId, qty: Number(l.qty) || 0 }))
  );

  const filteredClaims = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return eligibleClaims;
    return eligibleClaims.filter((c) => `${c.customerName} ${c.snDiterima} ${c.brand} ${c.produk}`.toLowerCase().includes(q));
  }, [eligibleClaims, query]);

  function toggleClaim(c) {
    setSelectedIds((ids) => {
      if (ids.includes(c.id)) return ids.filter((x) => x !== c.id);
      if (!customerName) setCustomerName(c.customerName);
      if (!phone) setPhone(c.customerPhone);
      return [...ids, c.id];
    });
  }

  function addSparepartLine() {
    setSparepartLines((l) => [...l, { id: uid(), partId: "", qty: 1, price: "" }]);
  }
  function updateSparepartLine(id, patch) {
    setSparepartLines((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function removeSparepartLine(id) {
    setSparepartLines((l) => l.filter((x) => x.id !== id));
  }
  function addJasaLine() {
    setJasaLines((l) => [...l, { id: uid(), label: "", price: "" }]);
  }
  function updateJasaLine(id, patch) {
    setJasaLines((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function removeJasaLine(id) {
    setJasaLines((l) => l.filter((x) => x.id !== id));
  }

  const selectedClaims = claims.filter((c) => selectedIds.includes(c.id));
  const sparepartTotal = sparepartLines.reduce((sum, l) => sum + (l.partId ? (Number(l.qty) || 0) * (Number(l.price) || 0) : 0), 0);
  const jasaTotal = jasaLines.reduce((sum, l) => sum + (l.label.trim() ? (Number(l.price) || 0) : 0), 0);
  const grandTotal = sparepartTotal + jasaTotal;

  const canSubmit = customerName.trim() && phone.trim() && (selectedIds.length > 0 || sparepartLines.some((l) => l.partId) || jasaLines.some((l) => l.label.trim()));

  function handleSubmit() {
    const lines = [
      ...selectedClaims.map((c) => ({
        label: `${c.brand} ${c.produk}`, sn: c.snDiterima,
        snPengganti: c.snPenggantiStock || c.snPenggantiSupplier || "",
        jenis: c.jenis, qty: 1, price: 0, amount: 0, isBarangInfo: true,
      })),
      ...sparepartLines.filter((l) => l.partId).map((l) => {
        const part = (settings.spareParts || []).find((p) => p.id === l.partId);
        return { label: part ? part.name : "Sparepart", sn: "", qty: Number(l.qty) || 0, price: Number(l.price) || 0, amount: (Number(l.qty) || 0) * (Number(l.price) || 0), partId: l.partId, locked: !!l.locked };
      }),
      ...jasaLines.filter((l) => l.label.trim()).map((l) => ({ label: l.label.trim(), sn: "", qty: 1, price: Number(l.price) || 0, amount: Number(l.price) || 0 })),
    ];
    const data = {
      invoiceNo: editingInvoice ? editingInvoice.invoiceNo : `INV-${date.replace(/-/g, "")}-${uid().slice(0, 4).toUpperCase()}`,
      date,
      customerName: customerName.trim(),
      customerPhone: phone.trim(),
      claimIds: selectedIds,
      lines,
      total: grandTotal,
    };
    const newSparepartUsage = sparepartLines.filter((l) => l.partId && !l.locked).map((l) => ({ partId: l.partId, qty: Number(l.qty) || 0 }));
    onGenerate(data, newSparepartUsage, oldSparepartUsage);
  }

  return (
    <Modal
      title={isEditing ? "Edit Invoice" : "Buat Invoice"}
      subtitle={isEditing ? `${editingInvoice.invoiceNo} — revisi oleh Admin Pusat` : "Pilih barang yang sudah Siap Diambil / Selesai — atau langsung isi Sparepart/Jasa aja kalau customer cuma beli sparepart"}
      onClose={onClose}
      wide
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Field label="Nama Customer">
          <CustomerCombo value={customerName} customers={settings.customers || []} placeholder="Ketik nama customer..."
            onChange={(name, ph) => { setCustomerName(name); if (ph !== undefined && ph) setPhone(ph); }} />
        </Field>
        <Field label="No HP"><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Tanggal"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>

      <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Barang ({selectedClaims.length} dipilih)</div>
      <p className="text-[11px] text-slate-400 mb-2">Baris ini cuma identitas barang (nama+SN) — nggak ada kolom harga di sini, harga ada di Sparepart & Jasa di bawah.</p>
      <div className="relative mb-2">
        <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
        <input className={inputCls + " pl-8"} placeholder="Cari customer, SN, produk..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-50 mb-2">
        {filteredClaims.map((c) => {
          const checked = selectedIds.includes(c.id);
          const snPengganti = c.snPenggantiStock || c.snPenggantiSupplier;
          const existingInvoice = findInvoiceForClaim(c.id);
          const alreadyInvoicedElsewhere = existingInvoice && !(isEditing && existingInvoice.id === editingInvoice.id);
          return (
            <label key={c.id} className="flex items-center gap-3 p-3 text-sm cursor-pointer">
              <input type="checkbox" checked={checked} onChange={() => toggleClaim(c)} />
              <div className="flex-1 min-w-0">
                <div className="truncate">{c.customerName} — {c.brand} {c.produk}</div>
                <div className="text-xs text-slate-400 font-mono">SN {c.snDiterima}{snPengganti ? ` → SN Pengganti ${snPengganti}` : ""}</div>
              </div>
              {alreadyInvoicedElsewhere && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium shrink-0">Sudah Diinvoice{existingInvoice ? ` (${existingInvoice.invoiceNo})` : ""}</span>
              )}
              <StatusBadge status={c.status} />
            </label>
          );
        })}
        {filteredClaims.length === 0 && <div className="p-4 text-sm text-slate-400">Tidak ada barang yang cocok / tersedia untuk diinvoice.</div>}
      </div>

      <div className="text-xs font-semibold text-slate-400 uppercase mb-2 mt-4">Sparepart</div>
      <div className="space-y-2 mb-2">
        {sparepartLines.map((l) => {
          const part = (settings.spareParts || []).find((p) => p.id === l.partId);
          if (l.locked) {
            return (
              <div key={l.id} className="grid grid-cols-6 gap-2 items-center">
                <div className="col-span-3 text-sm text-slate-600 px-1 truncate">
                  {part ? part.name : "Sparepart"} <span className="text-[10px] text-slate-400">(sudah dipakai saat servis)</span>
                </div>
                <div className="col-span-1 text-sm text-slate-500 px-1">x{l.qty}</div>
                <input type="number" placeholder="Harga/pcs" className={inputCls + " col-span-2"} value={l.price} onChange={(e) => updateSparepartLine(l.id, { price: e.target.value })} />
              </div>
            );
          }
          return (
            <div key={l.id} className="grid grid-cols-6 gap-2">
              <select className={inputCls + " col-span-3"} value={l.partId} onChange={(e) => updateSparepartLine(l.id, { partId: e.target.value })}>
                <option value="">Pilih sparepart...</option>
                {sortByName(settings.spareParts).map((p) => <option key={p.id} value={p.id}>{p.name} (stok: {p.qty} {p.unit})</option>)}
              </select>
              <input type="number" min="1" placeholder="Qty" disabled={!l.partId} className={inputCls + " col-span-1 disabled:bg-slate-50 disabled:text-slate-300"} value={l.qty} onChange={(e) => updateSparepartLine(l.id, { qty: e.target.value })} />
              <input type="number" placeholder={l.partId ? "Harga/pcs" : "Pilih sparepart dulu"} disabled={!l.partId} className={inputCls + " col-span-1 disabled:bg-slate-50 disabled:text-slate-300"} value={l.price} onChange={(e) => updateSparepartLine(l.id, { price: e.target.value })} />
              <button onClick={() => removeSparepartLine(l.id)} className="col-span-1 text-slate-400 hover:text-red-500 justify-self-center"><X size={14} /></button>
            </div>
          );
        })}
      </div>
      <button onClick={addSparepartLine} className="flex items-center gap-1.5 text-sm text-indigo-600 font-medium mb-4">
        <Plus size={14} /> Tambah Sparepart
      </button>

      <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Jasa / Biaya Lain</div>
      <div className="space-y-2 mb-2">
        {jasaLines.map((l) => (
          <div key={l.id} className="grid grid-cols-6 gap-2">
            <input placeholder="Nama jasa/biaya" className={inputCls + " col-span-4"} value={l.label} onChange={(e) => updateJasaLine(l.id, { label: e.target.value })} />
            <input type="number" placeholder={l.label.trim() ? "Biaya" : "Isi nama dulu"} disabled={!l.label.trim()} className={inputCls + " col-span-1 disabled:bg-slate-50 disabled:text-slate-300"} value={l.price} onChange={(e) => updateJasaLine(l.id, { price: e.target.value })} />
            <button onClick={() => removeJasaLine(l.id)} className="col-span-1 text-slate-400 hover:text-red-500 justify-self-center"><X size={14} /></button>
          </div>
        ))}
      </div>
      <button onClick={addJasaLine} className="flex items-center gap-1.5 text-sm text-indigo-600 font-medium mb-4">
        <Plus size={14} /> Tambah Jasa/Biaya
      </button>

      <div className="flex items-center justify-between pt-4 border-t border-slate-100 mb-4">
        <span className="text-sm text-slate-500">Total Invoice</span>
        <span className="text-lg font-semibold text-slate-800">{rupiah(grandTotal)}</span>
      </div>
      <p className="text-[11px] text-slate-400 mb-4">Metode bayar (Cash/Transfer) dipilih nanti saat "Tandai Diambil", bukan di sini.</p>

      <div className="flex gap-2">
        <button onClick={onClose} className={`flex-1 px-4 py-2.5 text-sm ${btnSecondaryCls}`}>Batal</button>
        <button disabled={!canSubmit} onClick={handleSubmit} className={`flex-1 px-4 py-2.5 text-sm ${btnPrimaryCls}`}>
          {isEditing ? "Simpan Perubahan Invoice" : "Buat & Cetak Invoice"}
        </button>
      </div>
    </Modal>
  );
}

function InvoiceReceipt({ data, claims, onClose }) {
  return (
    <PrintModalShell onClose={onClose}>
      <h2 className="text-lg font-bold text-center mb-1">INVOICE</h2>
      <p className="text-center text-xs text-slate-500 mb-6">{data.invoiceNo} · {fmtDate(data.date)}</p>
      <div className="text-sm mb-4">
        <div><strong>Nama:</strong> {data.customerName}</div>
        <div><strong>No HP:</strong> {data.customerPhone}</div>
      </div>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="border-b border-slate-300 text-left">
            <th className="py-1 pr-2">Item</th>
            <th className="py-1 pr-2">Qty</th>
            <th className="py-1 text-right">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {(data.lines || []).map((l, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-1 pr-2">
                {l.label}
                {l.sn ? <span className="block text-xs text-slate-400 font-mono">SN {l.sn}</span> : null}
                {l.snPengganti ? <span className="block text-xs text-indigo-500 font-mono">SN Pengganti {l.snPengganti}</span> : null}
              </td>
              <td className="py-1 pr-2">{l.qty}</td>
              <td className="py-1 text-right">{l.isBarangInfo ? "-" : rupiah(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between text-base font-semibold border-t border-slate-300 pt-2">
        <span>Total</span>
        <span>{rupiah(data.total)}</span>
      </div>
      <p className="text-xs text-slate-500 mt-10 mb-10">Terima kasih atas kepercayaan Anda menggunakan layanan servis kami. Invoice ini berlaku sekaligus sebagai tanda terima barang.</p>
      <SignatureFooter leftLabel="Customer" rightLabel="Toko" />
    </PrintModalShell>
  );
}

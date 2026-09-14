/**
 * Style reminder — i1 CCTV reference: crisp white workspace, cobalt actions, generous rounded cards,
 * strong sans-serif hierarchy, gentle gray rules, and practical intranet density.
 *
 * PORTING NOTES (2026-09), pola sama kayak QuoteListPage.tsx/ProductCatalogPage.tsx:
 * - Shell/sidebar/topbar bawaan (app-shell, app-sidebar, breadcrumb dengan
 *   Bell/profile-pill) DIBUANG -- dobel sama sidebar/header app i1 Internal
 *   Tools. Sisa breadcrumb (judul + badge id internal) dipertahankan dalam
 *   bentuk sederhana + tombol kembali, ganti sidebar nav link.
 * - Navigasi berbasis URL (?quote=..., ?copy=..., window.history.replaceState)
 *   DIBUANG -- diganti 2 prop (`quoteId`, `onBack`). Fitur "duplicate/copy"
 *   (dulu lewat ?copy=) BELUM disambungkan dari manapun sekarang -- nyusul
 *   kalau QuoteDetailPage sudah di-port (di situ tombol duplicate-nya ada).
 * - useMobileSidebar() dibuang (cuma buat sidebar kloningan yang sudah
 *   dibuang). useQuoteDateInput() JUGA dibuang -- itu hook lama yang
 *   nyuntik field tanggal via DOM manipulation ke elemen ".valid-field",
 *   tapi field "Tanggal Penawaran" SUDAH ada langsung di JSX di bawah
 *   (lihat project-strip) jadi hook itu sekarang no-op / tidak melakukan
 *   apapun -- lebih aman dihapus daripada dipertahankan sebagai dead code
 *   yang bisa membingungkan nanti.
 * - className semua DIPERTAHANKAN APA ADANYA -- CSS sudah lengkap & global
 *   lewat app/globals.css (class `.editor-shell` dst, semua di-scope
 *   `.qb-root .editor-shell ...`, TIDAK butuh class `app-shell` sama sekali).
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Eye,
  GripVertical,
  LayoutTemplate,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth, useQuoteBuilderAccess } from "@/lib/quote-builder/auth";
import {
  createDraftQuote,
  getBranch,
  getQuoteFull,
  getTemplateItems,
  listCatalog,
  listDefaultNotes,
  listTemplates,
  saveQuoteFull,
  updateQuoteStatus as apiUpdateQuoteStatus,
} from "@/lib/quote-builder/api";
import { calculateAlternative } from "@/lib/quote-builder/pricing";
import type { Alternative, PriceType, Product, QuoteItem, QuoteNote, ReviewStatus, VatMode } from "@/lib/quote-builder/quoteTypes";
import type { BranchRow, TemplateRow } from "@/lib/quote-builder/database.types";

const priceTypeLabels: Record<PriceType, string> = {
  net: "Harga Online",
  reseller: "Reseller (DPP)",
  special: "Reseller Special",
};

const currency = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Math.round(value));
const displayDate = (value: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
const oneMonthLater = (value: string) => { const date = new Date(`${value}T12:00:00`); date.setMonth(date.getMonth() + 1); return date.toISOString().slice(0, 10); };
const todayISO = () => new Date().toISOString().slice(0, 10);
const safeFilePart = (value: string) => value.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "penawaran";

const FALLBACK_PRODUCT: Product = { id: "", name: "(produk tidak ditemukan di katalog)", sku: "", brand: "", prices: { net: 0, reseller: 0, special: 0 } };

const makeItem = (product: Product, qty: number, priceType: PriceType): QuoteItem => ({
  id: `local-${Math.random().toString(36).slice(2, 10)}`,
  productId: product.id || null,
  qty,
  unitPrice: product.prices[priceType],
  source: "list",
  nameSnapshot: product.name,
  skuSnapshot: product.sku || null,
  brandSnapshot: product.brand || null,
});

const emptyAlternative = (id: string, title: string): Alternative => ({
  id,
  title,
  description: "Alternatif baru",
  items: [],
  discountPct: 0,
  vatMode: "none",
  usePackagePrice: false,
  packagePrice: 0,
  includeInGrandTotal: false,
});

function ProductCombobox({ item, priceType, catalog, onSelect }: { item: QuoteItem; priceType: PriceType; catalog: Product[]; onSelect: (product: Product) => void }) {
  const product = catalog.find((candidate) => candidate.id === item.productId) ?? { ...FALLBACK_PRODUCT, name: item.nameSnapshot, sku: item.skuSnapshot ?? "", brand: item.brandSnapshot ?? "" };
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(product.name);
  useEffect(() => setQuery(product.name), [product.id, product.name]);
  const matches = useMemo(() => catalog.filter((candidate) => `${candidate.name} ${candidate.sku} ${candidate.brand}`.toLowerCase().includes(query.toLowerCase())).slice(0, 6), [query, catalog]);
  const choose = (candidate: Product) => { onSelect(candidate); setOpen(false); setQuery(candidate.name); };

  return <div className="product-combobox"><div className="combobox-input"><Search size={15} /><input value={query} aria-label="Cari produk" onFocus={() => { setOpen(true); setQuery(""); }} onChange={(event) => { setOpen(true); setQuery(event.target.value); }} onBlur={() => window.setTimeout(() => { setOpen(false); if (!query) setQuery(product.name); }, 150)} /><ChevronDown size={15} /></div><span>{product.brand} · {product.sku} · {currency(product.prices[priceType])} / unit</span>{open && <div className="product-menu"><div className="product-menu-head">{query ? `Hasil pencarian "${query}"` : "Produk pada price list"}</div>{matches.length ? matches.map((candidate) => <button key={candidate.id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(candidate)}><span><strong>{candidate.name}</strong><small>{candidate.brand} · {candidate.sku}</small></span><b>{currency(candidate.prices[priceType])}</b></button>) : <p>Produk tidak ditemukan. Coba kata kunci atau SKU lain.</p>}</div>}</div>;
}

function GrandTotalBlock({ grandTotal, includedLabels }: { grandTotal: number; includedLabels: string }) {
  return <section className="proposal-grand-total"><span>TOTAL PENAWARAN ({includedLabels || "BELUM ADA ALT TERPILIH"})</span><strong>{currency(grandTotal)}</strong></section>;
}

function FinancialRows({ alternative, financial, index }: { alternative: Alternative; financial: ReturnType<typeof calculateAlternative>; index: number }) {
  const rows = [
    { label: alternative.usePackagePrice ? "Harga paket" : "Subtotal item", value: currency(financial.base), kind: "" },
    ...(financial.discount > 0 ? [{ label: `Diskon ${alternative.discountPct}%`, value: `− ${currency(financial.discount)}`, kind: "" }] : []),
    ...(alternative.vatMode === "add" ? [{ label: "PPN 11%", value: currency(financial.vat), kind: "" }] : []),
    ...(alternative.vatMode === "included" ? [{ label: "PPN 11% sudah termasuk", value: currency(financial.vat), kind: "included" }] : []),
    { label: `Total ALT ${index + 1}`, value: currency(financial.displayTotal), kind: "total" },
  ];
  return <>{rows.map((row) => <tr key={row.label} className={row.kind}><td className="financial-spacer" aria-hidden="true" /><td className="financial-spacer" aria-hidden="true" /><td className="financial-spacer" aria-hidden="true" /><td className="financial-label">{row.label}</td><td className="financial-amount">{row.value}</td></tr>)}</>;
}

function AltFinancialTable({ alternative, financial, index }: { alternative: Alternative; financial: ReturnType<typeof calculateAlternative>; index: number }) {
  return <table className="proposal-financial-table is-package" aria-label={`Ringkasan ALT ${index + 1}`}><colgroup><col className="pdf-no-col" /><col className="pdf-description-col" /><col className="pdf-qty-col" /><col className="pdf-label-col" /><col className="pdf-amount-col" /></colgroup><tbody><FinancialRows alternative={alternative} financial={financial} index={index} /></tbody></table>;
}

function ProposalDocument({ alternatives, clientName, projectName, quoteDate, validDate, notes, branch, documentRef }: { alternatives: Alternative[]; clientName: string; projectName: string; quoteDate: string; validDate: string; notes: QuoteNote[]; branch: BranchRow | null; documentRef: { current: HTMLElement | null } }) {
  const totals = alternatives.map((alternative) => ({ alternative, financial: calculateAlternative(alternative) }));
  const includedIndices = alternatives.map((alternative, index) => alternative.includeInGrandTotal ? index : -1).filter((index) => index >= 0);
  const lastIncludedIndex = includedIndices.length ? Math.max(...includedIndices) : -1;
  const grandTotal = totals.filter(({ alternative }) => alternative.includeInGrandTotal).reduce((total, { financial }) => total + financial.displayTotal, 0);
  const includedLabels = alternatives.map((alternative, index) => alternative.includeInGrandTotal ? `ALT ${index + 1}` : null).filter(Boolean).join(" + ");
  const branchLabel = branch?.name ?? "—";
  const placeholder = !branch?.address || !branch?.phone;
  return <article ref={documentRef} className="proposal-document"><header className="proposal-letterhead"><div className="company-panel"><div className="company-mark">{branch?.logo_path ? <img src={branch.logo_path} alt={`Logo ${branchLabel}`} /> : <span style={{ color: "#fff", fontWeight: 800, fontSize: 12 }}>{branchLabel.slice(0, 3).toUpperCase()}</span>}</div></div><div className="company-contact"><span style={placeholder ? { color: "#c17a2f", fontStyle: "italic" } : undefined}>{branch?.phone ?? "(nomor telepon cabang belum diisi)"}</span><span style={placeholder ? { color: "#c17a2f", fontStyle: "italic" } : undefined}>{branch?.email ?? "(email cabang belum diisi)"}</span><span style={placeholder ? { color: "#c17a2f", fontStyle: "italic" } : undefined}>{branch?.address ?? "(alamat cabang belum diisi)"}</span></div></header><section className="proposal-meta"><div><span>Kepada Yth</span><strong>{clientName}</strong><small>{branchLabel}</small></div><div><span>{branchLabel}, {displayDate(quoteDate)}</span><small>Berlaku sampai {displayDate(validDate)}</small></div></section><section className="proposal-opening"><p>Dengan hormat,</p><p>Bersama ini kami mengajukan surat penawaran untuk <strong>{projectName.toLowerCase()}</strong>, sebagai berikut:</p></section>{totals.map(({ alternative, financial }, index) => <div key={alternative.id}><section className="proposal-alt"><div className="proposal-alt-title"><span>ALT {index + 1}</span><strong>{alternative.title.toUpperCase()}</strong>{!alternative.includeInGrandTotal && <em>OPSIONAL · TIDAK MASUK TOTAL</em>}</div>{alternative.usePackagePrice ? <><table className="proposal-package-table"><thead><tr><th>No</th><th>Keterangan</th><th>Qty</th><th>Merk / Kategori</th></tr></thead><tbody>{alternative.items.map((item, itemIndex) => <tr key={item.id}><td>{itemIndex + 1}</td><td>{item.nameSnapshot}</td><td>{item.qty}</td><td>{item.brandSnapshot}</td></tr>)}</tbody></table><AltFinancialTable alternative={alternative} financial={financial} index={index} /></> : <table className="proposal-standard-table"><colgroup><col className="pdf-no-col" /><col className="pdf-description-col" /><col className="pdf-qty-col" /><col className="pdf-label-col" /><col className="pdf-amount-col" /></colgroup><thead><tr><th>No</th><th>Keterangan</th><th>Qty</th><th>Harga</th><th>Jumlah</th></tr></thead><tbody>{alternative.items.map((item, itemIndex) => <tr key={item.id}><td>{itemIndex + 1}</td><td>{item.nameSnapshot}</td><td>{item.qty}</td><td>{currency(item.unitPrice)}</td><td>{currency(item.qty * item.unitPrice)}</td></tr>)}<FinancialRows alternative={alternative} financial={financial} index={index} /></tbody></table>}</section>{index === lastIncludedIndex && <GrandTotalBlock grandTotal={grandTotal} includedLabels={includedLabels} />}</div>)}{lastIncludedIndex === -1 && <GrandTotalBlock grandTotal={grandTotal} includedLabels={includedLabels} />}<section className="proposal-notes"><h3>Catatan:</h3><ol>{notes.map((note) => <li key={note.id}>{note.text}</li>)}</ol></section><footer className="proposal-signature"><p>Demikian surat penawaran ini kami sampaikan. Atas perhatian dan kerja samanya, kami ucapkan terima kasih.</p><span>Hormat kami,</span><div className="signature-line" />{branch?.signer_name ? <strong>{branch.signer_name}</strong> : <><strong style={{ color: "#a0a7b3" }}>( — nama penandatangan belum diisi — )</strong><div style={{ marginTop: 4, padding: "4px 7px", borderRadius: 6, color: "#8a5c10", background: "#fff8e8", fontSize: 8, display: "inline-block" }}>Belum ada nama penandatangan untuk cabang {branchLabel}.</div></>}</footer></article>;
}

function QuotePreview({ alternatives, clientName, projectName, quoteDate, validDate, notes, internalCode, branch, onBack }: { alternatives: Alternative[]; clientName: string; projectName: string; quoteDate: string; validDate: string; notes: QuoteNote[]; internalCode: string; branch: BranchRow | null; onBack: () => void }) {
  const documentRef = useRef<HTMLElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = async () => {
    if (!documentRef.current || isExporting) return;
    setIsExporting(true);
    const filename = `Penawaran_${safeFilePart(internalCode)}_${safeFilePart(clientName)}.pdf`;
    try {
      // 2026-09: import dinamis, BUKAN import statis di atas file --
      // html2pdf.js (dan html2canvas/jspdf di baliknya) menyentuh
      // `self`/`window` di level modul, jadi kalau di-import statis,
      // Next.js ikut mengevaluasinya waktu SSR/prerender halaman "/"
      // (server tidak punya `self`) -> build gagal ("self is not
      // defined"). Dynamic import di sini cuma jalan di browser saat
      // tombol ini benar-benar diklik, jadi aman.
      const html2pdf = (await import("html2pdf.js")).default;
      await (html2pdf() as any)
        .set({
          margin: [0, 0, 0, 0],
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"], avoid: [".proposal-alt", ".proposal-grand-total", ".proposal-notes", ".proposal-signature"] },
        })
        .from(documentRef.current)
        .save();
      toast.success("PDF penawaran berhasil diunduh.", { description: filename });
    } catch (error) {
      console.error("PDF export failed", error);
      toast.error("Ekspor PDF belum berhasil.", { description: "Coba ulangi setelah halaman selesai dimuat." });
    } finally {
      setIsExporting(false);
    }
  };

  return <div className="preview-mode"><header className="preview-toolbar"><button className="back-editor" onClick={onBack}><ArrowLeft size={17} /> Kembali ke editor</button><div className="preview-toolbar-actions"><span><CheckCircle2 size={15} /> Data dari draft aktif</span><button className="outline-button" onClick={exportPdf} disabled={isExporting} aria-busy={isExporting}><Printer size={17} /> {isExporting ? "Menyiapkan PDF…" : "Unduh PDF"}</button></div></header><main className="preview-canvas"><ProposalDocument alternatives={alternatives} clientName={clientName} projectName={projectName} quoteDate={quoteDate} validDate={validDate} notes={notes} branch={branch} documentRef={documentRef} /></main></div>;
}

export type QuoteEditorPageProps = {
  /** null = bikin penawaran baru (draft). Diisi id = edit penawaran yang sudah ada. */
  quoteId: string | null;
  /** Kembali ke Daftar Penawaran. */
  onBack: () => void;
  /** Dipanggil setelah draft baru pertama kali tersimpan (dapat id) -- QuoteBuilderModule pakai ini buat "upgrade" dari mode baru ke mode edit tanpa reload. */
  onDraftCreated?: (quoteId: string) => void;
};

export default function QuoteEditorPage({ quoteId: initialQuoteId, onBack, onDraftCreated }: QuoteEditorPageProps) {
  const { session } = useAuth();
  const { role, branchId, isSuperAdmin } = useQuoteBuilderAccess();

  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [quoteId, setQuoteId] = useState<string | null>(initialQuoteId);
  const [internalCode, setInternalCode] = useState("(belum disimpan)");
  const [isEditingExisting, setIsEditingExisting] = useState(Boolean(initialQuoteId));

  const [catalog, setCatalog] = useState<Product[]>([]);
  const [branch, setBranch] = useState<BranchRow | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);

  const [priceType, setPriceType] = useState<PriceType>("reseller");
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [activeAltId, setActiveAltId] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateItems, setTemplateItems] = useState<Array<{ product: Product; qty: number }>>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [quoteDate, setQuoteDate] = useState(todayISO());
  const [validDate, setValidDate] = useState(oneMonthLater(todayISO()));
  const [notes, setNotes] = useState<QuoteNote[]>([]);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("draft");
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropTargetItemId, setDropTargetItemId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const touchDragRef = useRef<{ sourceId: string | null; lastTargetId: string | null }>({ sourceId: null, lastTargetId: null });
  const isLocked = reviewStatus === "sent";

  // ---- initial load: branch, catalog, and either an existing quote or a fresh draft ----
  useEffect(() => {
    if (!branchId) {
      // 2026-09-14: SEBELUMNYA baris ini cuma `return` diam-diam --
      // kalau akun yang login (misal super_admin) branch_id-nya kosong
      // di tabel profiles, loadingInitial gak PERNAH di-set false,
      // jadi spinner "Memuat penawaran..." muter selamanya tanpa
      // pesan apapun. Sekarang minimal kasih tau kenapa, biar gak
      // kelihatan kayak nge-hang/rusak.
      setLoadError(
        "Akun kamu belum terhubung ke cabang manapun (branch_id kosong), jadi katalog produk tidak bisa dimuat. Hubungi Super Admin untuk mengatur cabang akun ini, atau gunakan akun admin cabang untuk membuat penawaran."
      );
      setLoadingInitial(false);
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const [branchRow, catalogRows, templateRows, defaultNotes] = await Promise.all([
          getBranch(branchId!),
          listCatalog(branchId!),
          listTemplates(branchId!),
          listDefaultNotes(),
        ]);
        if (cancelled) return;
        setBranch(branchRow);
        setCatalog(catalogRows);
        setTemplates(templateRows);
        setSelectedTemplateId(templateRows[0]?.id ?? null);

        if (initialQuoteId) {
          const full = await getQuoteFull(initialQuoteId);
          if (cancelled) return;
          applyLoadedQuote(full.quote.id, full.quote.internal_code ?? "(tanpa kode)", true, full.quote.client_name, full.quote.project_name, full.quote.quote_date, full.quote.valid_until ?? oneMonthLater(full.quote.quote_date), full.alternatives, full.notes, full.quote.status);
        } else {
          const fallbackNotes = defaultNotes.map((note) => ({ ...note, id: `local-${note.id}` }));
          setClientName("");
          setProjectName("Penawaran baru");
          setQuoteDate(todayISO());
          setValidDate(oneMonthLater(todayISO()));
          setNotes(fallbackNotes);
          const first = emptyAlternative("alt-1", "Alternatif 1");
          setAlternatives([first]);
          setActiveAltId(first.id);
          setReviewStatus("draft");
          setIsEditingExisting(false);
        }
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    }

    function applyLoadedQuote(id: string, code: string, existing: boolean, client: string, project: string, date: string, valid: string, alts: Alternative[], loadedNotes: QuoteNote[], status: ReviewStatus) {
      setQuoteId(id);
      setInternalCode(code);
      setIsEditingExisting(existing);
      setClientName(client);
      setProjectName(project);
      setQuoteDate(date);
      setValidDate(valid);
      setAlternatives(alts.length ? alts : [emptyAlternative("alt-1", "Alternatif 1")]);
      setActiveAltId(alts[0]?.id ?? "alt-1");
      setNotes(loadedNotes);
      setReviewStatus(status);
    }

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, initialQuoteId]);

  const activeAlt = alternatives.find((alternative) => alternative.id === activeAltId) ?? alternatives[0];
  const totalMetrics = useMemo(() => alternatives.map((alternative) => ({ alternative, financial: calculateAlternative(alternative) })), [alternatives]);
  const grandTotal = totalMetrics.filter(({ alternative }) => alternative.includeInGrandTotal).reduce((total, { financial }) => total + financial.displayTotal, 0);
  const activeFinancial = activeAlt ? calculateAlternative(activeAlt) : { itemSubtotal: 0, base: 0, discount: 0, dpp: 0, vat: 0, displayTotal: 0 };

  const productById = (id: string | null) => catalog.find((product) => product.id === id) ?? FALLBACK_PRODUCT;

  // ---- template preview data (loaded on demand when a template is selected) ----
  useEffect(() => {
    if (!selectedTemplateId) { setTemplateItems([]); return; }
    let cancelled = false;
    getTemplateItems(selectedTemplateId).then((rows) => {
      if (cancelled) return;
      setTemplateItems(
        rows.map((row) => ({
          product: catalog.find((p) => p.id === row.product_id) ?? { id: row.product_id, name: row.products.name, sku: row.products.sku ?? "", brand: row.products.brand ?? "", prices: { net: 0, reseller: 0, special: 0 } },
          qty: Number(row.qty),
        })),
      );
    });
    return () => { cancelled = true; };
  }, [selectedTemplateId, catalog]);
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;
  const templateTotal = templateItems.reduce((sum, { product, qty }) => sum + product.prices[priceType] * qty, 0);

  const updateAlternative = (altId: string, updater: (alternative: Alternative) => Alternative) => setAlternatives((current) => current.map((alternative) => (alternative.id === altId ? updater(alternative) : alternative)));
  const updateItem = (itemId: string, patch: Partial<QuoteItem>) => updateAlternative(activeAlt.id, (alternative) => ({ ...alternative, items: alternative.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) }));
  const updateNote = (noteId: string, text: string) => setNotes((current) => current.map((note) => (note.id === noteId ? { ...note, text } : note)));

  const updatePriceType = (nextPriceType: PriceType) => {
    setPriceType(nextPriceType);
    setAlternatives((current) => current.map((alternative) => ({ ...alternative, items: alternative.items.map((item) => (item.source === "list" ? { ...item, unitPrice: productById(item.productId).prices[nextPriceType] } : item)) })));
    toast.success(`Basis harga ${priceTypeLabels[nextPriceType]} diterapkan.`, { description: "Harga manual tetap dipertahankan." });
  };
  const changeProduct = (itemId: string, product: Product) => {
    updateItem(itemId, { productId: product.id || null, unitPrice: product.prices[priceType], source: "list", nameSnapshot: product.name, skuSnapshot: product.sku || null, brandSnapshot: product.brand || null });
    toast.message("Produk diganti", { description: "Harga kembali memakai price list sesuai basis harga aktif." });
  };
  const restorePrice = (itemId: string) => {
    const item = activeAlt.items.find((row) => row.id === itemId);
    if (!item) return;
    const product = productById(item.productId);
    updateItem(itemId, { unitPrice: product.prices[priceType], source: "list" });
    toast.success("Harga dipulihkan dari price list.");
  };
  const addRow = () => updateAlternative(activeAlt.id, (alternative) => ({ ...alternative, items: [...alternative.items, makeItem(catalog[0] ?? FALLBACK_PRODUCT, 1, priceType)] }));
  const removeRow = (itemId: string) => {
    if (activeAlt.items.length === 1) { toast.error("ALT harus memiliki minimal satu item."); return; }
    updateAlternative(activeAlt.id, (alternative) => ({ ...alternative, items: alternative.items.filter((item) => item.id !== itemId) }));
  };
  const reorderActiveItems = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    updateAlternative(activeAlt.id, (alternative) => {
      const nextItems = [...alternative.items];
      const sourceIndex = nextItems.findIndex((item) => item.id === sourceId);
      const targetIndex = nextItems.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return alternative;
      const [moved] = nextItems.splice(sourceIndex, 1);
      nextItems.splice(targetIndex, 0, moved);
      return { ...alternative, items: nextItems };
    });
    toast.success("Urutan produk diperbarui.");
  };
  const addAlternative = () => {
    const created = emptyAlternative(`alt-${Date.now()}`, `Alternatif ${alternatives.length + 1}`);
    setAlternatives((current) => [...current, created]);
    setActiveAltId(created.id);
    toast.success("ALT baru ditambahkan.");
  };
  const applyTemplate = (mode: "replace" | "append") => {
    if (!selectedTemplate) return;
    const items = templateItems.map(({ product, qty }) => makeItem(product, qty, priceType));
    updateAlternative(activeAlt.id, (alternative) => ({
      ...alternative,
      title: mode === "replace" ? selectedTemplate.name : alternative.title,
      description: mode === "replace" ? `Dari template ${selectedTemplate.name}` : alternative.description,
      items: mode === "replace" ? items : [...alternative.items, ...items],
    }));
    setTemplateOpen(false);
    toast.success(mode === "replace" ? "ALT diganti dengan template." : "Item template ditambahkan ke ALT.");
  };
  const addNote = () => setNotes((current) => [...current, { id: `local-note-${Date.now()}`, text: "Catatan baru yang dapat diedit." }]);
  const removeNote = (noteId: string) => setNotes((current) => current.filter((note) => note.id !== noteId));

  const [confirmDraftOpen, setConfirmDraftOpen] = useState(false);
  const [confirmSentOpen, setConfirmSentOpen] = useState(false);

  const persistQuote = async () => {
    if (!session || !branchId) return null;
    setIsSaving(true);
    try {
      let id = quoteId;
      if (!id) {
        const draft = await createDraftQuote({ branchId, clientName: clientName || "(pelanggan belum diisi)", projectName: projectName || "Penawaran baru", validUntil: validDate || null, createdBy: session.user.id });
        id = draft.id;
        setQuoteId(id);
        setInternalCode(draft.internal_code ?? internalCode);
        setIsEditingExisting(true);
        onDraftCreated?.(id);
      }
      await saveQuoteFull(id, { clientName, projectName, quoteDate, validUntil: validDate || null, alternatives, notes });
      return id;
    } finally {
      setIsSaving(false);
    }
  };

  const saveDraft = () => setConfirmDraftOpen(true);
  const confirmSaveDraft = async () => {
    setConfirmDraftOpen(false);
    try {
      await persistQuote();
      toast.success("Draft penawaran disimpan.");
    } catch (err) {
      toast.error("Gagal menyimpan.", { description: (err as Error).message });
    }
  };

  const statusOrder: ReviewStatus[] = ["draft", "in_review", "confirmed", "needs_revision", "sent"];
  const roleStatusTargets: Record<string, ReviewStatus[]> = { admin: ["in_review", "sent"], super_admin: ["draft", "in_review", "confirmed", "needs_revision", "sent"] };
  const allowedStatuses = new Set([...(roleStatusTargets[role ?? ""] ?? []), reviewStatus]);
  const statusOptionLabel = (value: ReviewStatus) => (value === "in_review" ? "In Review" : value === "needs_revision" ? "Needs Revision" : value === "sent" ? "Sent" : value === "confirmed" ? "Confirmed" : "Draft");

  const applyStatus = async (next: ReviewStatus) => {
    try {
      const id = quoteId ?? (await persistQuote());
      if (!id) return;
      await apiUpdateQuoteStatus(id, next);
      setReviewStatus(next);
      setConfirmSentOpen(false);
      toast.success(`Status diubah menjadi ${statusOptionLabel(next)}.`);
    } catch (err) {
      toast.error("Gagal mengubah status.", { description: (err as Error).message });
    }
  };
  const updateQuoteStatus = (next: ReviewStatus) => {
    if (next === "sent") { setConfirmSentOpen(true); return; }
    void applyStatus(next);
  };

  useEffect(() => {
    if (isLocked) return;
    const table = document.querySelector<HTMLTableElement>(".editor-shell .quote-table");
    if (!table || !activeAlt) return;
    const grips = Array.from(table.querySelectorAll<HTMLElement>("tbody .drag-cell"));
    const rowAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLTableRowElement>("tr[data-quote-item-id]");
    const startTouch = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      const row = (event.currentTarget as HTMLElement).closest<HTMLTableRowElement>("tr[data-quote-item-id]");
      const sourceId = row?.dataset.quoteItemId;
      if (!sourceId) return;
      event.preventDefault();
      touchDragRef.current = { sourceId, lastTargetId: sourceId };
      setDraggingItemId(sourceId);
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    };
    const moveTouch = (event: PointerEvent) => {
      const sourceId = touchDragRef.current.sourceId;
      if (!sourceId) return;
      const targetId = rowAt(event.clientX, event.clientY)?.dataset.quoteItemId;
      if (!targetId || targetId === sourceId || targetId === touchDragRef.current.lastTargetId) return;
      reorderActiveItems(sourceId, targetId);
      touchDragRef.current.lastTargetId = targetId;
      setDropTargetItemId(targetId);
    };
    const stopTouch = () => { touchDragRef.current = { sourceId: null, lastTargetId: null }; setDraggingItemId(null); setDropTargetItemId(null); };
    const startDrag = (event: DragEvent) => { const row = (event.currentTarget as HTMLElement).closest<HTMLTableRowElement>("tr[data-quote-item-id]"); const sourceId = row?.dataset.quoteItemId; if (!sourceId) return; event.dataTransfer?.setData("text/plain", sourceId); event.dataTransfer && (event.dataTransfer.effectAllowed = "move"); setDraggingItemId(sourceId); };
    grips.forEach((grip) => { grip.setAttribute("draggable", "true"); grip.addEventListener("pointerdown", startTouch); grip.addEventListener("dragstart", startDrag); grip.addEventListener("pointermove", moveTouch); grip.addEventListener("pointerup", stopTouch); grip.addEventListener("pointercancel", stopTouch); });
    return () => grips.forEach((grip) => { grip.removeAttribute("draggable"); grip.removeEventListener("pointerdown", startTouch); grip.removeEventListener("dragstart", startDrag); grip.removeEventListener("pointermove", moveTouch); grip.removeEventListener("pointerup", stopTouch); grip.removeEventListener("pointercancel", stopTouch); });
  }, [activeAlt?.id, activeAlt?.items, isLocked]);

  if (loadingInitial) return <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#707786" }}>Memuat penawaran…</div>;
  if (loadError) return <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#b23b2c" }}>{loadError}</div>;
  if (!activeAlt) return null;

  if (previewOpen) return <QuotePreview alternatives={alternatives} clientName={clientName} projectName={projectName} quoteDate={quoteDate} validDate={validDate} notes={notes} internalCode={internalCode} branch={branch} onBack={() => setPreviewOpen(false)} />;

  return <div className="editor-shell"><main className="quote-workspace editor-screen"><header className="topbar"><div className="breadcrumb"><button onClick={onBack}><ArrowLeft size={14} /> Daftar Penawaran</button><span>/</span><strong>{isEditingExisting ? "Edit Penawaran" : "Buat Penawaran"}</strong><span className="internal-id-badge" title="ID internal, tidak pernah tampil ke pelanggan">id internal: {internalCode}</span></div></header><section className="editor-heading"><div><p className="eyebrow">{isEditingExisting ? "EDIT PENAWARAN" : "PENAWARAN BARU"}</p><input value={projectName} onChange={(event) => setProjectName(event.target.value)} disabled={isLocked} aria-label="Judul proyek" /><p>Harga product dari price list akan terus mengikuti versi terbaru sampai penawaran berstatus Sent.</p></div><div className="editor-top-actions"><label className="status-dropdown"><span>STATUS</span><select value={reviewStatus} onChange={(event) => updateQuoteStatus(event.target.value as ReviewStatus)} disabled={!isEditingExisting}>{statusOrder.filter((value) => allowedStatuses.has(value)).map((value) => <option key={value} value={value}>{statusOptionLabel(value)}</option>)}</select></label><button className="save-button" onClick={saveDraft} disabled={isLocked || isSaving}><Save size={16} /> {isSaving ? "Menyimpan…" : "Simpan Draft"}</button></div></section>{isLocked ? <div className="locked-notice"><CheckCircle2 size={17} /><span>Penawaran sudah Sent. Harga dan nilai item dikunci sebagai snapshot dokumen — tidak bisa diedit siapapun.</span></div> : <div className="live-price-notice"><ReceiptText size={17} /><span>Harga live · price list cabang {branch?.name ?? "—"} terbaru</span></div>}<section className="project-strip"><label><span>PELANGGAN</span><input value={clientName} onChange={(event) => setClientName(event.target.value)} disabled={isLocked} /></label><label><span>TANGGAL PENAWARAN</span><input type="date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} disabled={isLocked} /></label><label><span>BERLAKU SAMPAI</span><input type="date" value={validDate} onChange={(event) => setValidDate(event.target.value)} disabled={isLocked} /></label><label className="basis-field"><span>BASIS HARGA</span><select value={priceType} onChange={(event) => updatePriceType(event.target.value as PriceType)} disabled={isLocked}><option value="net">{priceTypeLabels.net}</option><option value="reseller">{priceTypeLabels.reseller}</option><option value="special">{priceTypeLabels.special}</option></select></label><label><span>CABANG</span><div className="field-input"><strong style={{ color: "#3159d5" }}>{branch?.name ?? "—"}</strong></div><small>Katalog &amp; kop surat mengikuti cabang ini</small></label></section><div className="editor-body"><aside className="alternative-rail"><header><span>ALTERNATIF</span><b>{alternatives.length} ALT</b></header>{alternatives.map((alternative, index) => { const result = calculateAlternative(alternative); return <button key={alternative.id} className={activeAltId === alternative.id ? "alternative-card active" : "alternative-card"} onClick={() => setActiveAltId(alternative.id)}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{alternative.title}</strong><small>{alternative.includeInGrandTotal ? "Masuk total" : "Opsional"} · {currency(result.displayTotal)}</small></span></button>; })}<button className="add-alt-button" onClick={addAlternative} disabled={isLocked}><Plus size={15} /> Tambah ALT</button></aside><section className="quote-editor"><header className="alt-editor-title"><div><span>ALT {alternatives.findIndex((alternative) => alternative.id === activeAlt.id) + 1}</span><input value={activeAlt.title} onChange={(event) => updateAlternative(activeAlt.id, (alternative) => ({ ...alternative, title: event.target.value }))} disabled={isLocked} /></div><button className="outline-button" onClick={() => setTemplateOpen(true)} disabled={isLocked || templates.length === 0}><LayoutTemplate size={16} /> Pilih Template</button></header><section className="alt-controls"><label><span>DISKON</span><div><input type="number" min="0" max="100" value={activeAlt.discountPct} onChange={(event) => updateAlternative(activeAlt.id, (alternative) => ({ ...alternative, discountPct: Number(event.target.value) }))} disabled={isLocked} /><b>%</b></div></label><label><span>PPN</span><select value={activeAlt.vatMode} onChange={(event) => updateAlternative(activeAlt.id, (alternative) => ({ ...alternative, vatMode: event.target.value as VatMode }))} disabled={isLocked}><option value="included">Termasuk PPN</option><option value="add">Tambah PPN 11%</option><option value="none">Tanpa PPN</option></select></label><label className="alt-total-toggle"><input type="checkbox" checked={activeAlt.includeInGrandTotal} onChange={(event) => updateAlternative(activeAlt.id, (alternative) => ({ ...alternative, includeInGrandTotal: event.target.checked }))} disabled={isLocked} /><span>Masuk total penawaran</span></label></section><section className="editor-table-shell"><table className="quote-table"><colgroup><col className="number-col" /><col className="product-col" /><col className="quantity-col" /><col className="price-col" /><col className="total-col" /><col className="action-col" /></colgroup><thead><tr><th>No</th><th>Produk</th><th>Qty</th><th>Harga satuan</th><th>Jumlah</th><th aria-label="Aksi" /></tr></thead><tbody>{activeAlt.items.map((item, index) => <tr key={item.id} data-quote-item-id={item.id} draggable={!isLocked} className={dropTargetItemId === item.id ? "drag-target" : ""} onDragStart={() => setDraggingItemId(item.id)} onDragOver={(event) => { event.preventDefault(); setDropTargetItemId(item.id); }} onDrop={() => { if (draggingItemId) reorderActiveItems(draggingItemId, item.id); setDraggingItemId(null); setDropTargetItemId(null); }}><td className="drag-cell" aria-label={`Ubah urutan produk ${index + 1}`}><GripVertical size={15} /><b>{index + 1}</b></td><td><ProductCombobox item={item} priceType={priceType} catalog={catalog} onSelect={(product) => changeProduct(item.id, product)} /></td><td><input className="qty-input" type="number" min="1" value={item.qty} onChange={(event) => updateItem(item.id, { qty: Math.max(1, Number(event.target.value)) })} disabled={isLocked} /></td><td><div className="price-input"><input type="number" value={item.unitPrice} onChange={(event) => updateItem(item.id, { unitPrice: Number(event.target.value), source: "manual" })} disabled={isLocked} />{item.source === "manual" && <button onClick={() => restorePrice(item.id)} disabled={isLocked} title="Kembalikan ke price list"><RotateCcw size={14} /></button>}</div><small className={item.source === "list" ? "live-price" : "manual-price"}>{item.source === "list" ? "Price list live" : "Diubah manual"}</small></td><td><strong>{currency(item.qty * item.unitPrice)}</strong></td><td><button className="row-delete" onClick={() => removeRow(item.id)} disabled={isLocked} aria-label={`Hapus ${item.nameSnapshot}`}><Trash2 size={16} /></button></td></tr>)}</tbody></table><footer className="editor-table-footer"><button onClick={addRow} disabled={isLocked}><Plus size={16} /> Tambah produk</button><div><span>Subtotal detail item</span><strong>{currency(activeFinancial.itemSubtotal)}</strong></div></footer></section><div className="editor-footnotes"><div><GripVertical size={16} /><p>Tekan, tahan, lalu geser ikon pegangan untuk mengubah urutan produk dalam ALT ini.</p></div></div><section className="notes-editor"><div className="notes-editor-head"><div><span>CATATAN PENAWARAN</span><h2>Catatan yang akan dicetak</h2><p>Hapus atau ubah catatan sesuai kondisi proyek dan pelanggan.</p></div><button className="outline-button" onClick={addNote} disabled={isLocked}><Plus size={15} /> Tambah catatan</button></div><div className="note-list">{notes.map((note, index) => <div className="note-edit" key={note.id}><span>{index + 1}</span><textarea value={note.text} onChange={(event) => updateNote(note.id, event.target.value)} disabled={isLocked} /><button onClick={() => removeNote(note.id)} disabled={isLocked} aria-label={`Hapus catatan ${index + 1}`}><Trash2 size={16} /></button></div>)}</div></section></section><aside className="summary-rail"><section className="total-card"><div className="total-card-head"><span>RINGKASAN NILAI</span><button onClick={() => setPreviewOpen(true)}>Lihat dokumen <Eye size={13} /></button></div><div className="total-lines">{totalMetrics.map(({ alternative, financial }, index) => <div key={alternative.id}><span>ALT {index + 1}<small>{alternative.includeInGrandTotal ? "Masuk total" : "Opsional"}</small></span><b>{currency(financial.displayTotal)}</b></div>)}</div><div className="grand-total"><span>TOTAL PENAWARAN</span><strong>{currency(grandTotal)}</strong><small>Hanya ALT yang dipilih masuk total</small></div></section><section className="summary-rule-card"><span>STATUS HARGA</span><p>{isLocked ? "Snapshot harga terkunci setelah dokumen dikirim." : "Produk dari price list akan mengikuti basis harga terbaru."}</p><button onClick={() => setPreviewOpen(true)}>Periksa preview <Eye size={14} /></button></section></aside></div>{templateOpen && selectedTemplate && <div className="modal-backdrop" onMouseDown={() => setTemplateOpen(false)}><section className="template-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close-modal" onClick={() => setTemplateOpen(false)} aria-label="Tutup"><X size={19} /></button><div className="template-modal-head"><p>TEMPLATE CABANG {branch?.name?.toUpperCase()}</p><h2>Pilih isi ALT sebelum menerapkannya.</h2><span>Harga aktual mengikuti basis harga aktif.</span></div><div className="template-content"><div className="template-selector">{templates.map((template) => <button key={template.id} className={selectedTemplateId === template.id ? "selected" : ""} onClick={() => setSelectedTemplateId(template.id)}><span>{template.name}</span><small>{template.description ?? ""}</small></button>)}</div><div className="template-detail"><div><p className="eyebrow">Template</p><h3>{selectedTemplate.name}</h3><p>{selectedTemplate.description}</p></div><div className="template-total"><span>ESTIMASI NILAI</span><strong>{currency(templateTotal)}</strong><small>{priceTypeLabels[priceType]}</small></div></div><div className="template-preview-table"><table><thead><tr><th>No</th><th>Produk</th><th>Qty</th><th>Harga</th><th>Jumlah</th></tr></thead><tbody>{templateItems.map(({ product, qty }, index) => <tr key={`${product.id}-${index}`}><td>{index + 1}</td><td>{product.name}</td><td>{qty}</td><td>{currency(product.prices[priceType])}</td><td>{currency(product.prices[priceType] * qty)}</td></tr>)}</tbody></table></div><div className="template-actions"><button className="outline-button" onClick={() => applyTemplate("append")}><Plus size={16} /> Tambahkan item</button><button className="save-button" onClick={() => applyTemplate("replace")}><LayoutTemplate size={16} /> Ganti ALT</button></div></div></section></div>}{confirmDraftOpen && <div className="confirm-overlay"><section className="confirm-dialog"><div className="delete-icon sent-lock"><Save size={20} /></div><h2>Simpan perubahan sebagai Draft?</h2><p>Perubahan kamu akan tersimpan.</p><div><button className="outline-button" onClick={() => setConfirmDraftOpen(false)}>Batal</button><button className="save-button" onClick={confirmSaveDraft}>Ya, simpan</button></div></section></div>}{confirmSentOpen && <div className="confirm-overlay"><section className="confirm-dialog"><div className="delete-icon sent-lock"><CheckCircle2 size={20} /></div><h2>Tandai penawaran sebagai Sent?</h2><p>Harga dan nilai item akan dikunci sebagai snapshot dokumen dan tidak bisa diedit lagi oleh siapapun, termasuk Super Admin.</p><div><button className="outline-button" onClick={() => setConfirmSentOpen(false)}>Batal</button><button className="save-button" onClick={() => applyStatus("sent")}>Ya, tandai Sent</button></div></section></div>}</main></div>;
}

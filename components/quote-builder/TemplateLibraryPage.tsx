/**
 * Template Penawaran -- daftar template per cabang + editor isi template.
 *
 * PORTING NOTES (2026-09), prinsip sama kayak ProductCatalogPage/QuoteListPage:
 * - Shell/sidebar/topbar bawaan Quote Builder DIBUANG (dobel sama shell app).
 * - Semua className DIPERTAHANKAN -- CSS `.template-page-v3` (daftar &
 *   editor 1 template) sudah lengkap di app/globals.css, jadi file ini
 *   cuma nulis markup React yang cocok ke CSS itu.
 * - Cabang mengikuti useQuoteBuilderAccess().branchId (diisi
 *   QuoteBuilderModule dari tab cabang, sama kayak menu Kas).
 * - Template dulunya cuma "shell" kosong (nama + deskripsi, 0 item) --
 *   halaman ini yang bikin isinya bisa diisi: cari produk dari katalog
 *   cabang, atur qty, urutkan dengan drag (mouse & sentuh).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, GripVertical, LoaderCircle, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth, useQuoteBuilderAccess } from "@/lib/quote-builder/auth";
import {
  createTemplate,
  deleteTemplate,
  getTemplateItemCounts,
  getTemplateItems,
  listCatalog,
  listTemplates,
  replaceTemplateItems,
  updateTemplate,
} from "@/lib/quote-builder/api";
import type { Product } from "@/lib/quote-builder/quoteTypes";
import type { TemplateRow } from "@/lib/quote-builder/database.types";

const formatIDR = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

// Qty disimpan sebagai teks selama diketik (biar "2." atau "" tidak langsung "dibetulkan"
// browser), baru diparse & divalidasi pas Simpan.
type EditorItem = { key: string; productId: string; qty: string; name: string; brand: string; sku: string };

type EditorState = {
  /** null = template baru yang belum pernah disimpan */
  templateId: string | null;
  name: string;
  description: string;
  items: EditorItem[];
};

let itemKeyCounter = 0;
const nextItemKey = () => `tpl-item-${Date.now()}-${itemKeyCounter++}`;

export default function TemplateLibraryPage() {
  const { session } = useAuth();
  const { branchId, hasAccess } = useQuoteBuilderAccess();

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");

  const dragKeyRef = useRef<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  const catalogById = useMemo(() => new Map(catalog.map((product) => [product.id, product])), [catalog]);

  const reloadList = async () => {
    if (!branchId) return;
    const rows = await listTemplates(branchId);
    setTemplates(rows);
    setCounts(await getTemplateItemCounts(rows.map((row) => row.id)));
  };

  useEffect(() => {
    if (!hasAccess) {
      setLoadError("Akun kamu tidak punya akses ke Template Penawaran (butuh role admin atau super_admin).");
      setLoading(false);
      return;
    }
    if (!branchId) {
      setLoadError("Akun kamu belum terhubung ke cabang manapun, jadi template tidak bisa dimuat.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([listTemplates(branchId), listCatalog(branchId)])
      .then(async ([templateRows, catalogRows]) => {
        const itemCounts = await getTemplateItemCounts(templateRows.map((row) => row.id));
        if (cancelled) return;
        setTemplates(templateRows);
        setCounts(itemCounts);
        setCatalog(catalogRows);
        setLoadError(null);
      })
      .catch((err: Error) => { if (!cancelled) setLoadError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [branchId, hasAccess]);

  // ---------------- buka / tutup editor ----------------
  const openTemplate = async (template: TemplateRow) => {
    setEditor({ templateId: template.id, name: template.name, description: template.description ?? "", items: [] });
    setDirty(false);
    setAddOpen(false);
    setQuery("");
    setEditorLoading(true);
    try {
      const rows = await getTemplateItems(template.id);
      setEditor((current) =>
        current && current.templateId === template.id
          ? {
              ...current,
              items: rows.map((row) => ({
                key: nextItemKey(),
                productId: row.product_id,
                qty: String(Number(row.qty)),
                name: row.products?.name ?? "(produk tidak ditemukan)",
                brand: row.products?.brand ?? "",
                sku: row.products?.sku ?? "",
              })),
            }
          : current,
      );
    } catch (err) {
      toast.error("Gagal memuat isi template.", { description: (err as Error).message });
    } finally {
      setEditorLoading(false);
    }
  };

  const newTemplate = () => {
    setEditor({ templateId: null, name: "", description: "", items: [] });
    setDirty(true);
    setAddOpen(true);
    setQuery("");
    setEditorLoading(false);
  };

  const closeEditor = () => {
    if (dirty && !window.confirm("Perubahan template belum disimpan. Tetap keluar?")) return;
    setEditor(null);
    setDirty(false);
  };

  const patchEditor = (patch: Partial<EditorState>) => {
    setEditor((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  };

  // ---------------- item template ----------------
  const addProduct = (product: Product) => {
    if (!editor) return;
    const existing = editor.items.find((item) => item.productId === product.id);
    if (existing) {
      patchEditor({ items: editor.items.map((item) => (item.key === existing.key ? { ...item, qty: String((Number(item.qty) || 0) + 1) } : item)) });
      toast.message("Produk sudah ada di template", { description: "Qty-nya ditambah 1." });
      return;
    }
    patchEditor({ items: [...editor.items, { key: nextItemKey(), productId: product.id, qty: "1", name: product.name, brand: product.brand, sku: product.sku }] });
  };

  const setItemQty = (key: string, qty: string) => {
    if (!editor) return;
    patchEditor({ items: editor.items.map((item) => (item.key === key ? { ...item, qty } : item)) });
  };

  const removeItem = (key: string) => {
    if (!editor) return;
    patchEditor({ items: editor.items.filter((item) => item.key !== key) });
  };

  const moveItem = (sourceKey: string, targetKey: string) => {
    setEditor((current) => {
      if (!current) return current;
      const items = [...current.items];
      const from = items.findIndex((item) => item.key === sourceKey);
      const to = items.findIndex((item) => item.key === targetKey);
      if (from < 0 || to < 0 || from === to) return current;
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...current, items };
    });
    setDirty(true);
  };

  // Drag lewat pointer events (mouse DAN sentuh -- HTML5 drag-and-drop tidak jalan di HP/tablet).
  const onGripDown = (event: React.PointerEvent<HTMLTableCellElement>, key: string) => {
    event.preventDefault();
    dragKeyRef.current = key;
    setDraggingKey(key);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onGripMove = (event: React.PointerEvent<HTMLTableCellElement>) => {
    const source = dragKeyRef.current;
    if (!source) return;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLTableRowElement>("tr[data-item-key]");
    const target = row?.dataset.itemKey;
    if (target && target !== source) moveItem(source, target);
  };
  const onGripUp = () => {
    dragKeyRef.current = null;
    setDraggingKey(null);
  };

  // ---------------- simpan / hapus ----------------
  const save = async () => {
    if (!editor || !branchId || !session || saving) return;
    const name = editor.name.trim();
    if (!name) { toast.error("Nama template wajib diisi."); return; }
    const parsed: Array<{ productId: string; qty: number }> = [];
    for (const item of editor.items) {
      const qty = Number(item.qty.replace(",", "."));
      if (!Number.isFinite(qty) || qty <= 0) { toast.error(`Qty "${item.name}" harus lebih dari 0.`); return; }
      parsed.push({ productId: item.productId, qty });
    }
    setSaving(true);
    try {
      let templateId = editor.templateId;
      if (!templateId) {
        const created = await createTemplate(branchId, name, session.user.id);
        templateId = created.id;
        setEditor((current) => (current ? { ...current, templateId } : current));
      }
      await updateTemplate(templateId, { name, description: editor.description });
      await replaceTemplateItems(templateId, parsed);
      toast.success("Template disimpan.", { description: `${name} · ${parsed.length} item` });
      setDirty(false);
      await reloadList();
      setEditor(null);
    } catch (err) {
      // State editor sengaja TIDAK dibuang -- kalau gagal (koneksi/RLS), isi yang sudah diketik masih ada & bisa dicoba simpan lagi.
      toast.error("Gagal menyimpan template.", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async () => {
    if (!editor?.templateId || saving) return;
    if (!window.confirm(`Hapus template "${editor.name}"? Penawaran yang sudah dibuat dari template ini tidak terpengaruh.`)) return;
    setSaving(true);
    try {
      await replaceTemplateItems(editor.templateId, []);
      await deleteTemplate(editor.templateId);
      toast.success("Template dihapus.");
      setDirty(false);
      await reloadList();
      setEditor(null);
    } catch (err) {
      toast.error("Gagal menghapus template.", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  // ---------------- turunan tampilan ----------------
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? catalog.filter((product) => `${product.name} ${product.brand} ${product.sku}`.toLowerCase().includes(q)) : catalog;
    return pool.slice(0, 30);
  }, [catalog, query]);

  const estimatedTotal = useMemo(
    () => (editor?.items ?? []).reduce((sum, item) => sum + (catalogById.get(item.productId)?.prices.reseller ?? 0) * (Number(item.qty.replace(",", ".")) || 0), 0),
    [editor, catalogById],
  );

  // ---------------- render ----------------
  if (loading) return <div style={{ minHeight: "50vh", display: "grid", placeItems: "center", color: "#707786" }}>Memuat template…</div>;
  if (loadError) return <div style={{ minHeight: "50vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", color: "#b23b2c" }}>{loadError}</div>;

  if (editor) {
    return (
      <div className="template-page-v3">
        <section className="single-template-editor">
          <button className="back-template-list" onClick={closeEditor}><ArrowLeft size={14} /> Semua Template</button>
          <div className="single-template-editor-head">
            <div>
              <p className="eyebrow">{editor.templateId ? "EDIT TEMPLATE" : "TEMPLATE BARU"}</p>
              <h1>{editor.name.trim() || "Template tanpa nama"}</h1>
              <p>Isi produk dan qty default. Harga tidak disimpan di template — selalu mengikuti price list cabang saat template dipakai di penawaran.</p>
            </div>
            <div>
              {editor.templateId && <button className="delete-template-button" onClick={removeTemplate} disabled={saving}><Trash2 size={14} /> Hapus template</button>}
              <button className="save-button" onClick={save} disabled={saving || editorLoading}>{saving ? <LoaderCircle className="spin-icon" size={16} /> : null}{saving ? "Menyimpan…" : "Simpan Template"}</button>
            </div>
          </div>

          <div className="single-template-card">
            <div className="single-template-meta">
              <label><span>NAMA TEMPLATE</span><input value={editor.name} onChange={(event) => patchEditor({ name: event.target.value })} placeholder="Mis. Paket 4 Kamera Indoor" /></label>
              <label><span>DESKRIPSI (OPSIONAL)</span><input value={editor.description} onChange={(event) => patchEditor({ description: event.target.value })} placeholder="Ringkasan singkat isi paket" /></label>
            </div>

            <div className="single-template-items">
              <header>
                <div><span>ISI TEMPLATE</span><h2>Daftar produk</h2></div>
                <p>{editor.items.length} item · geser ikon di kiri untuk mengurutkan</p>
              </header>

              {addOpen && (
                <div className="add-product-panel">
                  <label className="template-product-search">
                    <Search size={17} />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari produk, merk, atau SKU" autoFocus />
                  </label>
                  <div className="template-product-results">
                    {searchResults.map((product) => (
                      <button key={product.id} type="button" onClick={() => addProduct(product)}>
                        <span><strong>{product.name}</strong><small>{[product.brand, product.sku].filter(Boolean).join(" · ") || "—"}</small></span>
                        <Plus size={16} />
                      </button>
                    ))}
                    {searchResults.length === 0 && <p style={{ margin: 0, padding: "14px 13px", color: "#7a8799", fontSize: 12 }}>Tidak ada produk yang cocok.</p>}
                  </div>
                  <button type="button" className="close-add-product" onClick={() => setAddOpen(false)}>Tutup pencarian</button>
                </div>
              )}

              <div className="template-editor-table-wrap">
                <table className="template-items-table">
                  <colgroup><col className="drag-col" /><col className="number-col" /><col className="product-col" /><col className="quantity-col" /><col className="action-col" /></colgroup>
                  <thead><tr><th /><th>NO</th><th>PRODUK</th><th>QTY</th><th /></tr></thead>
                  <tbody>
                    {editor.items.map((item, index) => (
                      <tr key={item.key} data-item-key={item.key} className={draggingKey === item.key ? "is-dragging" : ""}>
                        <td
                          onPointerDown={(event) => onGripDown(event, item.key)}
                          onPointerMove={onGripMove}
                          onPointerUp={onGripUp}
                          onPointerCancel={onGripUp}
                          aria-label="Geser untuk mengurutkan"
                        ><GripVertical size={16} /></td>
                        <td>{index + 1}</td>
                        <td><strong>{item.name}</strong><small>{[item.brand, item.sku].filter(Boolean).join(" · ") || "—"}</small></td>
                        <td><input inputMode="decimal" value={item.qty} onChange={(event) => setItemQty(item.key, event.target.value)} aria-label={`Qty ${item.name}`} /></td>
                        <td><button type="button" onClick={() => removeItem(item.key)} aria-label={`Hapus ${item.name}`} style={{ color: "#b44d3e" }}><Trash2 size={15} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {editorLoading && <div className="template-empty"><span>Memuat isi template…</span></div>}
                {!editorLoading && editor.items.length === 0 && (
                  <div className="template-empty"><strong>Template masih kosong</strong><span>Klik &quot;Tambah produk&quot; untuk mengisi.</span></div>
                )}
              </div>

              {!addOpen && <button type="button" className="add-template-product" onClick={() => setAddOpen(true)}><Plus size={15} /> Tambah produk</button>}
            </div>

            <div className="single-template-footer">
              <div>
                <span>ESTIMASI NILAI (HARGA RESELLER DPP)</span>
                <strong>{formatIDR(estimatedTotal)}</strong>
                <small>{editor.items.length} item · harga aktual mengikuti basis harga di penawaran</small>
              </div>
              <section>
                <button className="outline-button" onClick={closeEditor} disabled={saving}>Batal</button>
                <button className="save-button" onClick={save} disabled={saving || editorLoading}>{saving ? "Menyimpan…" : "Simpan Template"}</button>
              </section>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="template-page-v3">
      <section className="template-list-screen">
        <div className="template-list-heading">
          <div>
            <p className="eyebrow">TEMPLATE PENAWARAN</p>
            <h1>Template</h1>
            <p>Paket produk siap pakai untuk mempercepat pembuatan ALT di penawaran. Setiap cabang punya daftar template sendiri.</p>
          </div>
          <div><button className="save-button" onClick={newTemplate}><Plus size={16} /> Template Baru</button></div>
        </div>

        <div className="template-list-card">
          <div className="template-list-card-head">
            <div><h2>Semua template</h2><p>Klik baris untuk mengisi atau mengubah isinya.</p></div>
            <span>{templates.length} template</span>
          </div>
          <p className="template-scroll-hint">Geser tabel ke samping untuk melihat semua kolom</p>
          <div className="template-list-table-wrap">
            <table className="template-list-table">
              <colgroup><col className="template-number-col" /><col className="template-name-col" /><col className="template-items-col" /><col className="template-action-col" /></colgroup>
              <thead><tr><th>NO</th><th>NAMA TEMPLATE</th><th>ISI</th><th /></tr></thead>
              <tbody>
                {templates.map((template, index) => {
                  const count = counts[template.id] ?? 0;
                  return (
                    <tr key={template.id} onClick={() => openTemplate(template)}>
                      <td>{index + 1}</td>
                      <td><strong>{template.name}</strong><small>{template.description || "Tanpa deskripsi"}</small></td>
                      <td>{count > 0 ? <><b>{count}</b> item</> : <span style={{ color: "#c17a2f", fontWeight: 700 }}>Masih kosong</span>}</td>
                      <td><span className="row-open-button"><ChevronRight size={16} /></span></td>
                    </tr>
                  );
                })}
                {templates.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: "34px 18px", textAlign: "center", color: "#8490a2" }}>Cabang ini belum punya template. Klik &quot;Template Baru&quot; untuk membuat.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Style reminder — i1 CCTV: the catalogue is read-only but operationally transparent;
 * sync status must be clear, compact, and never compete with the product table.
 *
 * PORTING NOTES (2026-09):
 * - Shell/sidebar/topbar bawaan Quote Builder DIBUANG di sini -- itu
 *   dobel sama sidebar/header app i1 Internal Tools yang udah ada.
 *   Konten intinya (hero, sync card, tabel katalog) dipertahankan APA
 *   ADANYA, termasuk semua className -- CSS-nya (ProductCatalogPage.css)
 *   sekarang dipasang GLOBAL lewat app/globals.css, bukan di-import di
 *   sini (Next.js gak bisa import CSS biasa di luar root layout).
 * - Link navigasi ke halaman lain (dulu <a href="/penawaran"> dst)
 *   dibuang -- pindah section sekarang lewat menu sidebar app kita
 *   (dropdown "Quote Builder"), bukan link internal.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, CheckCircle2, CircleAlert, Database, History, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useQuoteBuilderAccess } from "@/lib/quote-builder/auth";
import { listCatalog, listSyncBatches, triggerManualSync } from "@/lib/quote-builder/api";
import type { Product } from "@/lib/quote-builder/quoteTypes";
import type { SyncBatchRow } from "@/lib/quote-builder/database.types";

type SortKey = "name" | "brand" | "sku" | "net" | "reseller" | "special";

const formatIDR = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const formatDateTime = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export default function ProductCatalogPage() {
  const { branchId, isSuperAdmin } = useQuoteBuilderAccess();
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<SyncBatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [isSyncing, setIsSyncing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const reload = () => {
    if (!branchId) return;
    setLoading(true);
    Promise.all([listCatalog(branchId), listSyncBatches(branchId)])
      .then(([catalogRows, historyRows]) => { setProducts(catalogRows); setHistory(historyRows); setLoadError(null); })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [branchId]);

  const visible = useMemo(
    () =>
      [...products]
        .filter((product) => `${product.name} ${product.brand} ${product.sku}`.toLowerCase().includes(query.toLowerCase()))
        .sort((left, right) => {
          const a = sort.key === "net" || sort.key === "reseller" || sort.key === "special" ? left.prices[sort.key] : left[sort.key];
          const b = sort.key === "net" || sort.key === "reseller" || sort.key === "special" ? right.prices[sort.key] : right[sort.key];
          return (a > b ? 1 : a < b ? -1 : 0) * (sort.dir === "asc" ? 1 : -1);
        }),
    [products, query, sort],
  );

  const runSync = async () => {
    if (isSyncing || !branchId) return;
    setIsSyncing(true);
    try {
      await triggerManualSync(branchId);
      toast.success("Generate Sync Database selesai.");
      reload();
    } catch (err) {
      // Most likely cause on a fresh deploy: the "sync-price-list" Edge Function
      // hasn't been built/deployed yet — see the comment on triggerManualSync in lib/api.ts.
      toast.error("Sync gagal.", { description: (err as Error).message });
    } finally {
      setIsSyncing(false);
    }
  };

  const SortHead = ({ label, sortKey }: { label: string; sortKey: SortKey }) => <th><button className={sort.key === sortKey ? "sorted" : ""} onClick={() => setSort((current) => (current.key === sortKey ? { ...current, dir: current.dir === "asc" ? "desc" : "asc" } : { key: sortKey, dir: "asc" }))}>{label}<ArrowDownUp size={13} /></button></th>;
  const ProductRow = ({ product }: { product: Product }) => <tr><td><strong>{product.name}</strong></td><td><span className="catalog-brand">{product.brand}</span></td><td><code>{product.sku}</code></td><td><b>{formatIDR(product.prices.net)}</b></td><td><b>{formatIDR(product.prices.reseller)}</b></td><td><b>{formatIDR(product.prices.special)}</b></td></tr>;
  const lastSuccessful = history.find((run) => run.status === "success");

  return (
    <div className="catalog-page-v2">
      <section className="catalog-hero">
        <div>
          <p className="eyebrow">KATALOG PRODUK</p>
          <h1>Price List</h1>
          <p>Satu daftar harga cabang ini untuk melihat nilai Harga Online, Reseller, dan Special tanpa berpindah pilihan.</p>
        </div>
        <div className="sync-catalog-card">
          <Database size={19} />
          <div>
            <span>READ-ONLY · SUMBER PRICE LIST CABANG</span>
            <strong>{lastSuccessful ? `Sinkron terakhir ${formatDateTime(lastSuccessful.started_at)}` : "Belum ada sinkronisasi tercatat"}</strong>
            <small>{products.length} produk tersimpan</small>
          </div>
        </div>
      </section>
      <section className="sync-operation-card">
        <div>
          <div className="sync-operation-copy">
            <span>SINKRONISASI DATABASE</span>
            <h2>Perbarui katalog dari price list</h2>
            <p>Jalankan sinkronisasi manual ketika price list sudah diperbarui di sumbernya. Harga tetap hanya dapat diubah dari sumber aslinya (Google Sheet/Zoho), bukan dari halaman ini.</p>
          </div>
          {isSuperAdmin && (
            <div className="sync-operation-actions">
              <button className="outline-button" onClick={() => setHistoryOpen(true)}><History size={16} /> Riwayat Sync</button>
              <button className="save-button" onClick={runSync} disabled={isSyncing}>
                {isSyncing ? <LoaderCircle className="spin-icon" size={16} /> : <RefreshCw size={16} />}
                {isSyncing ? "Membuat sync…" : "Generate Sync Database"}
              </button>
            </div>
          )}
        </div>
        {lastSuccessful && <div className="sync-status-line"><CheckCircle2 size={16} /><span>Sinkronisasi terakhir berhasil — data katalog siap digunakan oleh penawaran baru.</span></div>}
      </section>
      {loadError && <div className="locked-notice" style={{ margin: "0 0 12px", color: "#b23b2c" }}>{loadError}</div>}
      <section className="catalog-card catalog-simple-card">
        <div className="catalog-card-head">
          <div>
            <h2>Daftar produk</h2>
            <p>Harga dikelola di sumber price list cabang; aplikasi ini hanya menampilkan data yang sudah tersinkron.</p>
          </div>
        </div>
        <div className="catalog-controls">
          <label className="list-search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari produk, merk, atau SKU" />
          </label>
          <span className="readonly-badge">{visible.length} produk aktif · 3 basis harga</span>
        </div>
        <div className="catalog-table-wrap">
          <table className="catalog-table catalog-price-table">
            <colgroup>
              <col className="product-col" /><col className="brand-col" /><col className="sku-col" />
              <col className="catalog-money-col" /><col className="catalog-money-col" /><col className="catalog-money-col" />
            </colgroup>
            <thead>
              <tr>
                <SortHead label="Produk" sortKey="name" />
                <SortHead label="Merk" sortKey="brand" />
                <SortHead label="SKU" sortKey="sku" />
                <SortHead label="Harga Online" sortKey="net" />
                <SortHead label="Reseller (DPP)" sortKey="reseller" />
                <SortHead label="Reseller Special" sortKey="special" />
              </tr>
            </thead>
            <tbody>{visible.map((product) => <ProductRow key={product.id} product={product} />)}</tbody>
          </table>
          {loading && <div className="catalog-foot"><span>Memuat katalog…</span></div>}
        </div>
        <div className="catalog-foot">
          <span>{visible.length} produk ditampilkan</span>
          <p><i /> Perubahan harga dilakukan di sumber price list, bukan di halaman ini</p>
        </div>
      </section>
      {historyOpen && (
        <div className="confirm-overlay">
          <section className="sync-history-modal">
            <header>
              <div>
                <span>RIWAYAT SINKRONISASI</span>
                <h2>Sync Database</h2>
                <p>Catatan hasil pembacaan price list ke database katalog.</p>
              </div>
              <button className="icon-button" onClick={() => setHistoryOpen(false)} aria-label="Tutup riwayat"><X size={17} /></button>
            </header>
            <div className="sync-history-list">
              {history.length === 0 && <p style={{ padding: 16, color: "#8b95a8", fontSize: 12 }}>Belum ada riwayat sinkronisasi untuk cabang ini.</p>}
              {history.map((run) => (
                <article key={run.id} className={run.status === "success" ? "sync-history-row success" : "sync-history-row failed"}>
                  {run.status === "success" ? <CheckCircle2 size={19} /> : <CircleAlert size={19} />}
                  <div>
                    <strong>{run.status} · {formatDateTime(run.started_at)}</strong>
                    <p>{run.error_summary ?? `Sumber: ${run.source_type}`}</p>
                  </div>
                  <span>{run.product_count ? `${run.product_count} produk` : "Tidak ada perubahan"}</span>
                </article>
              ))}
            </div>
            <footer><button className="outline-button" onClick={() => setHistoryOpen(false)}>Tutup</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}

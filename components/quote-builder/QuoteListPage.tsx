/**
 * Style reminder — i1 CCTV operational UI: white-blue surfaces, cobalt primary action,
 * large friendly radius, crisp sans typography, and dense but calm data presentation.
 *
 * PORTING NOTES (2026-09), sama persis prinsipnya kayak ProductCatalogPage.tsx:
 * - Shell/sidebar/topbar bawaan Quote Builder DIBUANG -- dobel sama
 *   sidebar/header app i1 Internal Tools yang udah ada. Konten intinya
 *   (hero, stat grid, tabel daftar) dipertahankan APA ADANYA termasuk
 *   semua className -- CSS-nya sudah global lewat app/globals.css.
 * - Navigasi ke halaman lain (dulu <a href="/penawaran/:id">,
 *   <a href="/penawaran/new">, window.location.href) diganti jadi 2
 *   callback prop (onOpenQuote/onNewQuote) -- QuoteBuilderModule yang
 *   mutusin mau ngapain (buka editor, atau -- untuk sekarang, karena
 *   editor-nya belum di-port -- kasih tau lewat toast).
 * - useMobileSidebar() dibuang -- itu cuma buat sidebar kloningan Quote
 *   Builder yang sudah kita buang juga (lihat app-shell/app-sidebar).
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, CalendarDays, CheckCircle2, CircleAlert, FilePenLine, Plus, Search, X } from "lucide-react";
import { useQuoteBuilderAccess } from "@/lib/quote-builder/auth";
import { listAllQuotes, listQuotesForBranch, softDeleteQuote, type QuoteWithTotal } from "@/lib/quote-builder/api";
import { grandTotalFor } from "@/lib/quote-builder/pricing";
import type { QuoteStatus } from "@/lib/quote-builder/database.types";

type SortKey = "code" | "customer" | "createdAt" | "total" | "status" | "updated";

const formatCurrency = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const formatDate = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
const formatDateTime = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const statusMeta: Record<QuoteStatus, { label: string; helper: string; className: string }> = {
  draft: { label: "Draft", helper: "Sedang disusun", className: "status-draft" },
  in_review: { label: "In Review", helper: "Menunggu keputusan", className: "status-in-review" },
  confirmed: { label: "Confirmed", helper: "Siap dikirim", className: "status-confirmed" },
  needs_revision: { label: "Needs Revision", helper: "Perlu diperbaiki", className: "status-needs-revision" },
  sent: { label: "Sent", helper: "Terkirim ke pelanggan", className: "status-sent" },
};

function presetRange(preset: "today" | "week" | "month") {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === "today") return [iso(now), iso(now)];
  if (preset === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return [iso(start), iso(end)];
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [iso(start), iso(end)];
}

type QuoteListPageProps = {
  onOpenQuote: (quoteId: string) => void;
  onNewQuote: () => void;
};

export default function QuoteListPage({ onOpenQuote, onNewQuote }: QuoteListPageProps) {
  const { branchId, isSuperAdmin, hasAccess, loading: authLoading } = useQuoteBuilderAccess();
  const [quotes, setQuotes] = useState<QuoteWithTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | QuoteStatus>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
  const [deleting, setDeleting] = useState<QuoteWithTotal | null>(null);

  useEffect(() => {
    if (!hasAccess) {
      // 2026-09-14: sebelumnya `return` diam-diam di sini juga bikin
      // `loading` (default true) gak pernah di-set false kalau
      // hasAccess ternyata false -- spinner "Memuat penawaran..."
      // muter selamanya tanpa pesan. Sama kelasnya kayak bug
      // branchId di QuoteEditorPage.tsx.
      setLoadError("Akun kamu tidak punya akses ke Daftar Penawaran (butuh role admin atau super_admin).");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const request = isSuperAdmin ? listAllQuotes() : branchId ? listQuotesForBranch(branchId) : Promise.resolve([]);
    request
      .then((rows) => { if (!cancelled) { setQuotes(rows); setLoadError(null); } })
      .catch((err: Error) => { if (!cancelled) setLoadError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hasAccess, isSuperAdmin, branchId]);

  const withTotal = useMemo(() => quotes.map((q) => ({ ...q, total: grandTotalFor(q.alternatives) })), [quotes]);

  const filtered = useMemo(
    () =>
      withTotal.filter(
        (quote) =>
          `${quote.internal_code ?? ""} ${quote.client_name} ${quote.project_name}`.toLowerCase().includes(query.toLowerCase()) &&
          (status === "all" || quote.status === status) &&
          (!from || quote.created_at.slice(0, 10) >= from) &&
          (!to || quote.created_at.slice(0, 10) <= to),
      ),
    [withTotal, query, status, from, to],
  );

  const shown = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const key = sort.key;
        const left = key === "total" ? a.total : key === "code" ? a.internal_code ?? "" : key === "customer" ? a.client_name : key === "createdAt" ? a.created_at : key === "status" ? a.status : a.updated_at;
        const right = key === "total" ? b.total : key === "code" ? b.internal_code ?? "" : key === "customer" ? b.client_name : key === "createdAt" ? b.created_at : key === "status" ? b.status : b.updated_at;
        return (left > right ? 1 : left < right ? -1 : 0) * (sort.dir === "asc" ? 1 : -1);
      }),
    [filtered, sort],
  );

  const hasDateRange = Boolean(from || to);
  const totalValue = hasDateRange ? filtered.reduce((sum, quote) => sum + quote.total, 0) : 0;
  const activeFilter = Boolean(status !== "all" || from || to);
  const setPreset = (value: "today" | "week" | "month") => { const [start, end] = presetRange(value); setFrom(start); setTo(end); };
  const clearFilters = () => { setStatus("all"); setFrom(""); setTo(""); };
  const toggleSort = (key: SortKey) => setSort((current) => (current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const removeQuote = async () => {
    if (!deleting) return;
    try {
      await softDeleteQuote(deleting.id);
      setQuotes((current) => current.filter((quote) => quote.id !== deleting.id));
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setDeleting(null);
    }
  };

  const stats = [
    { label: "Aktif", value: quotes.length, icon: FilePenLine, tone: "" },
    { label: "In Review", value: quotes.filter((q) => q.status === "in_review").length, icon: CircleAlert, tone: "amber" },
    { label: "Needs Revision", value: quotes.filter((q) => q.status === "needs_revision").length, icon: CircleAlert, tone: "terra" },
    { label: "Sent", value: quotes.filter((q) => q.status === "sent").length, icon: CheckCircle2, tone: "green" },
  ];

  const Column = ({ label, value }: { label: string; value: SortKey }) => (
    <th className={value === "updated" ? "quote-updated-head" : undefined}>
      <button className={sort.key === value ? "sorted" : ""} onClick={() => toggleSort(value)}>
        {value === "createdAt" ? "Tanggal dibuat" : value === "updated" ? "Terakhir diperbarui" : label}
        <ArrowDownUp size={12} />
      </button>
    </th>
  );

  if (authLoading) return null;

  return (
    <div className="quote-list-shell">
      <main className="quote-workspace list-workspace">
        <section className="list-hero compact-list-hero">
          <div>
            <p className="eyebrow">PENAWARAN</p>
            <h1>Daftar Penawaran</h1>
            <p>{isSuperAdmin ? "Menampilkan penawaran seluruh cabang." : "Menampilkan penawaran cabang Anda."} Klik satu baris untuk membuka Detail Penawaran.</p>
          </div>
        </section>
        <section className="quote-stat-grid compact-stats">
          {stats.map(({ label, value, icon: Icon, tone }) => (
            <article key={label}><span className={tone}><Icon size={16} /></span><strong>{value}</strong><p>{label}</p></article>
          ))}
        </section>
        {loadError && <div className="locked-notice" style={{ margin: "0 28px 12px", color: "#b23b2c" }}>{loadError}</div>}
        <section className="quote-list-card">
          <div className="list-card-head">
            <div><h2>Semua penawaran</h2><p>Klik satu baris untuk membuka Detail Penawaran.</p></div>
            <button className="save-button list-new-quote" onClick={onNewQuote}><Plus size={16} /> Tambah Penawaran</button>
          </div>
          <div className="list-tool-row">
            <label className="list-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kode, pelanggan, atau proyek" /></label>
            <button className={`filter-button ${activeFilter ? "active" : ""}`} onClick={() => setFilterOpen((value) => !value)}><CalendarDays size={16} /> Filter{activeFilter && <b>•</b>}</button>
          </div>
          {filterOpen && (
            <section className="filter-popover">
              <div className="filter-popover-head">
                <div><strong>Filter penawaran</strong><span>Rentang tanggal dibuat dan status</span></div>
                {activeFilter && <button onClick={clearFilters}><X size={14} /> Reset</button>}
              </div>
              <div className="filter-control-grid">
                <label><span>TANGGAL MULAI</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
                <label><span>TANGGAL AKHIR</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
                <div><span>RENTANG CEPAT</span><div className="time-presets">{(["today", "week", "month"] as const).map((value) => <button key={value} onClick={() => setPreset(value)}>{value === "today" ? "Hari ini" : value === "week" ? "Minggu ini" : "Bulan ini"}</button>)}</div></div>
                <div><span>STATUS</span><select value={status} onChange={(event) => setStatus(event.target.value as "all" | QuoteStatus)}><option value="all">Semua status</option><option value="draft">Draft</option><option value="in_review">In Review</option><option value="confirmed">Confirmed</option><option value="needs_revision">Needs Revision</option><option value="sent">Sent</option></select></div>
              </div>
            </section>
          )}
          <div className="list-total-strip">
            <div><span>HASIL FILTER</span><strong>{filtered.length} penawaran</strong></div>
            {hasDateRange && <div><span>TOTAL NILAI PENAWARAN</span><b>{formatCurrency(totalValue)}</b><small>berdasarkan rentang tanggal</small></div>}
          </div>
          <div className="quote-table-wrap">
            <table className="quote-list-table concise-list-table">
              <thead><tr><Column label="Penawaran" value="code" /><Column label="Pelanggan" value="customer" /><Column label="Dibuat" value="createdAt" /><Column label="Nilai" value="total" /><Column label="Status" value="status" /><Column label="Terakhir diubah" value="updated" /></tr></thead>
              <tbody>
                {shown.map((quote) => {
                  const info = statusMeta[quote.status];
                  return (
                    <tr key={quote.id} className="quote-row-clickable" onClick={() => onOpenQuote(quote.id)}>
                      <td><div className="quote-name"><strong>{quote.internal_code ?? "—"}</strong><span>{quote.project_name}</span></div></td>
                      <td><div className="customer-cell"><span>{quote.client_name.slice(0, 1)}</span><div><strong>{quote.client_name}</strong></div></div></td>
                      <td>{formatDate(quote.created_at)}</td>
                      <td><strong className="table-money">{formatCurrency(quote.total)}</strong></td>
                      <td><div className={`status-stamp ${info.className}`}><span /><div><strong>{info.label}</strong><small>{info.helper}</small></div></div></td>
                      <td>{formatDateTime(quote.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && shown.length === 0 && <div className="quote-empty"><Search size={22} /><strong>Tidak ada penawaran yang cocok.</strong><span>Ubah pencarian atau reset filter untuk melihat data lain.</span></div>}
            {loading && <div className="quote-empty"><strong>Memuat penawaran…</strong></div>}
          </div>
        </section>
      </main>
      {deleting && (
        <div className="confirm-overlay" role="presentation">
          <section className="confirm-dialog" role="dialog" aria-modal="true">
            <h2>Hapus penawaran?</h2>
            <p><strong>{deleting.internal_code}</strong> untuk {deleting.client_name} akan dihapus (arsip, bisa dipulihkan Super Admin).</p>
            <div><button className="outline-button" onClick={() => setDeleting(null)}>Batal</button><button className="delete-confirm" onClick={removeQuote}>Hapus penawaran</button></div>
          </section>
        </div>
      )}
    </div>
  );
}

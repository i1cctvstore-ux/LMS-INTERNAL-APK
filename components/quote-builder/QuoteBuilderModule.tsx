"use client";

// =====================================================
// Wrapper Quote Builder -- pola sama persis kayak KasModule/ServisModule:
// 1 komponen, dibedain lewat prop `section`, biar bisa dipanggil dari
// beberapa menu sidebar yang beda.
//
//   "list"     -> Daftar Penawaran (+ editor penawaran, state lokal)
//   "template" -> Template Penawaran
//   "katalog"  -> Katalog Produk (price list)
//   "cabang"   -> Info Cabang (kop surat: nama toko, alamat, email, logo)
//
// TEMPLATE DIPAKAI DI DAFTAR PENAWARAN, 2 jalan:
//   (a) Daftar Penawaran > "Penawaran Baru" -> dialog "Penawaran kosong /
//       pilih template" (NewQuoteChooser di bawah). Kalau cabang belum punya
//       template berisi, dialog dilewati & langsung buka penawaran kosong.
//   (b) Template Penawaran > buka template > "Pakai di Penawaran" -> pindah
//       ke Daftar Penawaran dengan penawaran baru yang terisi template itu.
// Editor menerima `initialTemplateId` -> ALT 1 terisi item template.
//
// Keempatnya jadi sub-menu di folder sidebar "Penawaran" (pola sama kayak
// folder "Kas"). Cabang yang dipilih Super Admin SALING SINKRON antar
// sub-menu: state-nya hidup di komponen ini (dipakai bersama), dan
// diingat juga di sessionStorage supaya tetap sama walau pindah ke menu
// lain (Dashboard, Stok, dst) lalu kembali.
//
// 3 tugas wrapper ini:
//  1. <AuthProvider> -- nyediain useAuth()/useQuoteBuilderAccess() ke
//     semua halaman Quote Builder di bawahnya, isinya dari props (bukan
//     fetch session sendiri -- auth udah diselesain di app/page.tsx).
//  2. <div className="qb-root"> -- WAJIB ada, ini yang bikin CSS Quote
//     Builder (app/globals.css, di-scope pakai .qb-root) bisa kepakai.
//  3. (2026-09) PILIH CABANG, sama kayak menu Kas: Super Admin lihat tab
//     per cabang, semua data (penawaran, katalog, template, info kop)
//     terpisah per cabang yang lagi dipilih. Admin cabang terkunci ke
//     cabangnya sendiri (tanpa tab).
//
//     Triknya: cabang aktif dimasukkan ke AuthProvider sebagai
//     `currentUserBranchId`, jadi SEMUA halaman yang sudah manggil
//     useQuoteBuilderAccess().branchId otomatis ikut cabang terpilih --
//     tanpa perlu ngoper prop ke tiap halaman. Catatan: `branchId` dari
//     hook itu SEKARANG artinya "cabang yang lagi aktif", bukan lagi
//     "branch_id di profil akun" (buat admin cabang keduanya sama).
//
// `editingQuoteId` nyimpen 3 kemungkinan:
//   - null       -> tampilin QuoteListPage
//   - "new"      -> tampilin QuoteEditorPage mode "penawaran baru"
//   - <uuid>     -> tampilin QuoteEditorPage mode edit penawaran itu
// QuoteDetailPage (lihat detail tanpa langsung edit) BELUM di-port --
// klik baris di daftar langsung buka editor buat sekarang.
// =====================================================

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Role } from "@/lib/supabase/types";
import { AuthProvider } from "@/lib/quote-builder/auth";
import { getTemplateItemCounts, listBranches, listTemplates } from "@/lib/quote-builder/api";
import type { PageKey } from "@/lib/nav-config";
import type { BranchRow, TemplateRow } from "@/lib/quote-builder/database.types";
import ProductCatalogPage from "./ProductCatalogPage";
import QuoteListPage from "./QuoteListPage";
import QuoteEditorPage from "./QuoteEditorPage";
import TemplateLibraryPage from "./TemplateLibraryPage";
import BranchInfoPage from "./BranchInfoPage";

export type QuoteBuilderSection = "list" | "template" | "katalog" | "cabang";

type QuoteBuilderModuleProps = {
  section: QuoteBuilderSection;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: Role;
  currentUserBranchId: string | null;
  /** Pindah menu sidebar (dipakai "Pakai di Penawaran" di halaman Template -> Daftar Penawaran). */
  onNavigate?: (page: PageKey) => void;
};

type BranchOption = { id: string; name: string };

// Cabang terakhir yang dipilih Super Admin (per tab browser) -- dibaca semua sub-menu Penawaran.
const ACTIVE_BRANCH_KEY = "qb-active-branch";

export default function QuoteBuilderModule({
  section,
  currentUserId,
  currentUserName,
  currentUserRole,
  currentUserBranchId,
  onNavigate,
}: QuoteBuilderModuleProps) {
  const isSuperAdmin = currentUserRole === "super_admin";
  const [editingQuoteId, setEditingQuoteId] = useState<string | "new" | null>(null);
  // Template yang dipakai untuk penawaran BARU yang sedang dibuka (null = kosong).
  const [newQuoteTemplateId, setNewQuoteTemplateId] = useState<string | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  // Naik tiap kali penawaran baru dimulai -> editor di-mount ulang (template baru benar-benar terpakai,
  // walau sebelumnya sudah ada penawaran baru yang terbuka).
  const [editorKey, setEditorKey] = useState(0);

  const startNewQuote = (templateId: string | null) => {
    setNewQuoteTemplateId(templateId);
    setEditorKey((current) => current + 1);
    setEditingQuoteId("new");
    setChooserOpen(false);
  };

  // Dari halaman Template: buka Daftar Penawaran dengan penawaran baru terisi template.
  const startFromTemplate = (templateId: string) => {
    if (editingQuoteId !== null && !window.confirm("Ada penawaran yang sedang dibuka di Daftar Penawaran. Perubahan yang belum disimpan akan hilang. Lanjut?")) return;
    startNewQuote(templateId);
    onNavigate?.("qb-daftar");
  };
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(isSuperAdmin);
  const [branchError, setBranchError] = useState<string | null>(null);
  // Admin cabang langsung terkunci ke cabangnya. Super Admin: diisi setelah
  // daftar cabang dimuat (cabang profilnya kalau ada, kalau tidak cabang pertama).
  const [activeBranchId, setActiveBranchId] = useState<string | null>(isSuperAdmin ? null : currentUserBranchId);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    listBranches()
      .then((rows) => {
        if (cancelled) return;
        const active = (rows as Array<BranchRow & { active?: boolean }>)
          .filter((branch) => branch.active !== false)
          .map((branch) => ({ id: branch.id, name: branch.name }));
        setBranches(active);
        let remembered: string | null = null;
        try { remembered = window.sessionStorage.getItem(ACTIVE_BRANCH_KEY); } catch { /* storage bisa diblokir -- abaikan */ }
        setActiveBranchId((current) =>
          current ??
          (active.find((b) => b.id === remembered)?.id ?? active.find((b) => b.id === currentUserBranchId)?.id ?? active[0]?.id ?? null),
        );
      })
      .catch((err: Error) => { if (!cancelled) setBranchError(err.message); })
      .finally(() => { if (!cancelled) setLoadingBranches(false); });
    return () => { cancelled = true; };
  }, [isSuperAdmin, currentUserBranchId]);

  const activeBranch = branches.find((branch) => branch.id === activeBranchId) ?? null;
  const isEditing = section === "list" && editingQuoteId !== null;

  const centered = (content: string, tone: "normal" | "error" = "normal") => (
    <div className="qb-root">
      <div style={{ minHeight: "50vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", color: tone === "error" ? "#b23b2c" : "#707786", fontSize: 14 }}>
        <p style={{ maxWidth: 360, margin: 0 }}>{content}</p>
      </div>
    </div>
  );

  if (loadingBranches) {
    return (
      <div className="qb-root">
        <div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#707786", fontSize: 14 }}>
          <Loader2 size={16} className="animate-spin" /> Memuat data cabang…
        </div>
      </div>
    );
  }
  if (branchError) return centered(`Gagal memuat daftar cabang: ${branchError}`, "error");
  if (!activeBranchId) {
    return centered(
      isSuperAdmin
        ? "Belum ada cabang aktif. Tambah cabang dulu lewat menu Kelola Cabang."
        : "Akun Anda belum di-assign ke cabang mana pun. Hubungi Super Admin dulu sebelum bisa memakai Penawaran.",
    );
  }

  const switchBranch = (branchId: string) => {
    if (branchId === activeBranchId) return;
    setEditingQuoteId(null);
    setNewQuoteTemplateId(null);
    setChooserOpen(false);
    setActiveBranchId(branchId);
    try { window.sessionStorage.setItem(ACTIVE_BRANCH_KEY, branchId); } catch { /* abaikan */ }
  };

  return (
    <AuthProvider
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      currentUserRole={currentUserRole}
      currentUserBranchId={activeBranchId}
    >
      <div className="qb-root">
        {/* Tab cabang -- hanya Super Admin, disembunyikan saat editor penawaran terbuka
            (di editor, nama cabang sudah tampil di "Harga live · price list cabang ..."). */}
        {isSuperAdmin && branches.length > 0 && !isEditing && (
          <div style={{ padding: "16px 20px 0" }}>
            <div
              role="tablist"
              aria-label="Pilih cabang"
              style={{ display: "flex", gap: 4, overflowX: "auto", padding: 4, borderRadius: 14, background: "#eef0f5" }}
            >
              {branches.map((branch) => {
                const selected = branch.id === activeBranchId;
                return (
                  <button
                    key={branch.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => switchBranch(branch.id)}
                    style={{
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                      padding: "8px 16px",
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 700,
                      color: selected ? "#171b26" : "#707786",
                      background: selected ? "#fff" : "transparent",
                      boxShadow: selected ? "0 1px 3px rgba(23,27,38,.12)" : "none",
                    }}
                  >
                    {branch.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* key={activeBranchId}: pindah cabang = semua halaman di bawah di-mount ulang dari nol,
            jadi tidak ada data cabang lama yang nyangkut. */}
        <div key={activeBranchId}>
          {section === "katalog" && <ProductCatalogPage />}
          {section === "cabang" && <BranchInfoPage branchName={activeBranch?.name ?? null} />}
          {section === "template" && <TemplateLibraryPage onUseTemplate={startFromTemplate} />}
          {section === "list" && editingQuoteId === null && (
            <QuoteListPage onOpenQuote={(id) => setEditingQuoteId(id)} onNewQuote={() => setChooserOpen(true)} />
          )}
          {section === "list" && editingQuoteId !== null && (
            <QuoteEditorPage
              key={editorKey}
              quoteId={editingQuoteId === "new" ? null : editingQuoteId}
              branchId={activeBranchId}
              initialTemplateId={editingQuoteId === "new" ? newQuoteTemplateId : null}
              onBack={() => { setEditingQuoteId(null); setNewQuoteTemplateId(null); }}
              onDraftCreated={(id) => { setEditingQuoteId(id); setNewQuoteTemplateId(null); }}
            />
          )}
          {section === "list" && editingQuoteId === null && chooserOpen && (
            <NewQuoteChooser branchId={activeBranchId} onPick={startNewQuote} onClose={() => setChooserOpen(false)} />
          )}
        </div>
      </div>
    </AuthProvider>
  );
}

// -----------------------------------------------------
// Dialog "Penawaran Baru": mulai dari kosong atau dari template cabang ini.
// Kalau cabang belum punya template yang berisi, dialog dilewati (langsung kosong).
// -----------------------------------------------------
function NewQuoteChooser({ branchId, onPick, onClose }: { branchId: string; onPick: (templateId: string | null) => void; onClose: () => void }) {
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listTemplates(branchId);
        const itemCounts = await getTemplateItemCounts(rows.map((row) => row.id));
        if (cancelled) return;
        if (!rows.some((row) => (itemCounts[row.id] ?? 0) > 0)) { onPick(null); return; }
        setCounts(itemCounts);
        setTemplates(rows);
      } catch {
        if (!cancelled) onPick(null); // template gagal dimuat -> jangan halangi bikin penawaran
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  if (!templates) return null; // sebentar saja (memuat) -- tidak perlu spinner

  const optionStyle = { display: "grid", gap: 3, width: "100%", padding: "12px 14px", border: "1px solid #dfe5ed", borderRadius: 12, background: "#fff", textAlign: "left" } as const;

  return (
    <div
      onMouseDown={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", padding: 20, background: "rgba(21,29,43,.38)" }}
    >
      <section
        role="dialog"
        aria-label="Penawaran baru"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, maxHeight: "85vh", overflowY: "auto", padding: 22, borderRadius: 20, background: "#fff", boxShadow: "0 24px 60px rgba(21,29,43,.25)" }}
      >
        <h2 style={{ margin: "0 0 4px", fontSize: 18, color: "#182641" }}>Penawaran baru</h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#718099" }}>Mulai dari penawaran kosong, atau pakai template cabang ini.</p>

        <button type="button" onClick={() => onPick(null)} style={{ ...optionStyle, borderColor: "#4f46e5", background: "#eef2ff", marginBottom: 14 }}>
          <strong style={{ fontSize: 14, color: "#312e81" }}>Penawaran kosong</strong>
          <small style={{ color: "#6d7d99" }}>Isi produk sendiri dari awal.</small>
        </button>

        <p style={{ margin: "0 0 8px", fontSize: 10, fontWeight: 800, letterSpacing: ".09em", color: "#78859a" }}>ATAU PAKAI TEMPLATE</p>
        <div style={{ display: "grid", gap: 8 }}>
          {templates.map((template) => {
            const count = counts[template.id] ?? 0;
            const empty = count === 0;
            return (
              <button
                key={template.id}
                type="button"
                disabled={empty}
                onClick={() => onPick(template.id)}
                style={{ ...optionStyle, opacity: empty ? 0.55 : 1, cursor: empty ? "not-allowed" : "pointer" }}
              >
                <strong style={{ fontSize: 14, color: "#1f2d47" }}>{template.name}</strong>
                <small style={{ color: empty ? "#c17a2f" : "#6d7d99" }}>{empty ? "Masih kosong — isi dulu di menu Template Penawaran" : `${count} item${template.description ? ` · ${template.description}` : ""}`}</small>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 999, border: "1px solid #dfe5ed", background: "#fff", fontSize: 13, fontWeight: 700, color: "#4b5566" }}>Batal</button>
        </div>
      </section>
    </div>
  );
}

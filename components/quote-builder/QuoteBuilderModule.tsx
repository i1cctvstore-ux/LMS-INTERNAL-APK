"use client";

// =====================================================
// Wrapper Quote Builder -- pola sama persis kayak KasModule/ServisModule:
// 1 komponen, dibedain lewat prop `section`, biar bisa dipanggil dari
// beberapa menu sidebar yang beda.
//
//   "list"     -> Daftar Penawaran (+ editor penawaran, state lokal)
//   "katalog"  -> Katalog Produk (price list)
//   "template" -> Template Penawaran
//   "cabang"   -> Info Cabang (kop surat: nama toko, alamat, email, logo)
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
import { listBranches } from "@/lib/quote-builder/api";
import type { BranchRow } from "@/lib/quote-builder/database.types";
import ProductCatalogPage from "./ProductCatalogPage";
import QuoteListPage from "./QuoteListPage";
import QuoteEditorPage from "./QuoteEditorPage";
import TemplateLibraryPage from "./TemplateLibraryPage";
import BranchInfoPage from "./BranchInfoPage";

export type QuoteBuilderSection = "list" | "katalog" | "template" | "cabang";

type QuoteBuilderModuleProps = {
  section: QuoteBuilderSection;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: Role;
  currentUserBranchId: string | null;
};

type BranchOption = { id: string; name: string };

export default function QuoteBuilderModule({
  section,
  currentUserId,
  currentUserName,
  currentUserRole,
  currentUserBranchId,
}: QuoteBuilderModuleProps) {
  const isSuperAdmin = currentUserRole === "super_admin";
  const [editingQuoteId, setEditingQuoteId] = useState<string | "new" | null>(null);
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
        setActiveBranchId((current) => current ?? (active.find((b) => b.id === currentUserBranchId)?.id ?? active[0]?.id ?? null));
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
    setActiveBranchId(branchId);
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
          {section === "template" && <TemplateLibraryPage />}
          {section === "cabang" && <BranchInfoPage branchName={activeBranch?.name ?? null} />}
          {section === "list" && editingQuoteId === null && (
            <QuoteListPage onOpenQuote={(id) => setEditingQuoteId(id)} onNewQuote={() => setEditingQuoteId("new")} />
          )}
          {section === "list" && editingQuoteId !== null && (
            <QuoteEditorPage
              quoteId={editingQuoteId === "new" ? null : editingQuoteId}
              branchId={activeBranchId}
              onBack={() => setEditingQuoteId(null)}
              onDraftCreated={(id) => setEditingQuoteId(id)}
            />
          )}
        </div>
      </div>
    </AuthProvider>
  );
}

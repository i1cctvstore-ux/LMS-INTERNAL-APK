"use client";

// =====================================================
// Wrapper Quote Builder -- pola sama persis kayak KasModule/ServisModule:
// 1 komponen, dibedain lewat prop `section`, biar bisa dipanggil dari
// beberapa menu sidebar yang beda (nanti: "Daftar Penawaran", "Katalog
// Produk", "Template Penawaran").
//
// 2 tugas wrapper ini:
//  1. <AuthProvider> -- nyediain useAuth()/useQuoteBuilderAccess() ke
//     semua halaman Quote Builder di bawahnya, isinya dari props (bukan
//     fetch session sendiri -- auth udah diselesain di app/page.tsx).
//  2. <div className="qb-root"> -- WAJIB ada, ini yang bikin CSS Quote
//     Builder (quote-builder-styles.css, di-scope pakai .qb-root) bisa
//     kepakai. Kalau lupa bungkus ini, semua halaman Quote Builder
//     bakal tampil TANPA styling sama sekali.
//
// Baru "katalog" yang udah di-port & bisa dipakai sekarang -- "list"
// (Daftar Penawaran) dan "template" (Template Penawaran) nunggu
// halaman-halaman itu di-port juga.
// =====================================================

import type { Role } from "@/lib/supabase/types";
import { AuthProvider } from "@/lib/quote-builder/auth";
import ProductCatalogPage from "./ProductCatalogPage";

export type QuoteBuilderSection = "katalog"; // nanti nambah "list" | "template"

type QuoteBuilderModuleProps = {
  section: QuoteBuilderSection;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: Role;
  currentUserBranchId: string | null;
};

export default function QuoteBuilderModule({
  section,
  currentUserId,
  currentUserName,
  currentUserRole,
  currentUserBranchId,
}: QuoteBuilderModuleProps) {
  return (
    <AuthProvider
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      currentUserRole={currentUserRole}
      currentUserBranchId={currentUserBranchId}
    >
      <div className="qb-root">{section === "katalog" && <ProductCatalogPage />}</div>
    </AuthProvider>
  );
}

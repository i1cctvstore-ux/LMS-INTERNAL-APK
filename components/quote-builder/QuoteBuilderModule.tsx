"use client";

// =====================================================
// Wrapper Quote Builder -- pola sama persis kayak KasModule/ServisModule:
// 1 komponen, dibedain lewat prop `section`, biar bisa dipanggil dari
// beberapa menu sidebar yang beda ("Daftar Penawaran", "Katalog
// Produk", nanti "Template Penawaran").
//
// 2 tugas wrapper ini:
//  1. <AuthProvider> -- nyediain useAuth()/useQuoteBuilderAccess() ke
//     semua halaman Quote Builder di bawahnya, isinya dari props (bukan
//     fetch session sendiri -- auth udah diselesain di app/page.tsx).
//  2. <div className="qb-root"> -- WAJIB ada, ini yang bikin CSS Quote
//     Builder (app/globals.css, di-scope pakai .qb-root) bisa kepakai.
//     Kalau lupa bungkus ini, semua halaman Quote Builder bakal tampil
//     TANPA styling sama sekali.
//
// "katalog" & "list" (Daftar Penawaran) udah di-port & bisa dipakai
// sekarang. "template" (Template Penawaran) nunggu halamannya di-port.
//
// 2026-09: "list" butuh 2 callback (buka penawaran / bikin baru) yang
// SEHARUSNYA membuka halaman editor (Home.tsx yang di-port) -- tapi
// editor itu BELUM di-port (baru "Daftar Penawaran" & "Katalog Produk"
// yang jadi). Untuk sekarang kedua callback itu cuma kasih tau lewat
// toast bahwa fiturnya nyusul, BUKAN error diam-diam -- ganti isi
// handleOpenQuote/handleNewQuote di bawah begitu editor-nya di-port.
// =====================================================

import { toast } from "sonner";
import type { Role } from "@/lib/supabase/types";
import { AuthProvider } from "@/lib/quote-builder/auth";
import ProductCatalogPage from "./ProductCatalogPage";
import QuoteListPage from "./QuoteListPage";

export type QuoteBuilderSection = "list" | "katalog"; // nanti nambah "template"

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
  // TODO(editor): ganti 2 handler ini begitu halaman editor (Home.tsx
  // yang di-port) sudah ada -- buka editor dengan quoteId (existing)
  // atau tanpa quoteId (draft baru), bukan toast.
  const handleOpenQuote = (_quoteId: string) => {
    toast.info("Halaman detail/edit penawaran belum di-port -- nyusul.");
  };
  const handleNewQuote = () => {
    toast.info("Halaman bikin penawaran baru belum di-port -- nyusul.");
  };

  return (
    <AuthProvider
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      currentUserRole={currentUserRole}
      currentUserBranchId={currentUserBranchId}
    >
      <div className="qb-root">
        {section === "katalog" && <ProductCatalogPage />}
        {section === "list" && <QuoteListPage onOpenQuote={handleOpenQuote} onNewQuote={handleNewQuote} />}
      </div>
    </AuthProvider>
  );
}

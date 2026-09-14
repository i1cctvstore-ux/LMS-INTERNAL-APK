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
// "katalog", "list" (Daftar Penawaran), & sekarang editor penawaran-nya
// (buat/edit) udah di-port & bisa dipakai. "template" (Template
// Penawaran) masih nunggu halamannya di-port.
//
// 2026-09: section "list" sekarang punya sub-navigasi INTERNAL (bukan
// dari nav-config/page.tsx) -- persis pola StockOpnamePage (daftar sesi
// vs detail sesi dalam 1 komponen, state lokal, bukan route Next.js).
// `editingQuoteId` di bawah nyimpen 3 kemungkinan:
//   - null       -> tampilin QuoteListPage
//   - "new"      -> tampilin QuoteEditorPage mode "penawaran baru"
//   - <uuid>     -> tampilin QuoteEditorPage mode edit penawaran itu
// QuoteDetailPage (lihat detail tanpa langsung edit) BELUM di-port --
// klik baris di daftar langsung buka editor buat sekarang.
// =====================================================

import { useState } from "react";
import type { Role } from "@/lib/supabase/types";
import { AuthProvider } from "@/lib/quote-builder/auth";
import ProductCatalogPage from "./ProductCatalogPage";
import QuoteListPage from "./QuoteListPage";
import QuoteEditorPage from "./QuoteEditorPage";

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
  const [editingQuoteId, setEditingQuoteId] = useState<string | "new" | null>(null);

  return (
    <AuthProvider
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      currentUserRole={currentUserRole}
      currentUserBranchId={currentUserBranchId}
    >
      <div className="qb-root">
        {section === "katalog" && <ProductCatalogPage />}
        {section === "list" && editingQuoteId === null && (
          <QuoteListPage onOpenQuote={(id) => setEditingQuoteId(id)} onNewQuote={() => setEditingQuoteId("new")} />
        )}
        {section === "list" && editingQuoteId !== null && (
          <QuoteEditorPage
            quoteId={editingQuoteId === "new" ? null : editingQuoteId}
            onBack={() => setEditingQuoteId(null)}
            onDraftCreated={(id) => setEditingQuoteId(id)}
          />
        )}
      </div>
    </AuthProvider>
  );
}

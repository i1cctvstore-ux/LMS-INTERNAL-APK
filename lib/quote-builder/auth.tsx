/**
 * DIGANTI dari versi asli (yang fetch session Supabase sendiri) --
 * project i1 Internal Tools ini SUDAH nyelesain auth di level server
 * (app/page.tsx, Next.js), terus nurunin profile lewat props ke semua
 * modul (KasModule, StokModule, dst pola-nya sama). Jadi Quote Builder
 * ikut pola itu juga -- BUKAN bikin sistem auth paralel sendiri.
 *
 * Signature useAuth()/useQuoteBuilderAccess() DIBIARIN SAMA PERSIS kayak
 * versi asli, biar semua halaman (Home.tsx, QuoteListPage.tsx, dst) yang
 * udah manggil 2 hook ini GAK PERLU DIUBAH SAMA SEKALI -- cuma sumber
 * datanya yang beda (props, bukan supabase.auth.getSession()).
 */
import { createContext, useContext, type ReactNode } from "react";
import type { Role } from "@/lib/supabase/types";

type QuoteBuilderProfile = {
  id: string;
  name: string;
  role: Role;
  branch_id: string | null;
};

type AuthState = {
  session: { user: { id: string } } | null;
  profile: QuoteBuilderProfile | null;
  loading: boolean;
  error: string | null;
};

const AuthContext = createContext<AuthState | null>(null);

export type AuthProviderProps = {
  children: ReactNode;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: Role;
  currentUserBranchId: string | null;
};

// Bungkus QuoteBuilderModule pakai ini, isi 4 prop di bawah dari
// `profile` yang app/page.tsx sudah punya (sama kayak KasModule dkk).
export function AuthProvider({ children, currentUserId, currentUserName, currentUserRole, currentUserBranchId }: AuthProviderProps) {
  const profile: QuoteBuilderProfile = {
    id: currentUserId,
    name: currentUserName,
    role: currentUserRole,
    branch_id: currentUserBranchId,
  };
  const state: AuthState = {
    session: { user: { id: currentUserId } },
    profile,
    loading: false, // auth udah kelar diselesain sebelum modul ini di-render
    error: null,
  };
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Convenience helpers used throughout the quote builder pages. */
export function useQuoteBuilderAccess() {
  const { profile, loading, error } = useAuth();
  const role = profile?.role ?? null;
  const branchId = profile?.branch_id ?? null;
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin";
  const hasAccess = isSuperAdmin || isAdmin;
  return { profile, role, branchId, isSuperAdmin, isAdmin, hasAccess, loading, error };
}

"use client";

// =====================================================
// Wrapper Paket CCTV -- pola sama persis kayak QuoteBuilderModule/KasModule:
// 1 komponen, dibedain lewat prop `section`.
//
//   "kalkulator" -> Kalkulator Paket (buat penawaran cepat)
//   "riwayat"    -> Riwayat Paket
//   "harga"      -> Harga Komponen (super_admin saja -- dicek juga di
//                   nav-config.tsx, tapi dijaga dobel di sini dan lagi
//                   lewat RLS paket_branch_hpp -- 3 lapis)
//
// Pola pilih cabang untuk Super Admin disalin dari QuoteBuilderModule
// (tab horizontal, diingat di sessionStorage) -- reuse listBranches() dari
// lib/quote-builder/api.ts, bukan menulis ulang query yang sama.
//
// `onNavigate` (opsional, dioper dari app/page.tsx sama seperti
// QuoteBuilderModule) dipakai RiwayatPage untuk "Buka di Kalkulator" --
// pindah ke menu Kalkulator Paket sambil menitip id paket lewat
// sessionStorage (lihat OPEN_QUOTE_SESSION_KEY di KalkulatorPage.tsx).
// =====================================================

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Role } from "@/lib/supabase/types";
import { listBranches } from "@/lib/quote-builder/api";
import type { BranchRow } from "@/lib/quote-builder/database.types";
import type { PageKey } from "@/lib/nav-config";
import KalkulatorPage from "./KalkulatorPage";
import RiwayatPage from "./RiwayatPage";
import HargaKomponenPage from "./HargaKomponenPage";

export type PaketCctvSection = "kalkulator" | "riwayat" | "harga";

type PaketCctvModuleProps = {
  section: PaketCctvSection;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: Role;
  currentUserBranchId: string | null;
  onNavigate?: (page: PageKey) => void;
};

type BranchOption = { id: string; name: string };

// Cabang terakhir yang dipilih Super Admin (per tab browser) -- key
// terpisah dari qb-active-branch (Penawaran) supaya 2 modul ini bisa
// menampilkan cabang aktif yang berbeda kalau user memang sedang
// mengerjakan cabang yang berbeda di masing-masing menu.
const ACTIVE_BRANCH_KEY = "paket-active-branch";

export default function PaketCctvModule({
  section,
  currentUserId,
  currentUserName,
  currentUserRole,
  currentUserBranchId,
  onNavigate,
}: PaketCctvModuleProps) {
  const isSuperAdmin = currentUserRole === "super_admin";
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(isSuperAdmin);
  const [branchError, setBranchError] = useState<string | null>(null);
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
        try {
          remembered = window.sessionStorage.getItem(ACTIVE_BRANCH_KEY);
        } catch {
          /* storage bisa diblokir -- abaikan */
        }
        setActiveBranchId(
          (current) =>
            current ??
            active.find((b) => b.id === remembered)?.id ??
            active.find((b) => b.id === currentUserBranchId)?.id ??
            active[0]?.id ??
            null
        );
      })
      .catch((err: Error) => {
        if (!cancelled) setBranchError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingBranches(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, currentUserBranchId]);

  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;

  const centered = (content: string, tone: "normal" | "error" = "normal") => (
    <div className="paket-root">
      <div
        style={{
          minHeight: "50vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          textAlign: "center",
          color: tone === "error" ? "#b23b2c" : "#707786",
          fontSize: 14,
        }}
      >
        <p style={{ maxWidth: 360, margin: 0 }}>{content}</p>
      </div>
    </div>
  );

  if (section === "harga" && !isSuperAdmin) {
    // Jaga-jaga dobel dari nav-config.tsx roles + RLS paket_branch_hpp --
    // seharusnya tidak pernah kejadian karena menunya sudah disembunyikan.
    return centered("Halaman ini khusus Super Admin.", "error");
  }

  if (loadingBranches) {
    return (
      <div className="paket-root">
        <div
          style={{
            minHeight: "50vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            color: "#707786",
            fontSize: 14,
          }}
        >
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
        : "Akun Anda belum di-assign ke cabang mana pun. Hubungi Super Admin dulu sebelum bisa memakai Paket CCTV."
    );
  }

  const switchBranch = (branchId: string) => {
    if (branchId === activeBranchId) return;
    setActiveBranchId(branchId);
    try {
      window.sessionStorage.setItem(ACTIVE_BRANCH_KEY, branchId);
    } catch {
      /* abaikan */
    }
  };

  return (
    <div className="paket-root">
      {isSuperAdmin && branches.length > 0 && (
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

      {/* key={activeBranchId}: pindah cabang = halaman di bawah di-mount ulang dari nol. */}
      <div key={activeBranchId}>
        {section === "kalkulator" && (
          <KalkulatorPage
            branchId={activeBranchId}
            branchName={activeBranch?.name ?? null}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserRole={currentUserRole}
          />
        )}
        {section === "riwayat" && (
          <RiwayatPage
            branchId={activeBranchId}
            isSuperAdmin={isSuperAdmin}
            currentUserId={currentUserId}
            onNavigate={onNavigate}
          />
        )}
        {section === "harga" && <HargaKomponenPage branchId={activeBranchId} currentUserId={currentUserId} />}
      </div>
    </div>
  );
}

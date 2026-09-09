"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Edit3,
  Info,
  Lock,
  LockOpen,
  Plus,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  computeStatus,
  confirmSession,
  createSession,
  deleteSession,
  getSessionDetail,
  listBranchAccounts,
  listCatalogCategories,
  listSessions,
  revertSession,
  scopeLabel,
  sessionProgress,
  updateItemReal,
  type BranchAccount,
  type OpnameItem,
  type OpnameScope,
  type OpnameSession,
} from "@/lib/stok-opname/api";
import { loadAllBranches } from "@/lib/stok/api";

type Role = "super_admin" | "admin" | "kasir" | "gudang" | "teknisi";

const PILL = {
  primary:
    "inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2.5 text-[13px] font-bold text-white active:bg-indigo-700",
  outline:
    "inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-4 py-2.5 text-[13px] font-bold text-neutral-900 active:bg-neutral-50",
  danger:
    "inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-4 py-2.5 text-[13px] font-bold text-red-600 active:bg-red-50",
};
const SHEET_BTN = {
  reset:
    "flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-[13px] font-semibold text-neutral-900",
  apply:
    "flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-[13px] font-semibold text-white",
  confirm:
    "flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2.5 text-[13px] font-semibold text-white",
  warn:
    "flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2.5 text-[13px] font-semibold text-white",
};

interface Branch {
  id: string;
  name: string;
}

interface StockOpnamePageProps {
  currentUserId: string;
  currentUserName: string;
  currentUserRole: Role;
  currentUserBranchId: string;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Cetak lewat window baru — tidak menyentuh CSS/print-rules halaman host. */
function printItemList(
  session: OpnameSession,
  items: OpnameItem[],
  title: string,
  subtitle: string
) {
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) {
    alert("Popup diblokir browser — izinkan popup untuk situs ini lalu coba lagi.");
    return;
  }
  const rows = items
    .map(
      (it) => `<tr>
        <td style="border:1px solid #999;padding:8px;">${escapeHtml(it.kategori)}</td>
        <td style="border:1px solid #999;padding:8px;">${escapeHtml(it.nama)}</td>
        <td style="border:1px solid #999;padding:8px;">&nbsp;</td>
      </tr>`
    )
    .join("");
  win.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>
    <meta charset="utf-8" />
    <style>
      body{font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;color:#16181d;}
      h1{font-size:16px;font-weight:800;margin-bottom:2px;}
      p{font-size:12px;color:#555;margin-bottom:16px;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      th{border:1px solid #999;padding:7px;text-align:left;background:#f0f0f0;}
      th:last-child{width:130px;}
    </style>
    </head><body>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(session.branch_nama ?? "")} · ${escapeHtml(fmtDate(session.tanggal))} · Kategori: ${escapeHtml(
    scopeLabel(session.scope)
  )} · ${escapeHtml(subtitle)}</p>
      <table>
        <thead><tr><th>Kategori</th><th>Nama Barang</th><th>Qty Hitung</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function fmtDate(iso: string) {
  const bulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
}

export default function StockOpnamePage({
  currentUserId,
  currentUserName,
  currentUserRole,
  currentUserBranchId,
}: StockOpnamePageProps) {
  const isSuperAdmin = currentUserRole === "super_admin";
  const canAccess = currentUserRole === "super_admin" || currentUserRole === "admin";

  // Daftar cabang di-fetch sendiri di sini (bukan lewat props dari
  // app/page.tsx) -- pola sama kayak tab Stock Opname versi sebelumnya
  // di dalam stok-module.tsx, biar gak perlu ubah data flow di
  // app/page.tsx buat nyediain daftar cabang.
  const [branches, setBranches] = useState<Branch[]>([]);
  useEffect(() => {
    loadAllBranches()
      .then((rows) => setBranches(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setBranches([]));
  }, []);

  const [branchFilter, setBranchFilter] = useState<string | null>(
    isSuperAdmin ? null : currentUserBranchId
  );
  const [sessions, setSessions] = useState<OpnameSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [nsSelected, setNsSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<OpnameSession | null>(null);

  const activeBranchName = useMemo(() => {
    if (!branchFilter) return null;
    return branches.find((b) => b.id === branchFilter)?.name ?? "";
  }, [branchFilter, branches]);

  async function refreshList() {
    setLoading(true);
    try {
      const data = await listSessions(branchFilter);
      setSessions(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter]);

  useEffect(() => {
    listCatalogCategories().then((cats) => {
      setCategories(cats);
      setNsSelected(new Set(cats));
    });
  }, []);

  if (!canAccess) {
    return (
      <div className="p-6 text-sm text-neutral-500">
        Halaman Stock Opname hanya untuk Admin dan Super Admin.
      </div>
    );
  }

  async function handleStartNewSession() {
    if (!branchFilter) {
      alert('Pilih salah satu cabang dulu (bukan "Semua Cabang") untuk mulai opname baru.');
      return;
    }
    if (nsSelected.size === 0) {
      alert("Pilih minimal 1 kategori dulu.");
      return;
    }
    const scope: OpnameScope = nsSelected.size === categories.length ? "ALL" : [...nsSelected];
    const userName = currentUserName;
    const sessionId = await createSession({
      branchId: branchFilter,
      scope,
      userId: currentUserId,
      userName,
    });
    setNewSessionOpen(false);
    await refreshList();
    setOpenId(sessionId);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteSession(deleteTarget.id);
    setDeleteTarget(null);
    await refreshList();
  }

  if (openId) {
    return (
      <OpnameDetail
        sessionId={openId}
        role={currentUserRole}
        currentUserId={currentUserId}
        onBack={() => {
          setOpenId(null);
          refreshList();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Branch selector */}
      <div className="flex items-center gap-2">
        {isSuperAdmin ? (
          <select
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm font-semibold"
            value={branchFilter ?? "__all__"}
            onChange={(e) =>
              setBranchFilter(e.target.value === "__all__" ? null : e.target.value)
            }
          >
            <option value="__all__">Semua Cabang</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm font-semibold text-neutral-500">
            <Building2 className="h-3.5 w-3.5" />
            <span>
              {branches.find((b) => b.id === currentUserBranchId)?.name} — cabang kamu
            </span>
          </div>
        )}
      </div>

      <button
        className="flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white active:bg-indigo-700"
        onClick={() => setNewSessionOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        Opname Baru
      </button>

      {/* Session list */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Calendar className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-bold">Riwayat Sesi</h2>
            <p className="text-xs text-neutral-500">
              {loading ? "Memuat…" : `${sessions.length} sesi`}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 px-4 pb-4">
          {!loading && sessions.length === 0 && (
            <div className="py-6 text-center text-sm text-neutral-500">
              Belum ada sesi opname.
            </div>
          )}
          {sessions.map((s) => {
            const locked = s.status === "locked";
            return (
              <button
                key={s.id}
                onClick={() => setOpenId(s.id)}
                className="flex flex-col gap-2 rounded-2xl border border-neutral-200 p-3.5 text-left active:bg-neutral-50"
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div>
                    <div className="text-sm font-bold">{fmtDate(s.tanggal)}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                      <Building2 className="h-3 w-3" />
                      <span>{s.branch_nama}</span>
                      <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                        {scopeLabel(s.scope)}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`flex shrink-0 items-center gap-1 rounded-md border-[1.5px] border-dashed px-2 py-1 text-[10px] font-bold ${
                      locked
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {locked && <Lock className="h-3 w-3" />}
                    {locked ? "Terkonfirmasi" : "Berjalan"}
                  </span>
                  {isSuperAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(s);
                      }}
                      className="shrink-0 rounded-lg p-1.5 text-red-600 active:bg-red-50"
                      aria-label="Hapus sesi"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="text-xs font-semibold text-neutral-800 flex items-center gap-3">
                  <User className="h-3 w-3 text-neutral-400" />
                  <span className="text-neutral-400 font-medium">
                    {locked
                      ? `Dikonfirmasi ${s.confirmed_by_name} · ${s.confirmed_at ? fmtDate(s.confirmed_at.slice(0, 10)) : ""}`
                      : `Diedit ${s.updated_by_name} · terakhir diperbarui`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {newSessionOpen && (
        <NewSessionSheet
          branchName={activeBranchName}
          categories={categories}
          selected={nsSelected}
          setSelected={setNsSelected}
          onCancel={() => setNewSessionOpen(false)}
          onStart={handleStartNewSession}
        />
      )}

      {deleteTarget && (
        <Sheet
          onClose={() => setDeleteTarget(null)}
          title="Hapus Sesi Opname"
          icon={<Trash2 className="h-4.5 w-4.5" />}
        >
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-900">
            Sesi <strong>{deleteTarget.branch_nama} — {fmtDate(deleteTarget.tanggal)}</strong> (
            {scopeLabel(deleteTarget.scope)}), status{" "}
            <strong>{deleteTarget.status === "locked" ? "Terkonfirmasi" : "Berjalan"}</strong>.
            <br />
            <br />
            Menghapus sesi ini akan menghilangkan seluruh datanya secara permanen, termasuk
            histori Real yang sudah diisi. Tindakan ini tidak bisa dibatalkan.
          </div>
          <SheetFooter>
            <button className={SHEET_BTN.reset} onClick={() => setDeleteTarget(null)}>
              Batal
            </button>
            <button className={SHEET_BTN.warn} onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Ya, Hapus
            </button>
          </SheetFooter>
        </Sheet>
      )}
    </div>
  );
}

// ============================================================
// New session sheet
// ============================================================
function NewSessionSheet({
  branchName,
  categories,
  selected,
  setSelected,
  onCancel,
  onStart,
}: {
  branchName: string | null;
  categories: string[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onCancel: () => void;
  onStart: () => void;
}) {
  const allChecked = selected.size === categories.length;
  return (
    <Sheet onClose={onCancel} title={`Opname Baru — ${branchName ?? ""}`} icon={<Calendar className="h-4.5 w-4.5" />}>
      <div className="flex flex-col gap-1">
        <div className="mb-2 text-[10.5px] font-extrabold uppercase tracking-wide text-neutral-400">
          Pilih Kategori
        </div>
        <label className="flex items-center gap-2.5 rounded-lg px-1 py-2 text-[13.5px] font-bold active:bg-neutral-50">
          <input
            type="checkbox"
            className="h-[18px] w-[18px] accent-indigo-600"
            checked={allChecked}
            onChange={(e) => setSelected(e.target.checked ? new Set(categories) : new Set())}
          />
          Semua Kategori
        </label>
        {categories.map((c) => (
          <label
            key={c}
            className="flex items-center gap-2.5 rounded-lg px-1 py-2 pl-7 text-[13px] active:bg-neutral-50"
          >
            <input
              type="checkbox"
              className="h-[18px] w-[18px] accent-indigo-600"
              checked={selected.has(c)}
              onChange={(e) => {
                const next = new Set(selected);
                e.target.checked ? next.add(c) : next.delete(c);
                setSelected(next);
              }}
            />
            {c}
          </label>
        ))}
        <div className="mt-3 flex gap-2 rounded-xl bg-neutral-50 p-2.5 text-[10.5px] text-neutral-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
          <span>
            Bisa pilih 1 kategori aja (misal cuma EZVIZ hari ini, IMOU besok), atau centang
            &quot;Semua Kategori&quot; buat opname penuh. Saldo akan dibekukan (snapshot) saat sesi ini dibuat.
          </span>
        </div>
      </div>
      <SheetFooter>
        <button className={SHEET_BTN.reset} onClick={onCancel}>
          Batal
        </button>
        <button className={SHEET_BTN.apply} onClick={onStart}>
          <Check className="h-3.5 w-3.5" /> Mulai Opname
        </button>
      </SheetFooter>
    </Sheet>
  );
}

// ============================================================
// Detail page
// ============================================================
function OpnameDetail({
  sessionId,
  role,
  currentUserId,
  onBack,
}: {
  sessionId: string;
  role: Role;
  currentUserId: string;
  onBack: () => void;
}) {
  const [session, setSession] = useState<OpnameSession | null>(null);
  const [items, setItems] = useState<OpnameItem[]>([]);
  const [search, setSearch] = useState("");
  const [selCategory, setSelCategory] = useState<Set<string>>(new Set());
  const [hideZero, setHideZero] = useState(false);
  const [detailMode, setDetailMode] = useState(false);
  const [accCols, setAccCols] = useState<BranchAccount[]>([]);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [superEditing, setSuperEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const isSuperAdmin = role === "super_admin";

  async function load() {
    const { session: s, items: it } = await getSessionDetail(sessionId);
    setSession(s);
    setItems(it);
    setSelCategory(new Set(it.map((i) => i.kategori)));
    setHideZero(false);
    setDetailMode(false);
    setAccCols(await listBranchAccounts(s.branch_id));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (!session) return <div className="p-6 text-sm text-neutral-500">Memuat…</div>;

  const editable = session.status === "draft" || (isSuperAdmin && superEditing);
  const sessionCategories = [...new Set(items.map((i) => i.kategori))];
  const progress = sessionProgress(items);
  const accCodes = new Set(accCols.map((a) => a.code));

  let rows = items.filter((it) => selCategory.has(it.kategori));
  if (hideZero) rows = rows.filter((it) => it.saldo_snapshot !== 0);
  if (search) rows = rows.filter((it) => it.nama.toLowerCase().includes(search.toLowerCase()));
  if (sortKey) {
    rows = [...rows].sort((a: any, b: any) => {
      const pick = (row: any) =>
        sortKey === "checked" ? (computeStatus(row).checked ? 1 : 0)
        : sortKey === "selisih" ? (computeStatus(row).selisih ?? -Infinity)
        : sortKey === "real" ? (row.real ?? -Infinity)
        : accCodes.has(sortKey!) ? (row.accounts?.[sortKey!] ?? -Infinity)
        : row[sortKey!];
      const av = pick(a);
      const bv = pick(b);
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
  }

  function sortBy(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  async function handleRealChange(item: OpnameItem, value: string) {
    const v = value.trim() === "" ? null : Number(value);
    await updateItemReal(item.id, v);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, real: v } : i)));
  }

  async function handleConfirm() {
    await confirmSession({ sessionId, userId: currentUserId, userName: currentUserName });
    setConfirmOpen(false);
    await load();
  }

  function visibleItemsForExport(): OpnameItem[] {
    let visible = items.filter((it) => selCategory.has(it.kategori));
    if (hideZero) visible = visible.filter((it) => it.saldo_snapshot !== 0);
    return visible;
  }

  function handleExportFull() {
    const visible = visibleItemsForExport();
    if (visible.length === 0) {
      alert("Gak ada barang di kategori yang lagi difilter.");
      return;
    }
    printItemList(session, visible, "Lembar Hitung Stock Opname", `${visible.length} barang`);
  }

  function handleExportSelisih() {
    const visible = visibleItemsForExport().filter((it) => !computeStatus(it).checked);
    if (visible.length === 0) {
      alert("Semua barang di kategori yang dipilih sudah ✔ — gak ada selisih yang perlu dicetak ulang.");
      return;
    }
    printItemList(
      session,
      visible,
      "Cek Ulang — Selisih Belum Sesuai",
      `${visible.length} barang belum ✔`
    );
  }

  async function handleRevert() {
    await revertSession({ sessionId, userId: currentUserId, userName: currentUserName });
    setRevertOpen(false);
    setSuperEditing(false);
    await load();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <button onClick={onBack} className="rounded-lg p-1 text-neutral-800 active:bg-neutral-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <div className="text-[15px] font-extrabold">Opname — {session.branch_nama}</div>
          <div className="text-[11.5px] text-neutral-500">
            {fmtDate(session.tanggal)} · Kategori: {scopeLabel(session.scope)}
          </div>
        </div>
      </div>

      {/* Lock banner */}
      {session.status === "locked" &&
        (role === "admin" ? (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <div>
              <b>Sesi ini terkunci.</b> Sudah dikonfirmasi oleh {session.confirmed_by_name}. Hanya
              Super Admin yang bisa membuka kembali.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-800">
            <div className="flex items-start gap-2">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
              <div>
                <b>Sesi terkunci.</b> Dikonfirmasi oleh {session.confirmed_by_name}. Sebagai Super
                Admin, kamu bisa edit langsung tanpa mengubah status, atau buka kunci sepenuhnya.
              </div>
            </div>
            <div className="flex gap-2 pl-5.5">
              <button
                className={superEditing ? PILL.primary : PILL.outline}
                onClick={() => setSuperEditing((v) => !v)}
              >
                {superEditing ? <Check className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                {superEditing ? "Selesai Edit" : "Edit Langsung"}
              </button>
              <button className={PILL.danger} onClick={() => setRevertOpen(true)}>
                <LockOpen className="h-3.5 w-3.5" /> Buka Kunci
              </button>
            </div>
          </div>
        ))}

      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 shadow-sm">
          <Search className="h-4 w-4 text-neutral-400" />
          <input
            className="w-full text-sm outline-none"
            placeholder="Cari barang…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-sm font-semibold shadow-sm"
          onClick={() => setFilterOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {(() => {
            const n = sessionCategories.length - selCategory.size + (hideZero ? 1 : 0);
            return n > 0 ? (
              <span className="rounded-full bg-indigo-600 px-1.5 text-[10.5px] font-bold text-white">
                {n}
              </span>
            ) : null;
          })()}
        </button>
      </div>

      {/* Export / cetak */}
      <div className="flex gap-2">
        <button className={PILL.outline + " flex-1 justify-center"} onClick={handleExportFull}>
          <Printer className="h-3.5 w-3.5" /> Cetak Semua
        </button>
        <button className={PILL.outline + " flex-1 justify-center"} onClick={handleExportSelisih}>
          <Printer className="h-3.5 w-3.5" /> Cetak Selisih Saja
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="bg-neutral-50 text-[10px] font-extrabold uppercase text-neutral-500">
              <Th label="Kategori" k="kategori" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} align="left" />
              <Th label="Nama Barang" k="nama" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} align="left" />
              {detailMode &&
                accCols.map((a) => (
                  <Th
                    key={a.code}
                    label={a.label}
                    k={a.code}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onClick={sortBy}
                    thClassName={a.exclude_total ? "bg-neutral-100" : undefined}
                    sublabel={a.exclude_total ? "cek saja" : undefined}
                  />
                ))}
              <Th label="Saldo" k="saldo_snapshot" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
              <Th label="Real" k="real" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
              <Th label="Selisih" k="selisih" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
              <Th label="✔" k="checked" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const st = computeStatus(item);
              const negative = item.saldo_snapshot < 0;
              return (
                <tr
                  key={item.id}
                  className={`${st.checked ? "bg-emerald-50" : ""} ${negative ? "bg-red-50" : ""}`}
                >
                  <td className="border border-neutral-200 px-2 py-2 text-left text-[11px] text-neutral-500">
                    {item.kategori}
                  </td>
                  <td className="max-w-[180px] truncate border border-neutral-200 px-2 py-2 text-left text-[12.5px] font-semibold">
                    {item.nama}
                  </td>
                  {detailMode &&
                    accCols.map((a) => (
                      <td
                        key={a.code}
                        className={`border border-neutral-200 px-2 py-2 text-center text-[12px] ${
                          a.exclude_total ? "bg-neutral-50 text-neutral-500" : ""
                        }`}
                      >
                        {item.accounts?.[a.code] === 0 ? "-" : item.accounts?.[a.code] ?? "-"}
                      </td>
                    ))}
                  <td
                    className={`border border-neutral-200 px-2 py-2 text-center ${
                      negative ? "font-extrabold text-red-600" : ""
                    }`}
                  >
                    {item.saldo_snapshot}
                  </td>
                  <td className="border border-neutral-200 px-2 py-2 text-center">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9-]*"
                      defaultValue={item.real ?? ""}
                      disabled={!editable || st.skip}
                      onBlur={(e) => handleRealChange(item, e.target.value)}
                      className="w-14 rounded-md border border-neutral-300 bg-amber-50/40 px-1 py-1.5 text-center text-[13.5px] disabled:border-transparent disabled:bg-transparent disabled:text-neutral-400"
                    />
                  </td>
                  <td className="border border-neutral-200 px-2 py-2 text-center">
                    <span
                      className={`font-bold ${
                        typeof st.selisih === "number" && st.selisih !== 0 ? "text-red-600" : ""
                      }`}
                    >
                      {st.skip ? "-" : st.selisih === null ? "-" : st.selisih}
                    </span>
                  </td>
                  <td className="border border-neutral-200 px-2 py-2 text-center">
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-[5px] border-[1.5px] ${
                        st.checked
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-neutral-300"
                      }`}
                    >
                      {st.checked && <Check className="h-3 w-3" />}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 flex items-center justify-between gap-2.5 border-t border-neutral-200 bg-white px-1 py-3">
        <div className="text-xs text-neutral-500">
          Selesai: <b className="text-neutral-900">{progress.checked}/{progress.total}</b>
        </div>
        {session.status === "draft" ? (
          <button className={PILL.primary} onClick={() => setConfirmOpen(true)}>
            <Lock className="h-3.5 w-3.5" /> Konfirmasi Stock Opname
          </button>
        ) : isSuperAdmin && superEditing ? (
          <button className={PILL.outline} onClick={() => setSuperEditing(false)}>
            <Check className="h-3.5 w-3.5" /> Selesai Edit
          </button>
        ) : null}
      </div>

      {confirmOpen && (
        <Sheet onClose={() => setConfirmOpen(false)} title="Konfirmasi Stock Opname" icon={<Lock className="h-4.5 w-4.5" />}>
          {progress.total - progress.checked > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-900">
              Masih ada <strong>{progress.total - progress.checked} barang</strong> yang belum ✔ dari
              total {progress.total}. Setelah dikonfirmasi, sesi ini terkunci dan cuma Super Admin
              yang bisa membuka lagi. Tetap lanjut?
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[12.5px] text-emerald-900">
              Semua {progress.total} barang sudah ✔. Setelah dikonfirmasi, sesi ini terkunci dan
              cuma Super Admin yang bisa membuka lagi.
            </div>
          )}
          <SheetFooter>
            <button className={SHEET_BTN.reset} onClick={() => setConfirmOpen(false)}>
              Batal
            </button>
            <button className={SHEET_BTN.confirm} onClick={handleConfirm}>
              <Check className="h-3.5 w-3.5" /> Ya, Konfirmasi
            </button>
          </SheetFooter>
        </Sheet>
      )}

      {revertOpen && (
        <Sheet onClose={() => setRevertOpen(false)} title="Buka Kunci Sesi" icon={<LockOpen className="h-4.5 w-4.5" />}>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-900">
            Sesi ini sudah dikonfirmasi. Membuka kunci akan mengembalikannya ke status{" "}
            <strong>Berjalan</strong> supaya admin cabang bisa mengedit lagi. Tindakan ini tercatat.
          </div>
          <SheetFooter>
            <button className={SHEET_BTN.reset} onClick={() => setRevertOpen(false)}>
              Batal
            </button>
            <button className={SHEET_BTN.warn} onClick={handleRevert}>
              <LockOpen className="h-3.5 w-3.5" /> Ya, Buka Kunci
            </button>
          </SheetFooter>
        </Sheet>
      )}

      {filterOpen && (
        <Sheet onClose={() => setFilterOpen(false)} title="Filter Kategori" icon={<SlidersHorizontal className="h-4.5 w-4.5" />}>
          <label className="flex items-center gap-2.5 rounded-lg px-1 py-2 text-[13.5px] font-bold active:bg-neutral-50">
            <input
              type="checkbox"
              className="h-[18px] w-[18px] accent-indigo-600"
              checked={selCategory.size === sessionCategories.length}
              onChange={(e) =>
                setSelCategory(e.target.checked ? new Set(sessionCategories) : new Set())
              }
            />
            Semua Kategori
          </label>
          {sessionCategories.map((c) => (
            <label key={c} className="flex items-center gap-2.5 rounded-lg px-1 py-2 pl-7 text-[13px]">
              <input
                type="checkbox"
                className="h-[18px] w-[18px] accent-indigo-600"
                checked={selCategory.has(c)}
                onChange={(e) => {
                  const next = new Set(selCategory);
                  e.target.checked ? next.add(c) : next.delete(c);
                  setSelCategory(next);
                }}
              />
              {c}
            </label>
          ))}

          <div className="mb-2 mt-4.5 text-[10.5px] font-extrabold uppercase tracking-wide text-neutral-400">
            Tampilan
          </div>
          <label className="flex items-center gap-2.5 rounded-lg px-1 py-2 text-[13.5px] font-bold active:bg-neutral-50">
            <input
              type="checkbox"
              className="h-[18px] w-[18px] accent-indigo-600"
              checked={hideZero}
              onChange={(e) => setHideZero(e.target.checked)}
            />
            Sembunyikan stok 0 (sudah otomatis ✔, gak perlu dicek)
          </label>
          <label className="flex items-center gap-2.5 rounded-lg px-1 py-2 text-[13.5px] font-bold active:bg-neutral-50">
            <input
              type="checkbox"
              className="h-[18px] w-[18px] accent-indigo-600"
              checked={detailMode}
              onChange={(e) => setDetailMode(e.target.checked)}
            />
            Mode Detail (kolom akun per cabang — sama seperti Stok Cabang)
          </label>

          <SheetFooter>
            <button
              className={SHEET_BTN.reset}
              onClick={() => {
                setSelCategory(new Set(sessionCategories));
                setHideZero(false);
                setDetailMode(false);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <button className={SHEET_BTN.apply} onClick={() => setFilterOpen(false)}>
              <Check className="h-3.5 w-3.5" /> Terapkan
            </button>
          </SheetFooter>
        </Sheet>
      )}
    </div>
  );
}

// ============================================================
// Small shared UI bits
// ============================================================
function Th({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
  align = "center",
  thClassName = "",
  sublabel,
}: {
  label: string;
  k: string;
  sortKey: string | null;
  sortDir: 1 | -1;
  onClick: (k: string) => void;
  align?: "left" | "center";
  thClassName?: string;
  sublabel?: string;
}) {
  const sorted = sortKey === k;
  return (
    <th className={`border border-neutral-200 p-0 ${thClassName}`}>
      <button
        onClick={() => onClick(k)}
        className={`flex w-full items-center gap-1 whitespace-nowrap px-2 py-2 text-[10px] font-extrabold uppercase ${
          align === "left" ? "justify-start" : "justify-center"
        } ${sorted ? "text-indigo-600" : "text-neutral-500"}`}
      >
        <span>{label}</span>
        <span className="flex flex-col leading-none">
          <ChevronUp className={`h-2.5 w-2.5 ${sorted && sortDir === 1 ? "opacity-100" : "opacity-30"}`} />
          <ChevronDown className={`h-2.5 w-2.5 ${sorted && sortDir === -1 ? "opacity-100" : "opacity-30"}`} />
        </span>
      </button>
      {sublabel && (
        <div className="pb-1 text-center text-[8px] font-bold normal-case tracking-normal text-neutral-400">
          {sublabel}
        </div>
      )}
    </th>
  );
}

function Sheet({
  title,
  icon,
  children,
  onClose,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45" onClick={onClose}>
      <div
        className="flex max-h-[78vh] w-full max-w-[480px] flex-col rounded-t-[20px] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-neutral-300" />
        <div className="flex items-center justify-between border-b border-neutral-200 px-4.5 py-3">
          <h2 className="flex items-center gap-2 text-[15.5px] font-bold">
            {icon}
            {title}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-neutral-500">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4.5 py-3.5">{children}</div>
      </div>
    </div>
  );
}

function SheetFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex gap-2.5 border-t border-neutral-200 pt-3 [&>button]:flex-1 [&>button]:justify-center">
      {children}
    </div>
  );
}

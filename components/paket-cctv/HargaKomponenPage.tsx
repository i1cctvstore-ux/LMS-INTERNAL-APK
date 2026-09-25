"use client";

// =====================================================
// components/paket-cctv/HargaKomponenPage.tsx
// =====================================================
// Implementasi bagian 6.2 handoff. super_admin only (dijaga 3 lapis:
// nav-config.tsx roles, RLS paket_branch_hpp, dan pengecekan di
// PaketCctvModule.tsx).
//
// "Salin dari cabang lain": tampilkan per tipe barang mana yang beda
// vs sudah sama (compareBranchPrices), staf pilih tipe yang mau
// disalin, lalu diterapkan satu-satu -- dengan Urungkan yang menyimpan
// nilai SEBELUM disalin (bukan RPC transaksional, tapi cukup untuk
// "salin lalu bisa batal" sesuai spek 6.2).

import { useEffect, useMemo, useState } from "react";
import { listBranches } from "@/lib/quote-builder/api";
import type { BranchRow } from "@/lib/quote-builder/database.types";
import {
  type BranchHpp,
  type BranchPrice,
  type ComponentSlot,
  type Jenis,
  type PaketConfig,
  compareBranchPrices,
  listBranchHpp,
  listBranchPrices,
  listComponentSlots,
  getPaketConfig,
  updateBranchHpp,
  updateBranchPrice,
  updatePaketConfig,
} from "@/lib/paket-cctv/api";

type Props = { branchId: string; currentUserId: string };

const currency = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID", { maximumFractionDigits: 0 });

export default function HargaKomponenPage({ branchId, currentUserId }: Props) {
  const [tab, setTab] = useState<"harga" | "formula" | "salin">("harga");

  const [slots, setSlots] = useState<ComponentSlot[]>([]);
  const [prices, setPrices] = useState<Map<string, BranchPrice>>(new Map());
  const [hpp, setHpp] = useState<Map<string, BranchHpp>>(new Map());
  const [config, setConfig] = useState<PaketConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // draft: slot_key -> { nama, hargaJual, hpp, sudahPpn } -- ditulis sekaligus lewat "Simpan Perubahan" (6.2)
  const [draft, setDraft] = useState<Record<string, { nama: string; hargaJual: number; hpp: number; sudahPpn: boolean }>>({});

  function load() {
    setLoading(true);
    setLoadError(null);
    Promise.all([listComponentSlots(), listBranchPrices(branchId), listBranchHpp(branchId), getPaketConfig()])
      .then(([slotRows, priceRows, hppRows, cfg]) => {
        setSlots(slotRows);
        setPrices(new Map(priceRows.map((p) => [p.slot_key, p])));
        setHpp(new Map(hppRows.map((h) => [h.slot_key, h])));
        setConfig(cfg);
        setDraft({});
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [branchId]);

  function draftValue(slotKey: string) {
    const d = draft[slotKey];
    if (d) return d;
    const p = prices.get(slotKey);
    const h = hpp.get(slotKey);
    return { nama: p?.nama ?? "", hargaJual: p?.harga_jual ?? 0, hpp: h?.hpp ?? 0, sudahPpn: p?.sudah_ppn ?? false };
  }

  function setDraftField(slotKey: string, patch: Partial<{ nama: string; hargaJual: number; hpp: number; sudahPpn: boolean }>) {
    setDraft((current) => ({ ...current, [slotKey]: { ...draftValue(slotKey), ...patch } }));
  }

  async function handleSaveAll() {
    setSaving(true);
    setSaveError(null);
    try {
      for (const [slotKey, d] of Object.entries(draft)) {
        await updateBranchPrice(branchId, slotKey, { nama: d.nama, harga_jual: d.hargaJual, sudah_ppn: d.sudahPpn }, currentUserId);
        await updateBranchHpp(branchId, slotKey, d.hpp, currentUserId);
      }
      setEditMode(false);
      load();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const grouped = useMemo(() => {
    const byTipe = new Map<string, ComponentSlot[]>();
    for (const s of slots) {
      const arr = byTipe.get(s.tipe) ?? [];
      arr.push(s);
      byTipe.set(s.tipe, arr);
    }
    return Array.from(byTipe.entries());
  }, [slots]);

  if (loading) return <div style={{ padding: 24, color: "#707786" }}>Memuat harga cabang…</div>;
  if (loadError) return <div style={{ padding: 24, color: "#b23b2c" }}>Gagal memuat: {loadError}</div>;
  if (!config) return null;

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setTab("harga")} style={tab === "harga" ? tabActive : tabInactive}>Harga Barang</button>
        <button type="button" onClick={() => setTab("formula")} style={tab === "formula" ? tabActive : tabInactive}>Formula &amp; Pajak</button>
        <button type="button" onClick={() => setTab("salin")} style={tab === "salin" ? tabActive : tabInactive}>Salin dari Cabang Lain</button>
      </div>

      {tab === "harga" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            {!editMode ? (
              <button type="button" onClick={() => setEditMode(true)} style={btnGhost}>Edit</button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => { setEditMode(false); setDraft({}); }} style={btnGhost}>Batal</button>
                <button type="button" onClick={handleSaveAll} disabled={saving} style={btnPrimary}>
                  {saving ? "Menyimpan…" : "Simpan Perubahan"}
                </button>
              </div>
            )}
          </div>
          {saveError && <p style={{ color: "#b23b2c", fontSize: 12.5, marginBottom: 10 }}>Gagal menyimpan: {saveError}</p>}

          {grouped.map(([tipe, slotList]) => (
            <div key={tipe} style={{ marginBottom: 18 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: 13 }}>{tipe}</h4>
              <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #dfe5ed", color: "#4b5566" }}>
                    <th style={th}>Nama Barang</th>
                    <th style={th}>Harga Jual</th>
                    <th style={th}>HPP</th>
                    <th style={th}>Sudah PPN?</th>
                  </tr>
                </thead>
                <tbody>
                  {slotList.map((s) => {
                    const d = draftValue(s.slot_key);
                    return (
                      <tr key={s.slot_key} style={{ borderBottom: "1px solid #f0f2f5" }}>
                        <td style={td}>
                          {editMode ? (
                            <input value={d.nama} onChange={(e) => setDraftField(s.slot_key, { nama: e.target.value })} style={cellInput} />
                          ) : (
                            d.nama || <span style={{ color: "#9aa1ac" }}>(belum diisi)</span>
                          )}
                        </td>
                        <td style={td}>
                          {editMode ? (
                            <input type="number" value={d.hargaJual} onChange={(e) => setDraftField(s.slot_key, { hargaJual: Number(e.target.value) })} style={{ ...cellInput, width: 110 }} />
                          ) : (
                            currency(d.hargaJual)
                          )}
                        </td>
                        <td style={td}>
                          {editMode ? (
                            <input type="number" value={d.hpp} onChange={(e) => setDraftField(s.slot_key, { hpp: Number(e.target.value) })} style={{ ...cellInput, width: 110 }} />
                          ) : (
                            currency(d.hpp)
                          )}
                        </td>
                        <td style={td}>
                          {editMode ? (
                            <input type="checkbox" checked={d.sudahPpn} onChange={(e) => setDraftField(s.slot_key, { sudahPpn: e.target.checked })} />
                          ) : d.sudahPpn ? "Ya" : "Belum"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      {tab === "formula" && (
        <FormulaPajakPanel config={config} currentUserId={currentUserId} onSaved={load} />
      )}

      {tab === "salin" && <SalinCabangPanel branchId={branchId} currentUserId={currentUserId} onApplied={load} />}
    </div>
  );
}

/** Meter kabel/kamera, tarif PPN, dan label brand (5.6/6.2) -- semuanya global, bukan per cabang. */
function FormulaPajakPanel({ config, currentUserId, onSaved }: { config: PaketConfig; currentUserId: string; onSaved: () => void }) {
  const [cableMeter, setCableMeter] = useState(config.cable_meter_per_camera);
  const [ppnRate, setPpnRate] = useState(config.ppn_rate_percent);
  const [brands, setBrands] = useState(config.brands);
  const [tierPct, setTierPct] = useState<Record<string, number>>(() =>
    Object.fromEntries(config.customer_types.filter((c) => c.pct_from_hpp !== null).map((c) => [c.key, (c.pct_from_hpp ?? 0) * 100]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function renameBrand(jenis: Jenis, brandKey: string, label: string) {
    setBrands((current) => ({
      ...current,
      [jenis]: { ...current[jenis], brands: { ...current[jenis].brands, [brandKey]: { ...current[jenis].brands[brandKey], label } } },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const customerTypes = config.customer_types.map((c) =>
        c.pct_from_hpp === null ? c : { ...c, pct_from_hpp: (tierPct[c.key] ?? 0) / 100 }
      );
      await updatePaketConfig(
        { cable_meter_per_camera: cableMeter, ppn_rate_percent: ppnRate, brands, customer_types: customerTypes },
        currentUserId
      );
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <label style={{ fontSize: 12.5 }}>
          Meter kabel per kamera
          <input type="number" value={cableMeter} onChange={(e) => setCableMeter(Number(e.target.value))} style={cellInput} />
        </label>
        <label style={{ fontSize: 12.5 }}>
          Tarif PPN (%)
          <input type="number" value={ppnRate} onChange={(e) => setPpnRate(Number(e.target.value))} style={cellInput} />
        </label>
      </div>

      <h4 style={{ fontSize: 13, margin: "0 0 6px" }}>Atur % Tier Customer (dari HPP)</h4>
      {config.customer_types
        .filter((c) => c.pct_from_hpp !== null)
        .map((c) => (
          <label key={c.key} style={{ display: "block", fontSize: 12.5, marginBottom: 8 }}>
            {c.label}
            <input
              type="number"
              value={tierPct[c.key] ?? 0}
              onChange={(e) => setTierPct((cur) => ({ ...cur, [c.key]: Number(e.target.value) }))}
              style={cellInput}
            />
            %
          </label>
        ))}

      <h4 style={{ fontSize: 13, margin: "16px 0 6px" }}>Nama Brand &amp; Paket</h4>
      {(Object.keys(brands) as Jenis[]).map((jenis) => (
        <div key={jenis} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11.5, color: "#9aa1ac", marginBottom: 4 }}>{brands[jenis].label}</div>
          {Object.entries(brands[jenis].brands).map(([key, def]) => (
            <input
              key={key}
              value={def.label}
              onChange={(e) => renameBrand(jenis, key, e.target.value)}
              style={{ ...cellInput, display: "block", marginBottom: 4 }}
            />
          ))}
        </div>
      ))}

      {error && <p style={{ color: "#b23b2c", fontSize: 12.5 }}>{error}</p>}
      <button type="button" onClick={handleSave} disabled={saving} style={btnPrimary}>
        {saving ? "Menyimpan…" : "Simpan Perubahan"}
      </button>
    </div>
  );
}

/** "Salin dari cabang lain" (6.2): tampilkan beda vs sama per slot, pilih tipe barang yang mau disalin, terapkan + Urungkan. */
function SalinCabangPanel({ branchId, currentUserId, onApplied }: { branchId: string; currentUserId: string; onApplied: () => void }) {
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [sourceId, setSourceId] = useState<string>("");
  const [diff, setDiff] = useState<Awaited<ReturnType<typeof compareBranchPrices>>>([]);
  const [slotsByKey, setSlotsByKey] = useState<Map<string, ComponentSlot>>(new Map());
  const [selectedTipes, setSelectedTipes] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<{ slotKey: string; before: BranchPrice | null }[] | null>(null);

  useEffect(() => {
    listBranches().then((rows) => setBranches((rows as BranchRow[]).filter((b) => b.id !== branchId)));
    listComponentSlots().then((rows) => setSlotsByKey(new Map(rows.map((s) => [s.slot_key, s]))));
  }, [branchId]);

  useEffect(() => {
    if (!sourceId) {
      setDiff([]);
      return;
    }
    compareBranchPrices(sourceId, branchId).then(setDiff);
  }, [sourceId, branchId]);

  const tipeGroups = useMemo(() => {
    const set = new Set<string>();
    for (const d of diff) {
      const tipe = slotsByKey.get(d.slot_key)?.tipe;
      if (tipe) set.add(tipe);
    }
    return Array.from(set);
  }, [diff, slotsByKey]);

  function toggleTipe(tipe: string) {
    setSelectedTipes((current) => {
      const next = new Set(current);
      if (next.has(tipe)) next.delete(tipe);
      else next.add(tipe);
      return next;
    });
  }

  async function handleApply() {
    setApplying(true);
    setApplyError(null);
    const before: { slotKey: string; before: BranchPrice | null }[] = [];
    try {
      for (const d of diff) {
        const tipe = slotsByKey.get(d.slot_key)?.tipe;
        if (!tipe || !selectedTipes.has(tipe) || !d.source || d.sama) continue;
        before.push({ slotKey: d.slot_key, before: d.target });
        await updateBranchPrice(branchId, d.slot_key, { nama: d.source.nama, harga_jual: d.source.harga_jual, sudah_ppn: d.source.sudah_ppn }, currentUserId);
      }
      setUndoStack(before);
      onApplied();
    } catch (err) {
      setApplyError((err as Error).message);
    } finally {
      setApplying(false);
    }
  }

  async function handleUndo() {
    if (!undoStack) return;
    setApplying(true);
    try {
      for (const { slotKey, before } of undoStack) {
        if (before) await updateBranchPrice(branchId, slotKey, { nama: before.nama, harga_jual: before.harga_jual, sudah_ppn: before.sudah_ppn }, currentUserId);
      }
      setUndoStack(null);
      onApplied();
    } catch (err) {
      setApplyError((err as Error).message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div>
      <label style={{ fontSize: 12.5, display: "block", marginBottom: 12 }}>
        Salin dari cabang
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} style={{ ...cellInput, display: "block" }}>
          <option value="">Pilih cabang sumber…</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>

      {sourceId && (
        <>
          <p style={{ fontSize: 12, color: "#707786" }}>Pilih tipe barang yang mau disalin (yang harganya beda ditandai):</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {tipeGroups.map((tipe) => {
              const tipeDiffs = diff.filter((d) => slotsByKey.get(d.slot_key)?.tipe === tipe);
              const anyDiff = tipeDiffs.some((d) => !d.sama);
              return (
                <label key={tipe} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5 }}>
                  <input type="checkbox" checked={selectedTipes.has(tipe)} onChange={() => toggleTipe(tipe)} />
                  {tipe} {anyDiff && <span style={{ color: "#b23b2c" }}>●</span>}
                </label>
              );
            })}
          </div>

          {applyError && <p style={{ color: "#b23b2c", fontSize: 12.5 }}>{applyError}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={handleApply} disabled={applying || selectedTipes.size === 0} style={btnPrimary}>
              {applying ? "Menyalin…" : "Salin Sekarang"}
            </button>
            {undoStack && (
              <button type="button" onClick={handleUndo} disabled={applying} style={btnGhost}>
                Urungkan
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const th = { padding: "6px 8px" };
const td = { padding: "6px 8px" };
const cellInput = { padding: "4px 6px", borderRadius: 6, border: "1px solid #dfe5ed", fontSize: 12.5, width: "100%" };
const btnGhost = { padding: "6px 12px", borderRadius: 8, border: "1px solid #dfe5ed", background: "#fff", fontSize: 12.5, cursor: "pointer" };
const btnPrimary = { padding: "6px 14px", borderRadius: 8, border: "none", background: "#2f6fed", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
const tabActive = { padding: "6px 14px", borderRadius: 999, border: "none", background: "#2f6fed", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
const tabInactive = { padding: "6px 14px", borderRadius: 999, border: "1px solid #dfe5ed", background: "#fff", fontSize: 12.5, cursor: "pointer" };

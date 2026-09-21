/**
 * Info Cabang -- identitas kop surat penawaran per cabang.
 *
 * Yang bisa diatur (per cabang, cabang dipilih lewat tab di QuoteBuilderModule):
 *   - Nama toko, alamat, telepon, email, nama penandatangan
 *   - Logo untuk penawaran PPN dan logo untuk penawaran NON-PPN (beda)
 *
 * Penyimpanan:
 *   - alamat/telepon/email/penandatangan -> kolom tabel `branches`
 *   - nama toko + 2 logo -> tabel `branch_letterhead` (logo = data URL base64,
 *     dikecilkan otomatis di browser; sengaja bukan file eksternal supaya
 *     PDF penawaran tidak gagal render gambar pas di-capture).
 * Keduanya hanya bisa ditulis Super Admin (RLS branches & branch_letterhead).
 *
 * Kalau logo belum diisi, editor penawaran memakai logo bawaan
 * (LOGO_PPN_BASE64 / LOGO_NON_PPN_BASE64 di QuoteEditorPage.tsx).
 */
import { useEffect, useState } from "react";
import { ImagePlus, LoaderCircle, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth, useQuoteBuilderAccess } from "@/lib/quote-builder/auth";
import { getBranch, saveBranchInfo, saveBranchLetterhead } from "@/lib/quote-builder/api";
import { LOGO_NON_PPN_BASE64, LOGO_PPN_BASE64 } from "./QuoteEditorPage";

type FormState = {
  storeName: string;
  address: string;
  phone: string;
  email: string;
  signerName: string;
  logoPpn: string | null;
  logoNonPpn: string | null;
};

const EMPTY_FORM: FormState = { storeName: "", address: "", phone: "", email: "", signerName: "", logoPpn: null, logoNonPpn: null };

const PAGE_CSS = `
.qb-root .branch-info-page{padding:34px 32px 56px;max-width:1040px}
.qb-root .branch-info-page h1{margin:6px 0 8px;color:#16233b;font-size:28px;font-weight:760;letter-spacing:-.03em}
.qb-root .branch-info-page .bi-lead{max-width:640px;margin:0 0 22px;color:#718099;font-size:14px;line-height:1.6}
.qb-root .branch-info-page .bi-card{margin-bottom:18px;padding:22px;border:1px solid #e1e7ef;border-radius:20px;background:#fff;box-shadow:0 13px 35px rgba(30,52,90,.045)}
.qb-root .branch-info-page .bi-card h2{margin:0 0 4px;color:#182641;font-size:16px}
.qb-root .branch-info-page .bi-card>p{margin:0 0 16px;color:#7a8799;font-size:12px;line-height:1.5}
.qb-root .branch-info-page .bi-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.qb-root .branch-info-page .bi-field{display:grid;gap:6px}
.qb-root .branch-info-page .bi-field.wide{grid-column:1/-1}
.qb-root .branch-info-page .bi-field>span{color:#78859a;font-size:10px;font-weight:800;letter-spacing:.09em}
.qb-root .branch-info-page .bi-field input,.qb-root .branch-info-page .bi-field textarea{border:1px solid #dfe5ed;border-radius:10px;padding:10px 12px;color:#2b3850;background:#fff;font-size:13px;font-weight:600;font-family:inherit}
.qb-root .branch-info-page .bi-field textarea{min-height:64px;resize:vertical}
.qb-root .branch-info-page .bi-logos{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.qb-root .branch-info-page .bi-logo-card{display:grid;gap:10px;padding:16px;border:1px solid #e3e6ec;border-radius:16px;background:#fafbfe}
.qb-root .branch-info-page .bi-logo-card header{display:flex;align-items:center;justify-content:space-between;gap:10px}
.qb-root .branch-info-page .bi-logo-card strong{color:#1f2d47;font-size:13px}
.qb-root .branch-info-page .bi-logo-card small{color:#7a8799;font-size:11px;line-height:1.5}
.qb-root .branch-info-page .bi-badge{padding:4px 9px;border-radius:999px;font-size:10px;font-weight:800;color:#4566be;background:#eff3ff;white-space:nowrap}
.qb-root .branch-info-page .bi-badge.default{color:#7a8799;background:#eef0f5}
.qb-root .branch-info-page .bi-preview{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 14px;border:1px solid #aaa;border-width:0 0 1px;background:#fff;border-radius:6px 6px 0 0;box-shadow:0 0 0 1px #e3e6ec}
.qb-root .branch-info-page .bi-preview img{display:block;height:44px;width:auto;max-width:48%;object-fit:contain;object-position:left center}
.qb-root .branch-info-page .bi-preview div{display:grid;gap:3px;color:#555;font-size:9px;text-align:right;min-width:0}
.qb-root .branch-info-page .bi-preview div strong{color:#1d2433;font-size:11px}
.qb-root .branch-info-page .bi-preview div span.missing{color:#c17a2f;font-style:italic}
.qb-root .branch-info-page .bi-actions{display:flex;flex-wrap:wrap;gap:8px}
.qb-root .branch-info-page .bi-savebar{position:sticky;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 18px;border:1px solid #dce5f6;border-radius:16px;background:rgba(248,250,255,.97);backdrop-filter:blur(4px)}
.qb-root .branch-info-page .bi-savebar span{color:#6d7d99;font-size:12px}
@media (max-width:900px){
  .qb-root .branch-info-page{padding:22px 16px 48px}
  .qb-root .branch-info-page .bi-grid,.qb-root .branch-info-page .bi-logos{grid-template-columns:1fr}
  .qb-root .branch-info-page .bi-savebar{flex-direction:column;align-items:stretch}
}
`;

/** Kecilkan logo di browser (max 600px lebar, PNG) supaya ringan disimpan di database & aman untuk capture PDF. */
async function fileToLogoDataUrl(file: File, maxWidth = 600, maxChars = 220_000): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("File harus berupa gambar (PNG, JPG, WebP, atau SVG).");
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Gambar tidak bisa dibaca. Coba file lain."));
      image.src = objectUrl;
    });
    const naturalWidth = img.naturalWidth || 480;
    const naturalHeight = img.naturalHeight || 140;
    let width = Math.min(maxWidth, naturalWidth);
    for (let attempt = 0; attempt < 6; attempt++) {
      const height = Math.max(1, Math.round((width * naturalHeight) / naturalWidth));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Browser tidak mendukung pemrosesan gambar.");
      context.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrl.length <= maxChars) return dataUrl;
      width = Math.round(width * 0.75);
      if (width < 160) break;
    }
    throw new Error("Logo terlalu besar/detail untuk disimpan. Pakai gambar yang lebih sederhana.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function LetterheadPreview({ logo, form }: { logo: string; form: FormState }) {
  const line = (value: string, placeholder: string) => (value.trim() ? <span>{value.trim()}</span> : <span className="missing">{placeholder}</span>);
  return (
    <div className="bi-preview" aria-label="Pratinjau kop surat">
      <img src={logo} alt="Pratinjau logo" />
      <div>
        {form.storeName.trim() && <strong>{form.storeName.trim()}</strong>}
        {line(form.phone, "(nomor telepon belum diisi)")}
        {line(form.email, "(email belum diisi)")}
        {line(form.address, "(alamat belum diisi)")}
      </div>
    </div>
  );
}

export default function BranchInfoPage({ branchName }: { branchName: string | null }) {
  const { session } = useAuth();
  const { branchId, isSuperAdmin } = useQuoteBuilderAccess();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saved, setSaved] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [processingLogo, setProcessingLogo] = useState<"ppn" | "nonppn" | null>(null);

  useEffect(() => {
    if (!branchId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getBranch(branchId)
      .then((branch) => {
        if (cancelled) return;
        const next: FormState = {
          storeName: branch.store_name ?? "",
          address: branch.address ?? "",
          phone: branch.phone ?? "",
          email: branch.email ?? "",
          signerName: branch.signer_name ?? "",
          logoPpn: branch.logo_ppn_data ?? null,
          logoNonPpn: branch.logo_non_ppn_data ?? null,
        };
        setForm(next);
        setSaved(next);
        setLoadError(null);
      })
      .catch((err: Error) => { if (!cancelled) setLoadError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [branchId]);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const pickLogo = async (kind: "ppn" | "nonppn", file: File | undefined) => {
    if (!file) return;
    setProcessingLogo(kind);
    try {
      const dataUrl = await fileToLogoDataUrl(file);
      set(kind === "ppn" ? "logoPpn" : "logoNonPpn", dataUrl);
    } catch (err) {
      toast.error("Logo tidak bisa dipakai.", { description: (err as Error).message });
    } finally {
      setProcessingLogo(null);
    }
  };

  const save = async () => {
    if (!branchId || !session || saving) return;
    setSaving(true);
    try {
      await saveBranchInfo(branchId, { address: form.address, phone: form.phone, email: form.email, signerName: form.signerName });
    } catch (err) {
      setSaving(false);
      toast.error("Gagal menyimpan alamat/telepon/email.", { description: (err as Error).message });
      return;
    }
    try {
      await saveBranchLetterhead(branchId, { storeName: form.storeName, logoPpnData: form.logoPpn, logoNonPpnData: form.logoNonPpn }, session.user.id);
    } catch (err) {
      setSaving(false);
      const message = (err as Error).message;
      toast.error("Alamat/telepon/email tersimpan, tapi nama toko & logo gagal.", {
        description: /branch_letterhead|schema cache|does not exist/i.test(message) ? `${message} — pastikan migration branch_letterhead sudah dijalankan di Supabase.` : message,
        duration: 10000,
      });
      return;
    }
    setSaved(form);
    setSaving(false);
    toast.success("Info cabang tersimpan.", { description: "Penawaran berikutnya (dan pratinjau/cetak) langsung memakai data ini." });
  };

  if (!isSuperAdmin) {
    return <div style={{ minHeight: "50vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", color: "#707786" }}>Hanya Super Admin yang bisa mengubah info cabang.</div>;
  }
  if (loading) return <div style={{ minHeight: "50vh", display: "grid", placeItems: "center", color: "#707786" }}>Memuat info cabang…</div>;
  if (loadError) return <div style={{ minHeight: "50vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", color: "#b23b2c" }}>{loadError}</div>;

  const logoCard = (kind: "ppn" | "nonppn") => {
    const isPpn = kind === "ppn";
    const custom = isPpn ? form.logoPpn : form.logoNonPpn;
    const fallback = isPpn ? LOGO_PPN_BASE64 : LOGO_NON_PPN_BASE64;
    return (
      <div className="bi-logo-card">
        <header>
          <strong>{isPpn ? "Logo penawaran PPN" : "Logo penawaran non-PPN"}</strong>
          <span className={custom ? "bi-badge" : "bi-badge default"}>{custom ? "Logo khusus cabang" : "Logo bawaan"}</span>
        </header>
        <small>{isPpn ? "Dipakai jika ada minimal 1 ALT yang memakai PPN (identitas badan usaha)." : "Dipakai jika semua ALT tanpa PPN (identitas brand dagang)."}</small>
        <LetterheadPreview logo={custom || fallback} form={form} />
        <div className="bi-actions">
          <label className="outline-button" style={{ cursor: "pointer" }}>
            {processingLogo === kind ? <LoaderCircle className="spin-icon" size={16} /> : <ImagePlus size={16} />}
            {processingLogo === kind ? "Memproses…" : custom ? "Ganti logo" : "Upload logo"}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => { void pickLogo(kind, event.target.files?.[0]); event.target.value = ""; }}
            />
          </label>
          {custom && (
            <button type="button" className="outline-button" onClick={() => set(isPpn ? "logoPpn" : "logoNonPpn", null)}>
              <RotateCcw size={16} /> Pakai logo bawaan
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="branch-info-page">
      <style>{PAGE_CSS}</style>
      <p className="eyebrow">INFO CABANG</p>
      <h1>Kop Surat {branchName ?? "Cabang"}</h1>
      <p className="bi-lead">Data di bawah tampil di kop surat penawaran cabang ini (pratinjau, cetak, dan PDF). Ganti cabang lewat tab di atas.</p>

      <section className="bi-card">
        <h2>Identitas & kontak</h2>
        <p>Kolom yang dikosongkan akan tampil sebagai pengingat oranye di dokumen penawaran.</p>
        <div className="bi-grid">
          <label className="bi-field wide"><span>NAMA TOKO</span><input value={form.storeName} onChange={(event) => set("storeName", event.target.value)} placeholder="Mis. SOLO CCTV - CABANG BALI" /></label>
          <label className="bi-field wide"><span>ALAMAT</span><textarea value={form.address} onChange={(event) => set("address", event.target.value)} placeholder="Alamat lengkap cabang" /></label>
          <label className="bi-field"><span>TELEPON</span><input value={form.phone} onChange={(event) => set("phone", event.target.value)} inputMode="tel" placeholder="Mis. 0812-3456-7890" /></label>
          <label className="bi-field"><span>EMAIL</span><input value={form.email} onChange={(event) => set("email", event.target.value)} inputMode="email" placeholder="cabang@perusahaan.com" /></label>
          <label className="bi-field wide"><span>NAMA PENANDATANGAN</span><input value={form.signerName} onChange={(event) => set("signerName", event.target.value)} placeholder="Nama yang tercetak di bagian tanda tangan" /></label>
        </div>
      </section>

      <section className="bi-card">
        <h2>Logo kop surat</h2>
        <p>Logo dipilih otomatis mengikuti status PPN dokumen. Gambar dikecilkan otomatis; PNG transparan paling bagus hasilnya.</p>
        <div className="bi-logos">
          {logoCard("ppn")}
          {logoCard("nonppn")}
        </div>
      </section>

      <div className="bi-savebar">
        <span>{dirty ? "Ada perubahan yang belum disimpan." : "Semua perubahan sudah tersimpan."}</span>
        <button className="save-button" onClick={save} disabled={!dirty || saving}>
          {saving ? <LoaderCircle className="spin-icon" size={16} /> : <Save size={16} />} {saving ? "Menyimpan…" : "Simpan Info Cabang"}
        </button>
      </div>
    </div>
  );
}

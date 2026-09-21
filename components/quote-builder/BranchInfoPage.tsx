/**
 * Info Cabang -- identitas kop surat penawaran per cabang.
 *
 * Kop surat punya DUA versi, dipilih otomatis per dokumen (ada minimal 1 ALT
 * yang pakai PPN -> versi PPN, selain itu versi non-PPN). Tiap versi punya
 * sendiri: nama toko, alamat, telepon, email, dan logo. Nama penandatangan
 * dipakai bersama.
 *
 * Penyimpanan:
 *   - Versi NON-PPN = data utama cabang: alamat/telepon/email -> kolom tabel
 *     `branches` (juga dipakai menu lain, mis. Servis); nama toko + logo ->
 *     tabel `branch_letterhead`.
 *   - Versi PPN = kolom `*_ppn` di `branch_letterhead`. Kolom PPN yang
 *     dikosongkan otomatis memakai data non-PPN, jadi cukup isi yang BEDA.
 *   - Logo = data URL base64 yang dikecilkan otomatis di browser (sengaja
 *     bukan file eksternal supaya PDF penawaran tidak gagal render gambar).
 * Semua hanya bisa ditulis Super Admin (RLS branches & branch_letterhead).
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
  signerName: string;
  // Kop non-PPN (data utama)
  storeName: string;
  address: string;
  phone: string;
  email: string;
  logoNonPpn: string | null;
  // Kop PPN (kosong = ikut non-PPN)
  storeNamePpn: string;
  addressPpn: string;
  phonePpn: string;
  emailPpn: string;
  logoPpn: string | null;
};

const EMPTY_FORM: FormState = {
  signerName: "", storeName: "", address: "", phone: "", email: "", logoNonPpn: null,
  storeNamePpn: "", addressPpn: "", phonePpn: "", emailPpn: "", logoPpn: null,
};

const PAGE_CSS = `
.qb-root .branch-info-page{padding:34px 32px 56px;max-width:1120px}
.qb-root .branch-info-page h1{margin:6px 0 8px;color:#16233b;font-size:28px;font-weight:760;letter-spacing:-.03em}
.qb-root .branch-info-page .bi-lead{max-width:680px;margin:0 0 22px;color:#718099;font-size:14px;line-height:1.6}
.qb-root .branch-info-page .bi-card{margin-bottom:18px;padding:22px;border:1px solid #e1e7ef;border-radius:20px;background:#fff;box-shadow:0 13px 35px rgba(30,52,90,.045)}
.qb-root .branch-info-page .bi-card h2{margin:0 0 4px;color:#182641;font-size:16px}
.qb-root .branch-info-page .bi-card>p{margin:0 0 16px;color:#7a8799;font-size:12px;line-height:1.5}
.qb-root .branch-info-page .bi-variants{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.qb-root .branch-info-page .bi-variants .bi-card{margin-bottom:0}
.qb-root .branch-info-page .bi-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:4px}
.qb-root .branch-info-page .bi-card-head h2{margin:0}
.qb-root .branch-info-page .bi-fields{display:grid;gap:12px;margin:16px 0}
.qb-root .branch-info-page .bi-field{display:grid;gap:6px}
.qb-root .branch-info-page .bi-field>span{color:#78859a;font-size:10px;font-weight:800;letter-spacing:.09em}
.qb-root .branch-info-page .bi-field input,.qb-root .branch-info-page .bi-field textarea{border:1px solid #dfe5ed;border-radius:10px;padding:10px 12px;color:#2b3850;background:#fff;font-size:13px;font-weight:600;font-family:inherit}
.qb-root .branch-info-page .bi-field textarea{min-height:64px;resize:vertical}
.qb-root .branch-info-page .bi-badge{padding:4px 9px;border-radius:999px;font-size:10px;font-weight:800;color:#4566be;background:#eff3ff;white-space:nowrap}
.qb-root .branch-info-page .bi-badge.default{color:#7a8799;background:#eef0f5}
.qb-root .branch-info-page .bi-preview{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 14px;background:#fff;border-radius:6px;box-shadow:0 0 0 1px #e3e6ec}
.qb-root .branch-info-page .bi-preview img{display:block;height:44px;width:auto;max-width:48%;object-fit:contain;object-position:left center}
.qb-root .branch-info-page .bi-preview div{display:grid;gap:3px;color:#555;font-size:9px;text-align:right;min-width:0}
.qb-root .branch-info-page .bi-preview div strong{color:#1d2433;font-size:11px}
.qb-root .branch-info-page .bi-preview div span.missing{color:#c17a2f;font-style:italic}
.qb-root .branch-info-page .bi-actions{display:flex;flex-wrap:wrap;gap:8px}
.qb-root .branch-info-page .bi-savebar{position:sticky;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:18px;padding:14px 18px;border:1px solid #dce5f6;border-radius:16px;background:rgba(248,250,255,.97);backdrop-filter:blur(4px)}
.qb-root .branch-info-page .bi-savebar span{color:#6d7d99;font-size:12px}
@media (max-width:1000px){
  .qb-root .branch-info-page .bi-variants{grid-template-columns:1fr}
}
@media (max-width:900px){
  .qb-root .branch-info-page{padding:22px 16px 48px}
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

type PreviewInfo = { storeName: string; phone: string; email: string; address: string };

function LetterheadPreview({ logo, info }: { logo: string; info: PreviewInfo }) {
  const line = (value: string, placeholder: string) => (value.trim() ? <span>{value.trim()}</span> : <span className="missing">{placeholder}</span>);
  return (
    <div className="bi-preview" aria-label="Pratinjau kop surat">
      <img src={logo} alt="Pratinjau logo" />
      <div>
        {info.storeName.trim() && <strong>{info.storeName.trim()}</strong>}
        {line(info.phone, "(nomor telepon belum diisi)")}
        {line(info.email, "(email belum diisi)")}
        {line(info.address, "(alamat belum diisi)")}
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
          signerName: branch.signer_name ?? "",
          storeName: branch.store_name ?? "",
          address: branch.address ?? "",
          phone: branch.phone ?? "",
          email: branch.email ?? "",
          logoNonPpn: branch.logo_non_ppn_data ?? null,
          storeNamePpn: branch.store_name_ppn ?? "",
          addressPpn: branch.address_ppn ?? "",
          phonePpn: branch.phone_ppn ?? "",
          emailPpn: branch.email_ppn ?? "",
          logoPpn: branch.logo_ppn_data ?? null,
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
      toast.error("Gagal menyimpan alamat/telepon/email utama.", { description: (err as Error).message });
      return;
    }
    try {
      await saveBranchLetterhead(
        branchId,
        {
          storeName: form.storeName,
          storeNamePpn: form.storeNamePpn,
          addressPpn: form.addressPpn,
          phonePpn: form.phonePpn,
          emailPpn: form.emailPpn,
          logoPpnData: form.logoPpn,
          logoNonPpnData: form.logoNonPpn,
        },
        session.user.id,
      );
    } catch (err) {
      setSaving(false);
      const message = (err as Error).message;
      toast.error("Data utama tersimpan, tapi nama toko/logo/data kop PPN gagal.", {
        description: /branch_letterhead|schema cache|does not exist|column/i.test(message)
          ? `${message} — pastikan migration branch_letterhead (2 file) sudah dijalankan di Supabase.`
          : message,
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

  const inputProps = (key: keyof FormState, extra?: { placeholder?: string; inputMode?: "tel" | "email" }) => ({
    value: (form[key] as string) ?? "",
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, event.target.value as never),
    ...extra,
  });

  // Data efektif tiap versi (persis aturan di editor penawaran): PPN kosong -> ikut non-PPN.
  const nonPpnInfo: PreviewInfo = { storeName: form.storeName, phone: form.phone, email: form.email, address: form.address };
  const ppnInfo: PreviewInfo = {
    storeName: form.storeNamePpn.trim() || form.storeName,
    phone: form.phonePpn.trim() || form.phone,
    email: form.emailPpn.trim() || form.email,
    address: form.addressPpn.trim() || form.address,
  };

  const logoActions = (kind: "ppn" | "nonppn") => {
    const custom = kind === "ppn" ? form.logoPpn : form.logoNonPpn;
    return (
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
          <button type="button" className="outline-button" onClick={() => set(kind === "ppn" ? "logoPpn" : "logoNonPpn", null)}>
            <RotateCcw size={16} /> Pakai logo bawaan
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="branch-info-page">
      <style>{PAGE_CSS}</style>
      <p className="eyebrow">INFO CABANG</p>
      <h1>Kop Surat {branchName ?? "Cabang"}</h1>
      <p className="bi-lead">
        Kop surat punya dua versi. Dokumen yang memakai PPN (minimal 1 ALT ber-PPN) memakai kop PPN; selain itu memakai kop non-PPN.
        Ganti cabang lewat tab di atas.
      </p>

      <section className="bi-card">
        <h2>Penandatangan</h2>
        <p>Dipakai di bagian tanda tangan kedua versi kop.</p>
        <label className="bi-field"><span>NAMA PENANDATANGAN</span><input {...inputProps("signerName", { placeholder: "Nama yang tercetak di bagian tanda tangan" })} /></label>
      </section>

      <div className="bi-variants">
        <section className="bi-card">
          <div className="bi-card-head">
            <h2>Kop non-PPN</h2>
            <span className={form.logoNonPpn ? "bi-badge" : "bi-badge default"}>{form.logoNonPpn ? "Logo khusus cabang" : "Logo bawaan"}</span>
          </div>
          <p>Data utama cabang (alamat, telepon, dan email juga dipakai menu lain seperti Servis).</p>
          <LetterheadPreview logo={form.logoNonPpn || LOGO_NON_PPN_BASE64} info={nonPpnInfo} />
          <div className="bi-fields">
            <label className="bi-field"><span>NAMA TOKO</span><input {...inputProps("storeName", { placeholder: "Mis. SOLO CCTV - CABANG BALI" })} /></label>
            <label className="bi-field"><span>ALAMAT</span><textarea {...inputProps("address", { placeholder: "Alamat lengkap cabang" })} /></label>
            <label className="bi-field"><span>TELEPON</span><input {...inputProps("phone", { inputMode: "tel", placeholder: "Mis. 0812-3456-7890" })} /></label>
            <label className="bi-field"><span>EMAIL</span><input {...inputProps("email", { inputMode: "email", placeholder: "cabang@perusahaan.com" })} /></label>
          </div>
          {logoActions("nonppn")}
        </section>

        <section className="bi-card">
          <div className="bi-card-head">
            <h2>Kop PPN</h2>
            <span className={form.logoPpn ? "bi-badge" : "bi-badge default"}>{form.logoPpn ? "Logo khusus cabang" : "Logo bawaan"}</span>
          </div>
          <p>Isi hanya yang berbeda dari non-PPN. Kolom yang dikosongkan otomatis memakai data non-PPN (ditampilkan abu-abu sebagai petunjuk).</p>
          <LetterheadPreview logo={form.logoPpn || LOGO_PPN_BASE64} info={ppnInfo} />
          <div className="bi-fields">
            <label className="bi-field"><span>NAMA TOKO / BADAN USAHA</span><input {...inputProps("storeNamePpn", { placeholder: form.storeName || "Sama dengan non-PPN" })} /></label>
            <label className="bi-field"><span>ALAMAT</span><textarea {...inputProps("addressPpn", { placeholder: form.address || "Sama dengan non-PPN" })} /></label>
            <label className="bi-field"><span>TELEPON</span><input {...inputProps("phonePpn", { inputMode: "tel", placeholder: form.phone || "Sama dengan non-PPN" })} /></label>
            <label className="bi-field"><span>EMAIL</span><input {...inputProps("emailPpn", { inputMode: "email", placeholder: form.email || "Sama dengan non-PPN" })} /></label>
          </div>
          {logoActions("ppn")}
        </section>
      </div>

      <div className="bi-savebar">
        <span>{dirty ? "Ada perubahan yang belum disimpan." : "Semua perubahan sudah tersimpan."}</span>
        <button className="save-button" onClick={save} disabled={!dirty || saving}>
          {saving ? <LoaderCircle className="spin-icon" size={16} /> : <Save size={16} />} {saving ? "Menyimpan…" : "Simpan Info Cabang"}
        </button>
      </div>
    </div>
  );
}

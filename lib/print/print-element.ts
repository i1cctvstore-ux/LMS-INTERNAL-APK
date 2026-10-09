// =====================================================
// lib/print/print-element.ts
// =====================================================
// Cetak / "Simpan sebagai PDF" yang benar untuk dokumen panjang.
//
// MASALAH LAMA: dokumen dicetak "di tempat" dengan trik
// `body * { visibility:hidden }` + `position: fixed/absolute`. Elemen
// yang tersembunyi lewat `visibility` TETAP memakai ruang di halaman,
// dan elemen `position:fixed` hanya dicetak di halaman pertama / terpotong
// (Chrome). Akibatnya PDF: halaman awal kosong, isi terpotong, atau
// hanya 1 halaman.
//
// CARA BARU: dokumen disalin (clone) ke satu wadah di <body>, lalu
// SEMUA isi <body> yang lain di-`display:none` hanya saat mode cetak.
// Dokumen mengalir normal sehingga pindah halaman otomatis benar.
// Judul tab (document.title) juga diganti sementara ke nama file yang
// diinginkan -- itulah yang dipakai browser sebagai nama file PDF.

const ROOT_ID = "print-clone-root";
const STYLE_ID = "print-clone-style";

/** Nama file aman: huruf/angka/_/-, tanpa spasi & karakter terlarang. */
export function sanitizeFileName(value: string, fallback = "dokumen"): string {
  const cleaned = (value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

/** Gabung beberapa bagian nama file dengan "_" -- bagian kosong dilewati. */
export function buildFileName(...parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => sanitizeFileName(p ?? "", ""))
    .filter(Boolean)
    .join("_");
}

export type PrintElementOptions = {
  /** Nama file PDF (tanpa .pdf) -- dipakai sebagai judul dokumen saat cetak. */
  title: string;
  /** Class pembungkus supaya selector CSS berlingkup (mis. "qb-root") tetap berlaku. */
  wrapperClassName?: string;
  /** Isi aturan @page, mis. "size: A4 portrait; margin: 14mm". */
  page?: string;
  /** CSS cetak tambahan (di-scope sendiri oleh pemanggil). */
  extraCss?: string;
};

function cleanup() {
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
}

async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
            setTimeout(resolve, 3000);
          }),
    ),
  );
}

export async function printElement(source: HTMLElement, opts: PrintElementOptions): Promise<void> {
  cleanup();

  const root = document.createElement("div");
  root.id = ROOT_ID;
  if (opts.wrapperClassName) root.className = opts.wrapperClassName;

  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-no-print]").forEach((n) => n.remove());
  // Salinan tidak boleh ikut ter-id ganda / ref-able.
  clone.removeAttribute("id");
  root.appendChild(clone);
  document.body.appendChild(root);

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} { display: none; }
    @media print {
      @page { ${opts.page ?? "size: A4 portrait; margin: 14mm"} }
      html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; }
      body > *:not(#${ROOT_ID}) { display: none !important; }
      #${ROOT_ID} { display: block !important; position: static !important; width: auto !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
      #${ROOT_ID}, #${ROOT_ID} * { visibility: visible !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      #${ROOT_ID} tr, #${ROOT_ID} img { break-inside: avoid; }
      #${ROOT_ID} thead { display: table-header-group; }
      #${ROOT_ID} [data-keep-together] { break-inside: avoid; }
      ${opts.extraCss ?? ""}
    }
  `;
  document.head.appendChild(style);

  const previousTitle = document.title;
  document.title = opts.title;

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    document.title = previousTitle;
    cleanup();
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  // Cadangan untuk browser yang tidak mengirim afterprint (sebagian mobile).
  const mq = window.matchMedia?.("print");
  const onMq = (e: MediaQueryListEvent) => {
    if (!e.matches) restore();
  };
  mq?.addEventListener?.("change", onMq);

  await waitForImages(root);
  // Beri 1 frame supaya layout salinan selesai sebelum dialog cetak.
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  window.print();
}

# Cara Pasang — Modul Proyek (versi disesuaikan project asli kamu)

Zip ini sudah disesuaikan setelah saya cek isi
`i1cctv-intranet-supabase.zip` punya kamu. Dua penyesuaian besar:

1. **Bukan Next.js routing** — project kamu satu halaman (`/`), modul
   di-switch lewat state `activePage`, bukan folder `app/proyek/`. Jadi
   folder `app/proyek/` yang saya kasih di zip sebelumnya sudah saya buang,
   ganti jadi komponen switcher biasa.
2. **Base UI, bukan Radix** — komponen `components/ui/*` kamu pakai
   `@base-ui/react`, pola `render={<Button/>}` bukan `asChild`. Semua
   komponen Proyek sudah saya tulis ulang mengikuti pola itu, dan saya
   tambahkan 4 komponen shadcn yang belum ada di project kamu (tabs,
   alert-dialog, checkbox, textarea) — dibuat manual ikut gaya
   `components/ui/dialog.tsx` & `components/ui/select.tsx` kamu, BUKAN
   generate dari CLI. Cek dulu tampilannya, siapa tahu ada detail kecil
   yang meleset dari versi asli shadcn/base-ui registry.

## File BARU — tinggal ditambahkan (tidak ada file yang sama di project kamu)

```
components/
  projects/
    projects-page.tsx            → "Halaman" Proyek, switch antara daftar & detail
    project-management.tsx        → Isi daftar proyek (tabel + list card mobile)
    project-detail.tsx            → Isi detail 1 proyek (status, log, dokumen)
    stage-badge.tsx                 → Badge kecil status proyek
    stage-tracker.tsx               → Komponen pilih tahapan (Survey→Selesai)
    add-project-dialog.tsx          → Popup "Proyek Baru"
    add-log-dialog.tsx              → Popup "Tambah Log"
    add-document-dialog.tsx         → Popup "Tambah Dokumen"
    edit-project-info-dialog.tsx    → Popup "Edit Info"
  ui/
    tabs.tsx        → BARU, belum ada di project kamu
    alert-dialog.tsx → BARU, belum ada di project kamu
    checkbox.tsx     → BARU, belum ada di project kamu
    textarea.tsx     → BARU, belum ada di project kamu

lib/
  projects.ts   → Tipe data & helper format tanggal untuk modul Proyek

supabase/
  migrations/
    20260710000000_create_projects.sql → Skema tabel Supabase (dijalankan di
    Supabase Dashboard, bukan dicopy ke project)
```

**Cara pasang bagian ini:** extract zip, copy folder-folder di atas ke
project kamu. Karena semuanya nama file baru, aman — tidak menimpa apa pun.

## File PENGGANTI — ini yang perlu hati-hati

Dua file ini **sudah ada** di project kamu dan isinya perlu diedit supaya
menu "Proyek" muncul di sidebar. Saya kirim versi lengkapnya di zip ini
(sudah termasuk isi asli project kamu + tambahan bagian Proyek):

```
app/page.tsx          → PENGGANTI. Saya tambahkan:
                         - import ProjectsPage
                         - case 'proyek': return <ProjectsPage />
                         di dalam renderPage()

lib/nav-config.tsx     → PENGGANTI. Saya tambahkan:
                         - PageKey 'proyek'
                         - Import ikon FolderKanban
                         - Entri nav "Proyek" (muncul untuk semua role,
                           taruh di urutan kedua setelah Dashboard)
```

**Cara pasang bagian ini:** buka kedua file itu di project kamu,
bandingkan dengan isi di zip ini. Kalau sejak zip lama kamu belum ubah
kedua file itu secara manual, tinggal timpa langsung. Kalau sudah sempat
ubah (mis. nambah menu lain), gabungkan manual — perubahan saya cuma
menyisipkan bagian "Proyek" di 2-3 tempat, tidak menghapus apa pun yang
sudah ada.

## Langkah pasang lengkap

1. Copy semua file BARU ke project kamu (lihat daftar di atas).
2. Timpa/gabungkan `app/page.tsx` dan `lib/nav-config.tsx` sesuai
   penjelasan di atas.
3. **Jalankan migration SQL**: Supabase Dashboard → SQL Editor → paste isi
   `supabase/migrations/20260710000000_create_projects.sql` → Run.
4. **Buat Storage bucket** `project-files` di Supabase Dashboard → Storage
   (untuk fitur unggah dokumen).
5. `npm install` kalau ada package baru kebawa (harusnya tidak ada — semua
   pakai `@base-ui/react` yang sudah ada di `package.json` kamu).
6. `npm run dev`, login, klik menu "Proyek" di sidebar.

## Kalau ada error setelah pasang

Yang paling mungkin: 4 komponen `ui/*` baru (tabs, alert-dialog, checkbox,
textarea) saya tulis manual berdasarkan pola project kamu, bukan hasil
`npx shadcn add`. Kalau kamu punya akses jalanin shadcn CLI, lebih aman
generate ulang 4 file itu lewat CLI (`npx shadcn@latest add tabs
alert-dialog checkbox textarea` — sesuaikan dulu config base-ui-nya kalau
CLI belum kenal `base-nova`), lalu biarkan file-file di `components/projects/`
saya apa adanya karena importnya pakai nama komponen standar
(`Tabs`, `TabsContent`, `AlertDialogAction`, dst) yang seharusnya cocok.

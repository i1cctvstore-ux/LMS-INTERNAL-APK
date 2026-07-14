# i1 CCTV — Sistem Internal Toko

Aplikasi internal toko i1 CCTV (Next.js) untuk login staf dan manajemen karyawan,
terhubung ke **Supabase** (Database + Auth).

## Yang sudah dibereskan dari versi v0

Versi asli dari v0 tampilannya sudah jadi, tapi semua datanya **mock** (login
menerima email/password apa saja, daftar karyawan hilang saat refresh halaman).
Belum ada kode yang benar-benar bicara ke Supabase meskipun env var-nya sudah ada.

Sekarang:
- Login memakai **Supabase Auth** yang sesungguhnya (`supabase.auth.signInWithPassword`).
- Data karyawan disimpan di tabel `profiles` (lihat `supabase/schema.sql`).
- Tambah karyawan, ubah role, aktif/nonaktif, dan reset password semuanya
  tersambung ke Supabase lewat API route di `app/api/employees/*`.
- Role yang tersedia: `super_admin`, `admin`, `kasir`, `gudang`, `teknisi`.
  Hanya `admin` dan `super_admin` yang boleh menambah/mengubah karyawan
  (`kasir`/`gudang`/`teknisi` cuma bisa melihat daftar). Pembatasan lebih detail
  antara `admin` dan `super_admin` (mis. siapa boleh atur akun admin lain, menu
  mana yang dibatasi) masih dirancang menyusul.
- Kolom `lms_access_level` dan `lms_job_type` di tabel `profiles` dihitung
  otomatis dari `role` (dipakai modul LMS Internal nanti — lihat komentar di
  `supabase/schema.sql`).

## Setup (sekali saja)

### 1. Siapkan project Supabase
Kalau belum punya, buat project baru di [supabase.com](https://supabase.com).
Ambil 3 nilai ini dari **Project Settings → API**:
- `Project URL` → jadi `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key → jadi `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key (rahasia!) → jadi `SUPABASE_SERVICE_ROLE_KEY`

### 2. Jalankan skema database
Buka **SQL Editor** di dashboard Supabase → New query → tempel isi file
`supabase/schema.sql` → Run. Ini akan membuat tabel `profiles` beserta aturan
keamanannya (Row Level Security).

### 3. Isi environment variable
Salin `.env.example` menjadi `.env.local`, isi 3 nilai dari langkah 1.

```bash
cp .env.example .env.local
```

### 4. (Opsional) Buat akun karyawan awal lewat script seed
Edit daftar nama/email/role di `supabase/seed.mjs`, lalu jalankan:

```bash
npm install
node --env-file=.env.local supabase/seed.mjs
```

Password untuk tiap akun akan dicetak sekali di terminal — salin dan bagikan
ke karyawan terkait. Kalau lebih suka menambah karyawan lewat aplikasi saja
(menu **User Role** setelah login sebagai Admin), langkah ini boleh dilewati.

> Catatan: karena `profiles` mensyaratkan role `'admin'` atau `'super_admin'` untuk
> mengubah data, pastikan minimal satu akun awal berperan `super_admin` (lewat
> seed atau lewat SQL Editor secara manual:
> `update profiles set role = 'super_admin' where email = '...'`).

### 5. Deploy ke Vercel
1. Push folder ini ke GitHub (atau upload langsung ke Vercel).
2. Import project di Vercel.
3. Di **Project Settings → Environment Variables**, tambahkan 3 variabel yang
   sama seperti di `.env.local`.
4. Deploy. Selesai — tidak perlu ubah kode apa pun lagi.

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

## Struktur relevan untuk Supabase

```
supabase/
  schema.sql        # tabel profiles + RLS, jalankan di SQL Editor
  seed.mjs           # script bikin akun karyawan awal (opsional)
middleware.ts         # wajib login untuk SEMUA halaman kecuali "/"
lib/supabase/
  client.ts          # Supabase client untuk komponen browser
  server.ts           # Supabase client untuk Route Handler (pakai sesi cookie)
  admin.ts             # Supabase client service-role, HANYA dipakai di server
  middleware.ts          # dipakai middleware.ts untuk refresh sesi & redirect
  require-admin.ts      # helper cek "apakah user ini Admin aktif?"
app/api/employees/      # route handler: list, tambah, ubah role/status, reset password
```

### Soal middleware.ts

- Semua halaman **wajib login** kecuali `/` (karena `/` sendiri yang menampilkan
  `LoginScreen` kalau belum ada sesi).
- Saat ini **belum ada pembatasan per-role** di level halaman — semua akun yang
  sudah login boleh membuka semua menu. Pembatasan role (mis. hanya Admin yang
  boleh mengubah data) tetap dicek di level API (`require-admin.ts`), bukan di
  middleware.
- Kalau nanti ditambah halaman baru dengan route sendiri (mis. `app/stok/page.tsx`),
  otomatis ikut terlindungi tanpa perlu ubah `middleware.ts` — asal path-nya bukan
  di dalam `/api/*`.

## Keamanan

- File `.env.local` **tidak ikut ter-zip / commit** (sudah di `.gitignore`).
  Isi ulang manual dari dashboard Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` sengaja hanya dipakai di server (`lib/supabase/admin.ts`,
  ditandai `server-only`) — jangan pernah taruh key ini di kode yang jalan di browser.
- Karena file zip v0 sebelumnya menyertakan `.env.local` berisi key asli, sebaiknya
  **rotate `service_role` key** di Supabase Dashboard → Project Settings → API kalau
  file itu pernah dibagikan ke pihak lain, lalu update lagi env var di Vercel.

---

Dibangun awalnya dengan [v0](https://v0.app), disambungkan ke Supabase secara manual.

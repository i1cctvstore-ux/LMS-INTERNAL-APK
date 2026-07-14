-- =====================================================
-- i1 CCTV — Sistem Internal Toko
-- Jalankan file ini di Supabase Dashboard → SQL Editor → New Query → Run
-- Aman dijalankan berulang kali (pakai IF NOT EXISTS / OR REPLACE).
--
-- Kalau kamu SUDAH PERNAH menjalankan versi lama file ini (role masih
-- 'Admin'/'Teknisi'/'Kasir'/'Gudang' huruf besar, belum ada Super Admin),
-- jalankan dulu blok MIGRASI di paling bawah file ini SEBELUM bagian ini,
-- atau langsung jalankan seluruh file ini dari atas — sudah aman ditimpa.
-- =====================================================

-- 1. Tabel profil karyawan.
--    id = sama dengan id akun di Supabase Auth (auth.users).
--    role menentukan 2 hal turunan otomatis untuk modul LMS Internal:
--      - lms_access_level: 'utama' (super_admin) atau 'staff' (role lainnya)
--      - lms_job_type: 'teknisi' (role teknisi) atau 'admin' (role lainnya)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null default 'teknisi'
    check (role in ('super_admin', 'admin', 'kasir', 'gudang', 'teknisi')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Data karyawan i1 CCTV: nama, role, status aktif. 1 baris = 1 akun Supabase Auth.';
comment on column public.profiles.role is 'Bagian/jabatan: super_admin, admin, kasir, gudang, teknisi.';

-- Kolom turunan (dihitung otomatis oleh Postgres dari `role`, tidak bisa diisi manual).
-- Dipakai nanti oleh modul LMS Internal untuk kontrol akses materi & soal uji.
alter table public.profiles
  drop column if exists lms_access_level;
alter table public.profiles
  add column lms_access_level text generated always as (
    case when role = 'super_admin' then 'utama' else 'staff' end
  ) stored;
comment on column public.profiles.lms_access_level is
  '"utama" = boleh kelola materi & lihat Verifikasi (super_admin). "staff" = cuma lihat materi & tandai siap diuji.';

alter table public.profiles
  drop column if exists lms_job_type;
alter table public.profiles
  add column lms_job_type text generated always as (
    case when role = 'teknisi' then 'teknisi' else 'admin' end
  ) stored;
comment on column public.profiles.lms_job_type is
  'Tipe materi LMS yang relevan: "teknisi" untuk kategori Instalasi, "admin" untuk kategori Admin.';

-- 2. Auto-update kolom updated_at setiap kali baris diubah.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- 3. Row Level Security.
alter table public.profiles enable row level security;

-- Semua staf yang sudah login boleh MELIHAT daftar karyawan (untuk halaman User Role & dashboard).
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- Hanya Super Admin yang boleh MENGUBAH data karyawan (role/status aktif).
-- Menu "User Role" di aplikasi memang cuma dimunculkan untuk super_admin,
-- policy ini adalah lapisan pengaman tambahan di level database.
-- INSERT/DELETE karyawan baru sengaja TIDAK dibuka lewat RLS biasa — proses itu
-- selalu lewat API route server (/api/employees) memakai service role key,
-- supaya pembuatan akun Supabase Auth & baris profil selalu konsisten (1 transaksi).
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'super_admin'
        and p.active = true
    )
  );

-- 4. Index bantu pencarian email (dipakai saat cek duplikat).
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- =====================================================
-- MIGRASI (hanya perlu dijalankan kalau tabel `profiles` sudah ada dari
-- versi lama dengan role huruf besar 'Admin'/'Teknisi'/'Kasir'/'Gudang').
-- Jalankan blok ini SEBELUM bagian di atas kalau constraint lama masih aktif,
-- supaya nilai role yang sudah ada tidak melanggar constraint baru.
-- =====================================================
-- alter table public.profiles drop constraint if exists profiles_role_check;
-- update public.profiles set role = lower(role);
-- alter table public.profiles alter column role set default 'teknisi';

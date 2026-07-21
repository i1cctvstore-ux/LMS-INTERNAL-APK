-- ============================================================================
-- Modul LMS: Materi + Verifikasi
-- ============================================================================
-- Asumsi yang dipakai migration ini (SESUAIKAN kalau beda di project asli):
--   1. Tabel `profiles` sudah ada dengan kolom `id` (= auth.uid()) dan `role`
--      bertipe text/enum berisi salah satu dari:
--      'super_admin' | 'admin' | 'kasir' | 'gudang' | 'teknisi'
--   2. Belum ada helper function `is_super_admin()`. Kalau project sudah
--      punya function serupa (mis. dari RLS employee management), boleh
--      hapus function di bawah dan pakai yang sudah ada — tinggal ganti
--      semua pemanggilan `is_super_admin()` di policy jadi nama function itu.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: cek apakah user yang sedang login adalah super_admin
-- ---------------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

-- Helper: ambil role user yang sedang login (dipakai buat cek target_roles)
create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- updated_at trigger helper (idempotent, khusus modul LMS supaya gak
-- bentrok kalau project sudah punya trigger generik dengan nama lain)
-- ---------------------------------------------------------------------------
create or replace function public.lms_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1) lms_materials — data materi yang boleh dilihat karyawan
-- ============================================================================
create table if not exists public.lms_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,        -- mis. 'Admin', 'Teknis', 'Instalasi', 'Tutorial', 'Materi'
  section text not null default 'Umum',  -- judul grup tampilan, mis. "Administrasi & Operasional"
  content text not null default '',
  -- null / '{}' artinya materi ini terlihat oleh SEMUA role.
  -- Kalau diisi, cuma role yang ada di array ini (+ super_admin) yang bisa lihat.
  target_roles text[] not null default '{}',
  ready_to_test boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists lms_materials_set_updated_at on public.lms_materials;
create trigger lms_materials_set_updated_at
  before update on public.lms_materials
  for each row execute function public.lms_set_updated_at();

alter table public.lms_materials enable row level security;

-- SELECT: super_admin lihat semua. Role lain cuma lihat materi yang
-- target_roles-nya kosong (=semua boleh) ATAU memuat role dia.
drop policy if exists lms_materials_select on public.lms_materials;
create policy lms_materials_select on public.lms_materials
  for select
  using (
    public.is_super_admin()
    or target_roles = '{}'
    or public.current_user_role() = any (target_roles)
  );

drop policy if exists lms_materials_insert on public.lms_materials;
create policy lms_materials_insert on public.lms_materials
  for insert
  with check (public.is_super_admin());

drop policy if exists lms_materials_update on public.lms_materials;
create policy lms_materials_update on public.lms_materials
  for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists lms_materials_delete on public.lms_materials;
create policy lms_materials_delete on public.lms_materials
  for delete
  using (public.is_super_admin());

-- ============================================================================
-- 2) lms_material_tests — soal uji lisan, TERPISAH dari materi supaya bisa
--    dikunci penuh cuma untuk super_admin (karyawan tidak boleh lihat soal).
--    Relasi 1:1 ke lms_materials.
-- ============================================================================
create table if not exists public.lms_material_tests (
  material_id uuid primary key references public.lms_materials(id) on delete cascade,
  questions text not null default '',
  updated_at timestamptz not null default now()
);

drop trigger if exists lms_material_tests_set_updated_at on public.lms_material_tests;
create trigger lms_material_tests_set_updated_at
  before update on public.lms_material_tests
  for each row execute function public.lms_set_updated_at();

alter table public.lms_material_tests enable row level security;

-- Cuma super_admin yang boleh baca/tulis soal uji, tanpa kecuali.
drop policy if exists lms_material_tests_all on public.lms_material_tests;
create policy lms_material_tests_all on public.lms_material_tests
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============================================================================
-- 3) lms_submissions — pengajuan verifikasi dari karyawan per materi
-- ============================================================================
create table if not exists public.lms_submissions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.lms_materials(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Satu user cuma boleh punya 1 pengajuan PENDING aktif per materi
-- (submit ulang setelah ditolak = row baru, riwayat lama tetap kesimpan).
create unique index if not exists lms_submissions_one_pending_per_user_material
  on public.lms_submissions (material_id, user_id)
  where status = 'pending';

create index if not exists lms_submissions_status_idx on public.lms_submissions (status);
create index if not exists lms_submissions_user_idx on public.lms_submissions (user_id);

alter table public.lms_submissions enable row level security;

-- SELECT: user lihat pengajuan miliknya sendiri; super_admin lihat semua.
drop policy if exists lms_submissions_select on public.lms_submissions;
create policy lms_submissions_select on public.lms_submissions
  for select
  using (user_id = auth.uid() or public.is_super_admin());

-- INSERT: user cuma boleh insert pengajuan atas nama dirinya sendiri,
-- dan wajib berstatus 'pending' saat dibuat (approve/reject cuma lewat UPDATE).
drop policy if exists lms_submissions_insert on public.lms_submissions;
create policy lms_submissions_insert on public.lms_submissions
  for insert
  with check (user_id = auth.uid() and status = 'pending');

-- UPDATE: cuma super_admin yang boleh mengubah (approve/reject + catatan).
drop policy if exists lms_submissions_update on public.lms_submissions;
create policy lms_submissions_update on public.lms_submissions
  for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- DELETE: sengaja tidak dibuka lewat policy (riwayat verifikasi harus tetap
-- ada). Kalau butuh "batalkan pengajuan" oleh karyawan sendiri selagi masih
-- pending, tambahkan policy delete khusus status = 'pending' and user_id = auth.uid().

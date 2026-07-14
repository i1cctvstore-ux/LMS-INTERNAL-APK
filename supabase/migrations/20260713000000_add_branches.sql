-- =====================================================
-- Multi-Cabang (Jakarta, Solo, Bali, Purwokerto, dst)
-- =====================================================
-- Aturan inti: SEMUA role selain super_admin cuma boleh lihat/ubah data
-- yang branch_id-nya sama dengan cabang dia sendiri. Kalau karyawan belum
-- di-assign ke cabang mana pun (branch_id kosong) dan bukan super_admin,
-- dia TIDAK LIHAT DATA APA-APA (aman by default) sampai di-assign lewat
-- halaman Kelola Cabang / User Role.

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_branches_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_branches_updated_at on public.branches;
create trigger trg_branches_updated_at
  before update on public.branches
  for each row execute function public.set_branches_updated_at();

alter table public.branches enable row level security;

-- Semua staf login boleh LIHAT daftar cabang (buat dropdown pilih cabang
-- di form karyawan/proyek). Cuma Super Admin yang boleh ubah/hapus.
drop policy if exists "branches_select_authenticated" on public.branches;
create policy "branches_select_authenticated"
  on public.branches for select to authenticated using (true);

drop policy if exists "branches_write_super_admin" on public.branches;
create policy "branches_write_super_admin"
  on public.branches for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------- Kolom branch_id di tabel yang sudah ada ----------

alter table public.profiles
  add column if not exists branch_id uuid references public.branches(id);

alter table public.projects
  add column if not exists branch_id uuid references public.branches(id);

-- ---------- Helper function dipakai di banyak policy ----------

create or replace function public.current_branch_id()
returns uuid
language sql security definer stable
set search_path = public
as $$
  select branch_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_super_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and active = true
  )
$$;

-- ---------- Ganti policy profiles: dari "semua boleh lihat semua" ----------
-- jadi "cuma lihat karyawan di cabang sendiri, kecuali super_admin".

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_by_branch"
  on public.profiles for select to authenticated
  using (
    public.is_super_admin()
    or (branch_id is not null and branch_id = public.current_branch_id())
    or id = auth.uid()  -- setiap orang tetap boleh lihat profil dirinya sendiri
  );

-- Policy update profiles yang lama (profiles_update_admin) dibiarkan apa
-- adanya kalau sudah ada di schema.sql kamu — cuma Super Admin yang boleh
-- update, jadi otomatis lintas-cabang sudah benar (Super Admin memang
-- perlu bisa assign branch_id ke cabang mana pun).

-- ---------- Ganti policy projects: filter per cabang ----------

drop policy if exists "projects_select_authenticated" on public.projects;
create policy "projects_select_by_branch"
  on public.projects for select to authenticated
  using (
    public.is_super_admin()
    or (branch_id is not null and branch_id = public.current_branch_id())
  );

drop policy if exists "projects_insert_authenticated" on public.projects;
create policy "projects_insert_by_branch"
  on public.projects for insert to authenticated
  with check (
    public.is_super_admin()
    or branch_id = public.current_branch_id()
  );

drop policy if exists "projects_update_authenticated" on public.projects;
create policy "projects_update_by_branch"
  on public.projects for update to authenticated
  using (
    public.is_super_admin()
    or (branch_id is not null and branch_id = public.current_branch_id())
  );

-- ---------- project_technicians / project_logs / project_documents ----------
-- Tabel-tabel ini tidak punya branch_id sendiri, tapi "menempel" ke projects,
-- jadi cukup dicek lewat project_id-nya proyek itu cabang apa.

drop policy if exists "project_technicians_select_authenticated" on public.project_technicians;
create policy "project_technicians_select_by_branch"
  on public.project_technicians for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_technicians.project_id
        and (public.is_super_admin() or p.branch_id = public.current_branch_id())
    )
  );

drop policy if exists "project_technicians_all_authenticated" on public.project_technicians;
create policy "project_technicians_write_by_branch"
  on public.project_technicians for all to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_technicians.project_id
        and (public.is_super_admin() or p.branch_id = public.current_branch_id())
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_technicians.project_id
        and (public.is_super_admin() or p.branch_id = public.current_branch_id())
    )
  );

drop policy if exists "project_logs_select_authenticated" on public.project_logs;
create policy "project_logs_select_by_branch"
  on public.project_logs for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_logs.project_id
        and (public.is_super_admin() or p.branch_id = public.current_branch_id())
    )
  );

drop policy if exists "project_logs_insert_authenticated" on public.project_logs;
create policy "project_logs_insert_by_branch"
  on public.project_logs for insert to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_logs.project_id
        and (public.is_super_admin() or p.branch_id = public.current_branch_id())
    )
  );

drop policy if exists "project_documents_select_authenticated" on public.project_documents;
create policy "project_documents_select_by_branch"
  on public.project_documents for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_documents.project_id
        and (public.is_super_admin() or p.branch_id = public.current_branch_id())
    )
  );

drop policy if exists "project_documents_insert_authenticated" on public.project_documents;
create policy "project_documents_insert_by_branch"
  on public.project_documents for insert to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_documents.project_id
        and (public.is_super_admin() or p.branch_id = public.current_branch_id())
    )
  );

-- Catatan: /track (halaman customer) TIDAK terpengaruh sama sekali oleh
-- perubahan ini — app/api/track/route.ts pakai admin client (bypass RLS),
-- jadi tetap bisa diakses publik tanpa login seperti biasa.

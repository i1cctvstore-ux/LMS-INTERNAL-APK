-- Modul Proyek: tabel proyek, teknisi, log aktivitas, dan dokumen.
-- Sesuaikan RLS di bawah supaya konsisten dengan kebijakan yang sudah
-- dipakai di tabel `profiles`. Ini dibuat permisif untuk semua user
-- authenticated sebagai titik awal.

create sequence if not exists public.project_code_seq;

create or replace function public.next_project_code()
returns text as $$
declare
  seq int;
begin
  seq := nextval('public.project_code_seq');
  return 'PRJ' || to_char(now(), 'YYYY') || '-' || lpad(seq::text, 4, '0');
end;
$$ language plpgsql;

grant execute on function public.next_project_code() to authenticated;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_name text not null,
  project_name text,
  area text not null,
  camera_count integer,
  eta date,
  stage text not null default 'Survey'
    check (stage in ('Survey', 'Material', 'Instalasi', 'Testing', 'BAST', 'Selesai')),
  tracking_token text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_technicians (
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (project_id, profile_id)
);

create table if not exists public.project_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  note text,
  photo_urls text[] not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  doc_type text not null default 'Lainnya',
  description text,
  file_name text not null,
  file_url text not null,
  file_size_kb integer,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_project_logs_project_id on public.project_logs(project_id);
create index if not exists idx_project_documents_project_id on public.project_documents(project_id);
create index if not exists idx_project_technicians_project_id on public.project_technicians(project_id);

-- updated_at ikut berubah tiap kali detail proyek diedit (stage, info, dsb).
create or replace function public.set_projects_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_projects_updated_at();

-- RLS dasar — persilakan diperketat (mis. hanya Admin yang boleh insert/delete)
-- kalau tabel `profiles` di project ini juga punya pola serupa.
alter table public.projects enable row level security;
alter table public.project_technicians enable row level security;
alter table public.project_logs enable row level security;
alter table public.project_documents enable row level security;

create policy "Karyawan login bisa lihat semua proyek"
  on public.projects for select to authenticated using (true);
create policy "Karyawan login bisa tambah proyek"
  on public.projects for insert to authenticated with check (true);
create policy "Karyawan login bisa update proyek"
  on public.projects for update to authenticated using (true);

create policy "Karyawan login bisa lihat teknisi proyek"
  on public.project_technicians for select to authenticated using (true);
create policy "Karyawan login bisa atur teknisi proyek"
  on public.project_technicians for all to authenticated using (true) with check (true);

create policy "Karyawan login bisa lihat log proyek"
  on public.project_logs for select to authenticated using (true);
create policy "Karyawan login bisa tambah log proyek"
  on public.project_logs for insert to authenticated with check (true);

create policy "Karyawan login bisa lihat dokumen proyek"
  on public.project_documents for select to authenticated using (true);
create policy "Karyawan login bisa tambah dokumen proyek"
  on public.project_documents for insert to authenticated with check (true);

-- Catatan: untuk fitur unggah dokumen, buat Storage bucket bernama
-- "project-files" (public read, atau pakai signed URL kalau mau privat)
-- lewat Supabase Dashboard > Storage, lalu tambahkan policy upload untuk
-- role authenticated sesuai kebutuhan.

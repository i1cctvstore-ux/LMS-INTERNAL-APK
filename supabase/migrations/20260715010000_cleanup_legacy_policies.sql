-- =====================================================
-- Bersihkan policy RLS lama yang masih permisif
-- =====================================================
-- Waktu tabel projects/branches dulu di-setup ulang, ternyata policy versi
-- LAMA (nama pakai Bahasa Indonesia, mis. "Karyawan login bisa lihat semua
-- proyek") tidak pernah dihapus — cuma policy baru yang "_by_branch" yang
-- ditambahkan di sampingnya. Karena Postgres RLS menggabungkan semua policy
-- SELECT/INSERT/UPDATE di tabel yang sama dengan OR, policy lama yang
-- "true" (tanpa filter) itu tetap menang dan bikin semua staf lintas
-- cabang bisa saling lihat data. Migration ini menghapus semua sisa
-- policy lama itu, supaya cuma versi "_by_branch" yang aktif.

-- ---------- projects ----------
drop policy if exists "Karyawan login bisa lihat semua proyek" on public.projects;
drop policy if exists "Karyawan login bisa tambah proyek" on public.projects;
drop policy if exists "Karyawan login bisa update proyek" on public.projects;
drop policy if exists "projects_select_authenticated" on public.projects;
drop policy if exists "projects_insert_authenticated" on public.projects;
drop policy if exists "projects_update_authenticated" on public.projects;

-- ---------- project_technicians ----------
drop policy if exists "Karyawan login bisa atur teknisi proyek" on public.project_technicians;
drop policy if exists "Karyawan login bisa lihat teknisi proyek" on public.project_technicians;
drop policy if exists "project_technicians_all_authenticated" on public.project_technicians;
drop policy if exists "project_technicians_select_authenticated" on public.project_technicians;

-- ---------- project_logs ----------
drop policy if exists "Karyawan login bisa lihat log proyek" on public.project_logs;
drop policy if exists "Karyawan login bisa tambah log proyek" on public.project_logs;
drop policy if exists "project_logs_select_authenticated" on public.project_logs;
drop policy if exists "project_logs_insert_authenticated" on public.project_logs;

-- ---------- project_documents ----------
drop policy if exists "Karyawan login bisa lihat dokumen proyek" on public.project_documents;
drop policy if exists "Karyawan login bisa tambah dokumen proyek" on public.project_documents;
drop policy if exists "project_documents_select_authenticated" on public.project_documents;
drop policy if exists "project_documents_insert_authenticated" on public.project_documents;

-- ---------- profiles ----------
-- profiles_select_authenticated (true) juga bikin daftar karyawan bocor
-- lintas cabang, padahal profiles_select_by_branch sudah ada dan benar.
drop policy if exists "profiles_select_authenticated" on public.profiles;

-- Catatan: branches_select_authenticated (SELECT, true) SENGAJA dibiarkan —
-- semua staf login memang boleh lihat daftar semua cabang (dipakai buat
-- dropdown pilih cabang di form karyawan/proyek), cuma WRITE-nya yang
-- dibatasi super_admin lewat branches_write_super_admin.

-- ---------- Verifikasi ----------
-- Jalankan query ini setelah migration di atas selesai, harusnya cuma
-- tersisa policy yang namanya "_by_branch", "_write_by_branch",
-- "_write_super_admin", "profiles_update_admin", dan
-- "branches_select_authenticated".
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('projects', 'project_technicians', 'project_logs', 'project_documents', 'profiles', 'branches')
order by tablename, cmd, policyname;

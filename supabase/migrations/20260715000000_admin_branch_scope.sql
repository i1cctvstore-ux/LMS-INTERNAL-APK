-- =====================================================
-- Role 'admin' = "Super Admin per cabang"
-- =====================================================
-- admin boleh kelola karyawan staff (kasir/gudang/teknisi) & lihat data
-- proyek/karyawan, TAPI dibatasi ke cabangnya sendiri saja. admin TIDAK
-- boleh menaikkan role siapa pun jadi admin/super_admin, TIDAK boleh
-- memindahkan karyawan ke cabang lain, dan TIDAK boleh akses halaman
-- Kelola Cabang (itu tetap murni super_admin, lihat policy
-- "branches_write_super_admin" yang sudah ada).
--
-- Catatan: enforcement UTAMA ada di kode API route (app/api/employees/...),
-- karena route itu pakai service role key yang bypass RLS. Policy di bawah
-- ini cuma lapisan pengaman TAMBAHAN di level database, jaga-jaga kalau ada
-- jalur akses lain ke tabel profiles di masa depan.

create or replace function public.is_admin_or_above()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('super_admin', 'admin') and active = true
  )
$$;

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (
    public.is_super_admin()
    or (
      public.is_admin_or_above()
      and role in ('kasir', 'gudang', 'teknisi')
      and branch_id = public.current_branch_id()
    )
  )
  with check (
    public.is_super_admin()
    or (
      public.is_admin_or_above()
      and role in ('kasir', 'gudang', 'teknisi')
      and branch_id = public.current_branch_id()
    )
  );

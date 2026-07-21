-- =====================================================
-- Koreksi struktur service_sparepart_stock_log
-- =====================================================
-- Bentuk aslinya (dari file klaim-servis-garansi.jsx): satu ENTRY log =
-- satu kejadian (mis. "Stok Masuk tanggal 10 Juli"), yang isinya BISA
-- beberapa sparepart sekaligus. Jadi strukturnya bukan "1 baris = 1
-- sparepart", tapi "1 baris = 1 kejadian, dengan daftar item di
-- dalamnya". Migration ini ganti total tabel yang salah dari
-- 20260716000000_create_service_module.sql.

drop table if exists public.service_sparepart_stock_log;

create table public.service_sparepart_stock_log (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  -- "masuk" = stok bertambah (barang masuk dari supplier/pembelian),
  -- "keluar" = stok berkurang (dipakai buat servis / invoice customer).
  type text not null check (type in ('masuk', 'keluar')),
  tanggal date not null default current_date,
  note text,
  -- items: array of { partId, name, qty } — nama sparepart ikut disimpan
  -- (snapshot) supaya riwayat tetap kebaca walau sparepart-nya kemudian
  -- diganti nama atau dihapus.
  items jsonb not null default '[]',
  -- claim_ids: klaim servis mana saja yang terkait kejadian ini (kalau
  -- stok keluar karena dipakai servis suatu barang). Kosong untuk stok
  -- masuk biasa.
  claim_ids uuid[] not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_service_sparepart_log_branch_id on public.service_sparepart_stock_log(branch_id);

alter table public.service_sparepart_stock_log enable row level security;

drop policy if exists "service_sparepart_log_select_by_branch" on public.service_sparepart_stock_log;
create policy "service_sparepart_log_select_by_branch"
  on public.service_sparepart_stock_log for select to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id());

drop policy if exists "service_sparepart_log_write_by_branch" on public.service_sparepart_stock_log;
create policy "service_sparepart_log_write_by_branch"
  on public.service_sparepart_stock_log for all to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id())
  with check (public.is_super_admin() or branch_id = public.current_branch_id());

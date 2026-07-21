-- =====================================================
-- Supplier jadi data terstruktur (Nama, Telepon, Alamat)
-- =====================================================
-- Sebelumnya "suppliers" cuma daftar nama (text[] di service_settings).
-- Sekarang jadi tabel sendiri per cabang, sama pola dengan service_products
-- dan service_spareparts.

create table if not exists public.service_suppliers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_suppliers_branch_id on public.service_suppliers(branch_id);

drop trigger if exists trg_service_suppliers_updated_at on public.service_suppliers;
create trigger trg_service_suppliers_updated_at
  before update on public.service_suppliers
  for each row execute function public.set_branches_updated_at();

alter table public.service_suppliers enable row level security;

drop policy if exists "service_suppliers_select_by_branch" on public.service_suppliers;
create policy "service_suppliers_select_by_branch"
  on public.service_suppliers for select to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id());

drop policy if exists "service_suppliers_write_by_branch" on public.service_suppliers;
create policy "service_suppliers_write_by_branch"
  on public.service_suppliers for all to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id())
  with check (public.is_super_admin() or branch_id = public.current_branch_id());

-- Pindahkan nama-nama supplier yang mungkin udah sempat ditambah manual
-- lewat kotak "Tambah supplier..." sebelum tabel ini ada (nama doang,
-- telepon/alamat dikosongkan dulu, bisa dilengkapi belakangan lewat app).
insert into public.service_suppliers (branch_id, name)
select s.branch_id, sup
from public.service_settings s
cross join lateral unnest(s.suppliers) as sup
where sup is not null and length(trim(sup)) > 0
on conflict do nothing;

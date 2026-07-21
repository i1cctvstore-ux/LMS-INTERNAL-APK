-- =====================================================
-- Customer jadi data terstruktur & PERMANEN (sebelumnya cuma
-- "nebeng" di memori, gak pernah beneran ditulis ke database)
-- =====================================================

create table if not exists public.service_customers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_customers_branch_id on public.service_customers(branch_id);

drop trigger if exists trg_service_customers_updated_at on public.service_customers;
create trigger trg_service_customers_updated_at
  before update on public.service_customers
  for each row execute function public.set_branches_updated_at();

alter table public.service_customers enable row level security;

drop policy if exists "service_customers_select_by_branch" on public.service_customers;
create policy "service_customers_select_by_branch"
  on public.service_customers for select to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id());

drop policy if exists "service_customers_write_by_branch" on public.service_customers;
create policy "service_customers_write_by_branch"
  on public.service_customers for all to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id())
  with check (public.is_super_admin() or branch_id = public.current_branch_id());

-- Backfill: ambil nama+telepon customer unik dari klaim yang sudah ada
-- (kalau ada), supaya data lama gak ilang pas fitur ini pertama kali aktif.
insert into public.service_customers (branch_id, name, phone)
select distinct on (c.branch_id, lower(trim(c.customer_name)))
  c.branch_id, trim(c.customer_name), trim(c.customer_phone)
from public.service_claims c
where trim(coalesce(c.customer_name, '')) <> ''
order by c.branch_id, lower(trim(c.customer_name)), c.created_at desc
on conflict do nothing;

-- =====================================================
-- Modul Servis: klaim garansi/servis, pengiriman ke supplier,
-- invoice, setoran kas, sparepart + stok, produk, dan master data.
-- Semua tabel per-cabang (branch_id), mengikuti pola persis yang
-- sudah dipakai di modul Proyek: RLS "is_super_admin() OR branch_id
-- = current_branch_id()".
-- =====================================================

-- ---------- service_settings ----------
-- Satu baris per cabang: daftar brand, supplier, dan kolom yang
-- disembunyikan di tabel klaim. Disimpan sebagai array (bukan tabel
-- terpisah) karena di UI aslinya memang selalu di-replace sekaligus
-- satu array penuh, bukan per-baris.
create table if not exists public.service_settings (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  brands text[] not null default '{}',
  suppliers text[] not null default '{}',
  hidden_columns text[] not null default '{}',
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_service_settings_updated_at on public.service_settings;
create trigger trg_service_settings_updated_at
  before update on public.service_settings
  for each row execute function public.set_branches_updated_at();

-- ---------- service_products ----------
-- Katalog produk per cabang (SKU + nama). Referensi bebas dari klaim
-- (klaim menyimpan nama/SKU sebagai teks, bukan foreign key ketat —
-- sama seperti perilaku aslinya).
create table if not exists public.service_products (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  sku text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_products_branch_id on public.service_products(branch_id);

-- ---------- service_spareparts ----------
-- Stok sparepart FISIK per cabang — sengaja jadi tabel sendiri (bukan
-- array di settings) karena qty-nya sering berubah (stok masuk/keluar)
-- dan perlu dicatat riwayatnya di service_sparepart_stock_log.
create table if not exists public.service_spareparts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  unit text not null default 'pcs',
  qty integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_spareparts_branch_id on public.service_spareparts(branch_id);

drop trigger if exists trg_service_spareparts_updated_at on public.service_spareparts;
create trigger trg_service_spareparts_updated_at
  before update on public.service_spareparts
  for each row execute function public.set_branches_updated_at();

-- ---------- service_batches ----------
-- Satu batch = satu pengiriman sekumpulan barang ke supplier.
-- Foto (resi, surat jalan, bukti terima balik) disimpan sebagai URL ke
-- Supabase Storage (bucket "service-files"), BUKAN base64 langsung di
-- kolom database seperti versi originalnya — supaya baris tabel tetap
-- ringan, sama seperti pola project_documents di modul Proyek.
create table if not exists public.service_batches (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  kode_batch text not null,
  supplier text not null,
  tanggal_kirim date not null default current_date,
  foto_resi_url text,
  foto_surat_jalan_ttd_url text,
  foto_bukti_terima_balik_url text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_batches_branch_id on public.service_batches(branch_id);

drop trigger if exists trg_service_batches_updated_at on public.service_batches;
create trigger trg_service_batches_updated_at
  before update on public.service_batches
  for each row execute function public.set_branches_updated_at();

-- ---------- service_claims ----------
-- Satu baris = satu barang yang diklaim/diservis. group_id menandakan
-- barang-barang yang diserahkan bersamaan dalam satu kunjungan customer
-- (bisa lebih dari satu barang per group_id).
create table if not exists public.service_claims (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  group_id text not null,

  customer_name text not null,
  customer_phone text,

  tanggal_terima date not null default current_date,
  brand text,
  produk text,
  produk_sku text,
  sn_diterima text,
  garansi text not null default 'Tidak' check (garansi in ('Ya', 'Tidak')),
  jenis text not null default '' check (jenis in ('', 'Ganti Baru', 'Servis')),
  kelengkapan text,
  catatan text,

  sn_pengganti_stock text,
  biaya_toko numeric,
  biaya_jasa_servis numeric,
  parts_used jsonb not null default '[]',
  stok_barang_used text,

  status text not null default 'Menunggu Konfirmasi'
    check (status in ('Menunggu Konfirmasi', 'Baru', 'Di Supplier', 'Siap Diambil', 'Selesai')),

  supplier text,
  batch_id uuid references public.service_batches(id) on delete set null,
  tanggal_kirim_supplier date,
  tanggal_kembali_supplier date,
  hasil_supplier text,
  sn_pengganti_supplier text,
  biaya_supplier numeric,

  sumber_penyelesaian text,
  tanggal_ambil_customer date,
  metode_bayar_ambil text,

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_claims_branch_id on public.service_claims(branch_id);
create index if not exists idx_service_claims_batch_id on public.service_claims(batch_id);
create index if not exists idx_service_claims_group_id on public.service_claims(group_id);

drop trigger if exists trg_service_claims_updated_at on public.service_claims;
create trigger trg_service_claims_updated_at
  before update on public.service_claims
  for each row execute function public.set_branches_updated_at();

-- ---------- service_sparepart_stock_log ----------
-- Riwayat stok masuk/keluar sparepart. claim_id diisi kalau sparepart
-- keluar karena dipakai di suatu servis (parts_used pada service_claims).
create table if not exists public.service_sparepart_stock_log (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  sparepart_id uuid not null references public.service_spareparts(id) on delete cascade,
  qty_delta integer not null,
  reason text,
  claim_id uuid references public.service_claims(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_service_sparepart_log_branch_id on public.service_sparepart_stock_log(branch_id);
create index if not exists idx_service_sparepart_log_sparepart_id on public.service_sparepart_stock_log(sparepart_id);

-- ---------- service_invoices ----------
create table if not exists public.service_invoices (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  invoice_no text not null,
  date date not null default current_date,
  customer_name text not null,
  customer_phone text,
  claim_ids uuid[] not null default '{}',
  lines jsonb not null default '[]',
  total numeric not null default 0,
  metode_bayar text,
  verified boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_service_invoices_invoice_no on public.service_invoices(invoice_no);
create index if not exists idx_service_invoices_branch_id on public.service_invoices(branch_id);

drop trigger if exists trg_service_invoices_updated_at on public.service_invoices;
create trigger trg_service_invoices_updated_at
  before update on public.service_invoices
  for each row execute function public.set_branches_updated_at();

-- ---------- service_setoran ----------
-- Catatan setoran kas hasil servis ke kas toko.
create table if not exists public.service_setoran (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  tanggal date not null default current_date,
  jumlah numeric not null default 0,
  penyetor text,
  catatan text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_service_setoran_branch_id on public.service_setoran(branch_id);

-- =====================================================
-- Row Level Security — pola sama persis dengan modul Proyek:
-- super_admin bebas semua cabang, role lain cuma cabang sendiri.
-- =====================================================

alter table public.service_settings enable row level security;
alter table public.service_products enable row level security;
alter table public.service_spareparts enable row level security;
alter table public.service_batches enable row level security;
alter table public.service_claims enable row level security;
alter table public.service_sparepart_stock_log enable row level security;
alter table public.service_invoices enable row level security;
alter table public.service_setoran enable row level security;

-- service_settings
drop policy if exists "service_settings_select_by_branch" on public.service_settings;
create policy "service_settings_select_by_branch"
  on public.service_settings for select to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id());

drop policy if exists "service_settings_write_by_branch" on public.service_settings;
create policy "service_settings_write_by_branch"
  on public.service_settings for all to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id())
  with check (public.is_super_admin() or branch_id = public.current_branch_id());

-- service_products
drop policy if exists "service_products_select_by_branch" on public.service_products;
create policy "service_products_select_by_branch"
  on public.service_products for select to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id());

drop policy if exists "service_products_write_by_branch" on public.service_products;
create policy "service_products_write_by_branch"
  on public.service_products for all to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id())
  with check (public.is_super_admin() or branch_id = public.current_branch_id());

-- service_spareparts
drop policy if exists "service_spareparts_select_by_branch" on public.service_spareparts;
create policy "service_spareparts_select_by_branch"
  on public.service_spareparts for select to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id());

drop policy if exists "service_spareparts_write_by_branch" on public.service_spareparts;
create policy "service_spareparts_write_by_branch"
  on public.service_spareparts for all to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id())
  with check (public.is_super_admin() or branch_id = public.current_branch_id());

-- service_batches
drop policy if exists "service_batches_select_by_branch" on public.service_batches;
create policy "service_batches_select_by_branch"
  on public.service_batches for select to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id());

drop policy if exists "service_batches_write_by_branch" on public.service_batches;
create policy "service_batches_write_by_branch"
  on public.service_batches for all to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id())
  with check (public.is_super_admin() or branch_id = public.current_branch_id());

-- service_claims
drop policy if exists "service_claims_select_by_branch" on public.service_claims;
create policy "service_claims_select_by_branch"
  on public.service_claims for select to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id());

drop policy if exists "service_claims_write_by_branch" on public.service_claims;
create policy "service_claims_write_by_branch"
  on public.service_claims for all to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id())
  with check (public.is_super_admin() or branch_id = public.current_branch_id());

-- service_sparepart_stock_log
drop policy if exists "service_sparepart_log_select_by_branch" on public.service_sparepart_stock_log;
create policy "service_sparepart_log_select_by_branch"
  on public.service_sparepart_stock_log for select to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id());

drop policy if exists "service_sparepart_log_write_by_branch" on public.service_sparepart_stock_log;
create policy "service_sparepart_log_write_by_branch"
  on public.service_sparepart_stock_log for all to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id())
  with check (public.is_super_admin() or branch_id = public.current_branch_id());

-- service_invoices
drop policy if exists "service_invoices_select_by_branch" on public.service_invoices;
create policy "service_invoices_select_by_branch"
  on public.service_invoices for select to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id());

drop policy if exists "service_invoices_write_by_branch" on public.service_invoices;
create policy "service_invoices_write_by_branch"
  on public.service_invoices for all to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id())
  with check (public.is_super_admin() or branch_id = public.current_branch_id());

-- service_setoran
drop policy if exists "service_setoran_select_by_branch" on public.service_setoran;
create policy "service_setoran_select_by_branch"
  on public.service_setoran for select to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id());

drop policy if exists "service_setoran_write_by_branch" on public.service_setoran;
create policy "service_setoran_write_by_branch"
  on public.service_setoran for all to authenticated
  using (public.is_super_admin() or branch_id = public.current_branch_id())
  with check (public.is_super_admin() or branch_id = public.current_branch_id());

-- Catatan: buat Storage bucket bernama "service-files" (public read) lewat
-- Supabase Dashboard > Storage sebelum upload foto resi/surat jalan batch —
-- sama seperti bucket "project-files" yang sudah dibuat untuk modul Proyek.

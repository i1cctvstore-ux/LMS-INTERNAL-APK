-- =====================================================
-- Tambahan kolom yang kelewat di service_claims
-- =====================================================
-- Ketauan dari audit menyeluruh field yang dipakai di seluruh file
-- (bukan cuma dari 9 data contoh yang saya baca pertama kali):
--  - foto_tanda_terima_customer_url: bukti serah terima barang dari
--    customer (disimpan sebagai URL ke Storage, sama seperti foto batch)
--  - stok_reimbursed dkk: fitur "klaim balik ke supplier buat restock" —
--    dipakai saat toko kasih barang pengganti dari stok sendiri ke
--    customer, lalu KLAIM BALIK barang itu ke supplier secara terpisah
--    (beda proses/beda batch dari batch pengiriman perbaikan biasa).

alter table public.service_claims
  add column if not exists foto_tanda_terima_customer_url text,
  add column if not exists stok_reimbursed boolean not null default false,
  add column if not exists stok_reimbursed_batch_id uuid references public.service_batches(id) on delete set null,
  add column if not exists stok_reimbursed_supplier text,
  add column if not exists stok_reimbursed_tanggal date,
  add column if not exists stok_reimbursed_received_sn text,
  add column if not exists stok_reimbursed_received_date date;

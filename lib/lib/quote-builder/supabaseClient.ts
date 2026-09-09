/**
 * DIGANTI dari versi asli -- versi asli bikin koneksi Supabase sendiri
 * pakai import.meta.env.VITE_SUPABASE_URL/ANON_KEY (sintaks Vite, GAK
 * ADA di Next.js). Project i1 Internal Tools ini sudah punya client
 * Supabase browser-nya sendiri (@/lib/supabase/client, dipakai semua
 * modul lain -- KasModule, StokModule, dst) -- pakai itu aja, JANGAN
 * bikin koneksi Supabase paralel.
 *
 * Cukup file ini yang diganti; lib/quote-builder/api.ts (413 baris)
 * TIDAK PERLU disentuh sama sekali, soalnya dia cuma import `{ supabase }`
 * dari sini -- bentuknya (fungsi .from()/.rpc() dst) identik.
 */
import { createClient } from "@/lib/supabase/client";
import type { Database } from "./database.types";

export const supabase = createClient<Database>();

// =====================================================
// i1 CCTV — Rombak akun tim (sekali jalan)
//
// Yang dilakukan script ini:
//   1. Pastikan cabang "Jakarta" ada (buat kalau belum ada)
//   2. Buat akun baru: Leyoni <i1.cctv@gmail.com> — role super_admin
//   3. Husna, Asmi, Rizki -> role diubah jadi admin, cabang Jakarta
//   4. Azka -> role teknisi (tetap), cabang Jakarta
//   5. Buat akun baru: Ajat <ajat@i1cctv.com> — role teknisi, cabang Jakarta
//   6. HAPUS PERMANEN akun Yoga dan Dheva (akun Auth + baris profil ikut hilang)
//
// CARA PAKAI:
//   node --env-file=.env supabase/reassign-accounts.mjs
//
// Password akun baru (Leyoni, Ajat) HANYA muncul sekali di terminal —
// simpan sekarang juga. Script ini aman dijalankan ulang untuk akun yang
// masih ada (tidak akan bikin dobel), TAPI langkah hapus (Yoga, Dheva)
// akan langsung error kalau dijalankan lagi setelah akunnya sudah hilang
// — itu normal, tandanya sudah berhasil kehapus sebelumnya.
// =====================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi.\n' +
      '   Jalankan dengan: node --env-file=.env supabase/reassign-accounts.mjs',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const SYMBOLS = '!@#$%*?'
function generatePassword(length = 12) {
  const pool = CHARS + SYMBOLS
  let out = ''
  for (let i = 0; i < length; i++) out += pool[Math.floor(Math.random() * pool.length)]
  return out
}

async function ensureJakartaBranch() {
  const { data: existing } = await supabase
    .from('branches')
    .select('id')
    .ilike('name', '%jakarta%')
    .limit(1)
    .maybeSingle()

  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from('branches')
    .insert({ name: 'i1 CCTV — Jakarta' })
    .select('id')
    .single()

  if (error) throw new Error(`Gagal membuat cabang Jakarta: ${error.message}`)
  return created.id
}

async function createAccount(name, email, role, branchId) {
  const password = generatePassword()

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })

  if (createError) {
    if (createError.message?.toLowerCase().includes('already been registered')) {
      return { name, email, role, password: '(sudah ada — dilewati)', status: 'skip' }
    }
    return { name, email, role, password: '-', status: `error: ${createError.message}` }
  }

  const { error: profileError } = await supabase.from('profiles').upsert(
    { id: created.user.id, name, email, role, branch_id: branchId, active: true },
    { onConflict: 'id' },
  )

  if (profileError) {
    return { name, email, role, password, status: `akun dibuat, profil gagal: ${profileError.message}` }
  }

  return { name, email, role, password, status: 'ok' }
}

async function updateByEmail(email, updates) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('email', email)
    .maybeSingle()

  if (!profile) return { email, status: 'error: akun tidak ditemukan' }

  const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id)
  if (error) return { email, name: profile.name, status: `error: ${error.message}` }

  return { email, name: profile.name, status: 'ok', ...updates }
}

async function deleteByEmail(email) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('email', email)
    .maybeSingle()

  if (!profile) return { email, status: 'sudah tidak ada (skip)' }

  // Hapus akun Auth-nya saja — baris profiles ikut kehapus otomatis
  // (foreign key profiles.id -> auth.users on delete cascade).
  const { error } = await supabase.auth.admin.deleteUser(profile.id)
  if (error) return { email, name: profile.name, status: `error: ${error.message}` }

  return { email, name: profile.name, status: 'terhapus' }
}

async function run() {
  console.log('1. Menyiapkan cabang Jakarta…')
  const jakartaId = await ensureJakartaBranch()
  console.log(`   OK — branch_id: ${jakartaId}\n`)

  console.log('2. Membuat akun baru…')
  const newAccounts = []
  newAccounts.push(await createAccount('Leyoni', 'i1.cctv@gmail.com', 'super_admin', null))
  newAccounts.push(await createAccount('Ajat', 'ajat@i1cctv.com', 'teknisi', jakartaId))

  console.log('3. Update role & cabang akun yang sudah ada…')
  const updates = []
  updates.push(await updateByEmail('husna@i1cctv.com', { role: 'admin', branch_id: jakartaId }))
  updates.push(await updateByEmail('asmi@i1cctv.com', { role: 'admin', branch_id: jakartaId }))
  updates.push(await updateByEmail('rizki@i1cctv.com', { role: 'admin', branch_id: jakartaId }))
  updates.push(await updateByEmail('azka@i1cctv.com', { role: 'teknisi', branch_id: jakartaId }))

  console.log('4. Menghapus akun Yoga & Dheva…')
  const deletions = []
  deletions.push(await deleteByEmail('yoga@i1cctv.com'))
  deletions.push(await deleteByEmail('dheva@i1cctv.com'))

  console.log('\n=== Akun baru (SIMPAN PASSWORD-NYA SEKARANG) ===')
  console.table(newAccounts.map((r) => ({ Nama: r.name, Email: r.email, Role: r.role, Password: r.password, Status: r.status })))

  console.log('\n=== Akun yang diubah role/cabangnya ===')
  console.table(updates.map((r) => ({ Nama: r.name ?? '-', Email: r.email, Role: r.role ?? '-', Status: r.status })))

  console.log('\n=== Akun yang dihapus ===')
  console.table(deletions.map((r) => ({ Nama: r.name ?? '-', Email: r.email, Status: r.status })))

  console.log(
    '\n⚠️  Password akun baru di atas TIDAK akan ditampilkan lagi. Kalau lupa dicatat, ' +
      'reset lewat halaman User Role (tombol Regenerate Password) setelah login sebagai Leyoni.\n',
  )
}

run().catch((err) => {
  console.error('❌ Gagal:', err)
  process.exit(1)
})

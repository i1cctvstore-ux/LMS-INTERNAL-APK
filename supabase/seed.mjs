// =====================================================
// i1 CCTV — Seed data awal untuk Supabase (akun karyawan)
//
// CARA PAKAI:
//   1. Pastikan supabase/schema.sql sudah dijalankan di SQL Editor Supabase.
//   2. Edit daftar EMPLOYEES di bawah ini sesuai kebutuhan (nama, email, role).
//   3. Isi .env.local dengan NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY.
//   4. Jalankan dari folder project:
//        node --env-file=.env.local supabase/seed.mjs
//   5. Password yang tercetak di terminal HANYA muncul sekali — simpan/salin
//      dan berikan ke masing-masing karyawan. Setelah itu bisa di-reset lagi
//      kapan saja dari halaman User Role di aplikasi.
//
// Aman dijalankan berulang: email yang sudah terdaftar akan dilewati (skip),
// tidak akan menimpa password yang sudah ada.
// =====================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi.\n' +
      '   Jalankan dengan: node --env-file=.env.local supabase/seed.mjs',
  )
  process.exit(1)
}

// ---- Ubah daftar ini sesuai tim i1 CCTV Store ----
const EMPLOYEES = [
  { name: 'Husna', email: 'husna@i1cctv.com', role: 'super_admin' },
  { name: 'Asmi', email: 'asmi@i1cctv.com', role: 'admin' },
  { name: 'Rizki', email: 'rizki@i1cctv.com', role: 'teknisi' },
  { name: 'Azka', email: 'azka@i1cctv.com', role: 'teknisi' },
  { name: 'Yoga', email: 'yoga@i1cctv.com', role: 'teknisi' },
  { name: 'Dheva', email: 'dheva@i1cctv.com', role: 'teknisi' },
]
// ---------------------------------------------------

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const SYMBOLS = '!@#$%*?'

function generatePassword(length = 12) {
  const pool = CHARS + SYMBOLS
  let out = ''
  for (let i = 0; i < length; i++) {
    out += pool[Math.floor(Math.random() * pool.length)]
  }
  return out
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function seed() {
  const results = []

  for (const emp of EMPLOYEES) {
    const password = generatePassword()

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: emp.email,
      password,
      email_confirm: true,
      user_metadata: { name: emp.name },
    })

    if (createError) {
      if (createError.message?.toLowerCase().includes('already been registered')) {
        results.push({ ...emp, password: '(sudah ada — dilewati)', status: 'skip' })
        continue
      }
      results.push({ ...emp, password: '-', status: `error: ${createError.message}` })
      continue
    }

    const userId = created.user.id

    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: userId,
        name: emp.name,
        email: emp.email,
        role: emp.role,
        active: true,
      },
      { onConflict: 'id' },
    )

    if (profileError) {
      results.push({ ...emp, password, status: `akun dibuat, profil gagal: ${profileError.message}` })
      continue
    }

    results.push({ ...emp, password, status: 'ok' })
  }

  console.log('\nHasil seed akun karyawan i1 CCTV:\n')
  console.table(
    results.map((r) => ({
      Nama: r.name,
      Email: r.email,
      Role: r.role,
      Password: r.password,
      Status: r.status,
    })),
  )
  console.log(
    '\n⚠️  Salin password di atas SEKARANG dan bagikan ke masing-masing karyawan — ' +
      'password tidak disimpan dalam bentuk asli dan tidak akan ditampilkan lagi.\n',
  )
}

seed().catch((err) => {
  console.error('❌ Seed gagal:', err)
  process.exit(1)
})

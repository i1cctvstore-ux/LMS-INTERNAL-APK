// File ini: app/api/stok/accurate-solo-warehouse-diag/route.ts
//
// Endpoint diagnostik SEMENTARA — buat lihat nama-nama GUDANG persis
// yang ada di database Accurate "Solo" (CV Yasin Putra Sejahtera),
// yang ternyata nampung konsinyasi buat Jakarta/Bali/Purwokerto/Solo
// sekaligus. Kita butuh tau nama gudangnya PERSIS (bukan nebak) buat
// bisa petain ke cabang yang benar di kode sync final nanti.
//
// Setelah nemu nama-nama gudangnya, endpoint ini boleh dihapus dari
// GitHub — bukan bagian permanen dari fitur sync.

import { NextResponse } from 'next/server'
import { connectToAccurateBranch } from '@/lib/stok/accurate-sync'

const SOLO_BRANCH_ID = 'ff24cbd3-f11a-4f12-b658-88ff40b1a8e3' // dipakai sebagai kunci token tersimpan
const SOLO_DB_ID = process.env.ACCURATE_DB_ID_SOLO || ''

export async function GET() {
  if (!SOLO_DB_ID) {
    return NextResponse.json({ error: 'Env var ACCURATE_DB_ID_SOLO belum diisi.' }, { status: 400 })
  }

  try {
    const conn = await connectToAccurateBranch({ branchId: SOLO_BRANCH_ID, branchName: 'Solo (multi-gudang)', dbId: SOLO_DB_ID })

    const params = new URLSearchParams({ 'sp.pageSize': '3', 'sp.page': '1', 'filter.itemType': 'INVENTORY' })
    const listRes = await fetch(`${conn.host}/accurate/api/item/list.do?${params.toString()}`, {
      headers: { Authorization: `Bearer ${conn.accessToken}`, 'X-Session-ID': conn.session },
    })
    const listBody = await listRes.json()
    const items = (listBody.d || []) as any[]

    const samples = []
    for (const it of items) {
      const dParams = new URLSearchParams({ id: String(it.id) })
      const dRes = await fetch(`${conn.host}/accurate/api/item/detail.do?${dParams.toString()}`, {
        headers: { Authorization: `Bearer ${conn.accessToken}`, 'X-Session-ID': conn.session },
      })
      const dBody = await dRes.json()
      if (dBody.s) {
        samples.push({
          no: dBody.d.no,
          name: dBody.d.name,
          balance: dBody.d.balance,
          gudang: (dBody.d.detailWarehouseData || []).map((w: any) => ({
            nama_gudang: w.name,
            id_gudang: w.id,
            stok: w.balance,
          })),
        })
      }
    }

    return NextResponse.json({ ok: true, samples })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}

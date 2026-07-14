import { Suspense } from 'react'
import { TrackView } from '@/components/track/track-view'

export const metadata = {
  title: 'Lacak Progres Proyek — i1 CCTV',
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f3f5f8]">
          <p className="text-sm text-[#6b7a8d]">Memuat…</p>
        </div>
      }
    >
      <TrackView />
    </Suspense>
  )
}

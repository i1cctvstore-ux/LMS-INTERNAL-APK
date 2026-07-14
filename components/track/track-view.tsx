'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, FileText, ImageOff, X, ChevronLeft as ChevLeft, ChevronRight } from 'lucide-react'
import {
  STAGES,
  STAGE_STATUS_LABEL,
  formatShortDate,
  formatTimeOnly,
  type Stage,
} from '@/lib/projects'

type TrackProject = {
  code: string
  customer_name: string
  project_name: string | null
  area: string
  camera_count: number | null
  eta: string | null
  stage: Stage
  created_at: string
  technicians: string[]
}

type TrackLog = {
  id: string
  title: string
  note: string | null
  photo_urls: string[]
  created_at: string
  created_by_name: string | null
}

type TrackDocument = {
  id: string
  doc_type: string
  description: string | null
  file_name: string
  file_url: string
  file_size_kb: number | null
  created_at: string
}

type TabKey = 'log' | 'dokumen' | 'info'

function formatSizeKb(kb: number | null) {
  if (!kb) return ''
  if (kb < 1024) return `${kb} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export function TrackView() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id')

  const [project, setProject] = useState<TrackProject | null>(null)
  const [logs, setLogs] = useState<TrackLog[]>([])
  const [documents, setDocuments] = useState<TrackDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('log')
  const [lightbox, setLightbox] = useState<{ logIndex: number; photoIndex: number } | null>(null)
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(new Set())

  function markBroken(url: string) {
    setBrokenPhotos((prev) => {
      const next = new Set(prev)
      next.add(url)
      return next
    })
  }

  useEffect(() => {
    if (!id) {
      setError('Tautan tidak lengkap.')
      setLoading(false)
      return
    }
    fetch(`/api/track?id=${encodeURIComponent(id)}`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body?.message ?? 'Gagal memuat data.')
        return body
      })
      .then((body) => {
        setProject(body.project)
        setLogs(body.logs)
        setDocuments(body.documents)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f5f8] font-[Montserrat,sans-serif]">
        <p className="text-sm text-[#6b7a8d]">Memuat data proyek…</p>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#f3f5f8] px-6 text-center font-[Montserrat,sans-serif]">
        <p className="text-base font-semibold text-[#0A2540]">
          Tautan tidak bisa dibuka
        </p>
        <p className="text-sm text-[#6b7a8d]">
          {error ?? 'Proyek tidak ditemukan.'}
        </p>
      </div>
    )
  }

  const currentIndex = STAGES.indexOf(project.stage)
  const currentLog = lightbox ? logs[lightbox.logIndex] : null

  return (
    <div className="min-h-screen bg-[#f3f5f8] font-[Montserrat,sans-serif] text-[#0A2540]">
      <div className="mx-auto min-h-screen max-w-[430px] bg-[#f3f5f8] pb-10">
        {/* Header */}
        <header className="rounded-b-[20px] bg-[#0A2540] px-5 pt-[18px] pb-[22px] text-white">
          <div className="mb-4 flex items-center justify-between">
            <ChevronLeft className="size-5 opacity-90" aria-hidden="true" />
            <span className="text-[13px] font-extrabold tracking-wide opacity-75">
              i1 CCTV STORE
            </span>
            <span className="flex size-[34px] items-center justify-center rounded-full border-[1.5px] border-white/35 text-[13px] font-bold">
              ?
            </span>
          </div>
          <p className="mb-1 text-[12px] font-semibold tracking-wide text-[#8fb8ff] uppercase">
            {project.code}
          </p>
          <h1 className="mb-3.5 text-[20px] leading-[1.3] font-bold">
            {project.project_name
              ? `${project.project_name} — ${project.customer_name}`
              : project.customer_name}
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-semibold">
            <span className="size-2 rounded-full bg-[#F5A623] shadow-[0_0_0_4px_rgba(245,166,35,0.25)]" />
            {STAGE_STATUS_LABEL[project.stage]}
          </span>
        </header>

        {/* Stage bar */}
        <div className="px-5 pt-5">
          <div className="rounded-2xl bg-white p-[18px_16px] shadow-[0_1px_2px_rgba(10,37,64,0.04)]">
            <div className="mb-2.5 flex justify-between">
              <span className="text-[11px] font-semibold text-[#a3aebc]">
                PROGRESS PROYEK
              </span>
              <span className="text-[11px] font-semibold text-[#a3aebc]">
                {currentIndex + 1} / {STAGES.length} Tahap
              </span>
            </div>
            <div className="flex items-center">
              {STAGES.map((stage, index) => {
                const isDone = index < currentIndex
                const isCurrent = stage === project.stage
                return (
                  <div key={stage} className="relative flex flex-1 flex-col items-center">
                    {index > 0 ? (
                      <div
                        className="absolute top-[11px] left-[-50%] h-0.5 w-full"
                        style={{
                          background: isDone || isCurrent ? '#1FAA59' : '#e4e9f0',
                        }}
                      />
                    ) : null}
                    <div
                      className={
                        'relative z-[2] flex size-[22px] items-center justify-center rounded-full text-[11px] font-extrabold text-white ' +
                        (isCurrent
                          ? 'bg-[#007BFF] shadow-[0_0_0_5px_#e8f2ff]'
                          : isDone
                            ? 'bg-[#1FAA59]'
                            : 'border-2 border-[#e4e9f0] bg-white text-transparent')
                      }
                    >
                      {isDone ? '✓' : isCurrent ? index + 1 : ''}
                    </div>
                    <span
                      className={
                        'mt-[7px] text-center text-[9.5px] leading-tight font-semibold ' +
                        (isCurrent
                          ? 'text-[#007BFF]'
                          : isDone
                            ? 'text-[#6b7a8d]'
                            : 'text-[#a3aebc]')
                      }
                    >
                      {stage}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-5 pt-4 pb-1">
          {(
            [
              { key: 'log', label: 'Log Teknisi' },
              { key: 'dokumen', label: 'Dokumen' },
              { key: 'info', label: 'Info Proyek' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                'flex-1 rounded-[11px] border-[1.5px] border-transparent px-1.5 py-2.5 text-center text-[12.5px] font-semibold ' +
                (tab === t.key ? 'bg-[#0A2540] text-white' : 'bg-white text-[#6b7a8d]')
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Panel: Log Teknisi */}
        {tab === 'log' ? (
          <div className="px-5 pt-[18px]">
            <p className="mb-0.5 text-sm font-bold text-[#0A2540]">Log Harian Teknisi</p>
            <p className="mb-4 text-xs text-[#6b7a8d]">Update terbaru muncul paling atas</p>

            {logs.length === 0 ? (
              <div className="rounded-2xl bg-white p-6 text-center text-sm text-[#6b7a8d] shadow-[0_1px_2px_rgba(10,37,64,0.04)]">
                Belum ada update dari teknisi.
              </div>
            ) : (
              <div className="rounded-2xl bg-white px-[18px] pt-5 pb-1.5 shadow-[0_1px_2px_rgba(10,37,64,0.04)]">
                {logs.map((log, logIndex) => {
                  const isLatest = logIndex === 0
                  const isLastItem = logIndex === logs.length - 1
                  return (
                    <div key={log.id} className="flex gap-3.5">
                      <div className="w-[52px] shrink-0 pt-px text-[10.5px] leading-[1.35] font-semibold text-[#a3aebc]">
                        <span className="font-bold text-[#6b7a8d]">
                          {formatShortDate(log.created_at)}
                        </span>
                        <br />
                        {formatTimeOnly(log.created_at)}
                      </div>
                      <div className="flex w-5 shrink-0 flex-col items-center">
                        <div
                          className={
                            'mt-0.5 size-3 shrink-0 rounded-full ' +
                            (isLatest ? 'bg-[#007BFF] shadow-[0_0_0_4px_#e8f2ff]' : 'bg-[#e4e9f0]')
                          }
                        />
                        {!isLastItem ? (
                          <div className="mt-0.5 w-0.5 flex-1 bg-[#e4e9f0]" />
                        ) : null}
                      </div>
                      <div className="flex-1 pb-[22px]">
                        <p
                          className={
                            'mb-0.5 text-[13.5px] leading-[1.4] font-semibold ' +
                            (isLatest ? 'font-bold text-[#0A2540]' : 'text-[#0A2540]')
                          }
                        >
                          {log.title}
                        </p>
                        <p className="mb-2 text-[11.5px] leading-[1.4] text-[#6b7a8d]">
                          {[log.note, log.created_by_name].filter(Boolean).join(' · ')}
                        </p>
                        {log.photo_urls.length > 0 ? (
                          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                            {log.photo_urls.map((url, photoIndex) =>
                              brokenPhotos.has(url) ? (
                                <div
                                  key={url}
                                  className="flex size-16 shrink-0 flex-col items-center justify-center gap-1 rounded-[9px] bg-[#eef1f5] text-[#a3aebc]"
                                >
                                  <ImageOff className="size-4" aria-hidden="true" />
                                  <span className="text-[8px]">Gagal muat</span>
                                </div>
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={url}
                                  src={url}
                                  alt={log.title}
                                  onClick={() => setLightbox({ logIndex, photoIndex })}
                                  onError={() => markBroken(url)}
                                  className="size-16 shrink-0 cursor-pointer rounded-[9px] bg-[#eef1f5] object-cover"
                                />
                              )
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : null}

        {/* Panel: Dokumen */}
        {tab === 'dokumen' ? (
          <div className="px-5 pt-[18px]">
            <p className="mb-0.5 text-sm font-bold text-[#0A2540]">Dokumen Proyek</p>
            <p className="mb-4 text-xs text-[#6b7a8d]">
              Semua berkas resmi terkait proyek ini
            </p>

            {documents.length === 0 ? (
              <div className="rounded-2xl bg-white p-6 text-center text-sm text-[#6b7a8d] shadow-[0_1px_2px_rgba(10,37,64,0.04)]">
                Belum ada dokumen dibagikan.
              </div>
            ) : (
              <div className="rounded-2xl bg-white px-[18px] pt-5 pb-1.5 shadow-[0_1px_2px_rgba(10,37,64,0.04)]">
                {documents.map((doc, index) => (
                  <div key={doc.id} className="flex gap-3.5">
                    <div className="w-[52px] shrink-0 pt-px text-[10.5px] leading-[1.35] font-semibold text-[#a3aebc]">
                      <span className="font-bold text-[#6b7a8d]">
                        {formatShortDate(doc.created_at)}
                      </span>
                      <br />
                      {formatTimeOnly(doc.created_at)}
                    </div>
                    <div className="flex w-5 shrink-0 flex-col items-center">
                      <div className="mt-0.5 size-3 shrink-0 rounded-full bg-[#e4e9f0]" />
                      {index !== documents.length - 1 ? (
                        <div className="mt-0.5 w-0.5 flex-1 bg-[#e4e9f0]" />
                      ) : null}
                    </div>
                    <div className="flex-1 pb-[22px]">
                      <span className="mb-1 block text-[10px] font-bold tracking-wide text-[#6b7a8d] uppercase">
                        {doc.doc_type}
                      </span>
                      <p className="mb-0.5 text-[13.5px] font-semibold text-[#0A2540]">
                        {doc.description || doc.file_name}
                      </p>
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 flex items-center gap-2.5 rounded-[11px] bg-[#e8f2ff] px-3 py-2.5"
                      >
                        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-white">
                          <FileText className="size-4 text-[#007BFF]" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-[#0A2540]">
                            {doc.file_name}
                          </span>
                          <span className="block text-[10.5px] text-[#6b7a8d]">
                            {formatSizeKb(doc.file_size_kb)}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] font-bold text-[#007BFF]">
                          Lihat
                        </span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Panel: Info Proyek */}
        {tab === 'info' ? (
          <div className="px-5 pt-[18px]">
            <p className="mb-0.5 text-sm font-bold text-[#0A2540]">Informasi Proyek</p>
            <p className="mb-4 text-xs text-[#6b7a8d]">Ringkasan detail proyek kamu</p>

            <div className="rounded-2xl bg-white p-[18px] shadow-[0_1px_2px_rgba(10,37,64,0.04)]">
              {[
                ['Kode Proyek', project.code],
                ['Lokasi', project.area],
                [
                  'Jumlah Titik',
                  project.camera_count ? `${project.camera_count} Kamera` : '-',
                ],
                [
                  'Teknisi Bertugas',
                  project.technicians.length > 0 ? project.technicians.join(', ') : '-',
                ],
                ['Estimasi Selesai', formatShortDate(project.eta)],
              ].map(([label, value], index, arr) => (
                <div
                  key={label}
                  className={
                    'flex justify-between py-2.5 ' +
                    (index !== arr.length - 1 ? 'border-b border-[#e4e9f0]' : '')
                  }
                >
                  <span className="text-xs text-[#6b7a8d]">{label}</span>
                  <span className="text-right text-[12.5px] font-semibold text-[#0A2540]">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <footer className="px-5 pt-5 text-center">
          <p className="text-[11px] text-[#a3aebc]">
            Ada pertanyaan? Hubungi admin i1 CCTV Store via WhatsApp
          </p>
        </footer>
      </div>

      {/* Lightbox */}
      {lightbox && currentLog ? (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[rgba(6,16,28,0.92)]">
          <div className="absolute top-0 right-0 left-0 flex items-center justify-between p-4">
            <span className="text-[12.5px] font-semibold text-white/85">
              {lightbox.photoIndex + 1} / {currentLog.photo_urls.length}
            </span>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="flex size-[34px] items-center justify-center rounded-full bg-white/12 text-white"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="relative mx-5 flex aspect-[4/5] w-full max-w-[430px] items-center justify-center overflow-hidden rounded-2xl bg-[#22344a]">
            {currentLog.photo_urls.length > 1 ? (
              <button
                type="button"
                onClick={() =>
                  setLightbox((prev) =>
                    prev
                      ? {
                          ...prev,
                          photoIndex:
                            (prev.photoIndex - 1 + currentLog.photo_urls.length) %
                            currentLog.photo_urls.length,
                        }
                      : prev
                  )
                }
                className="absolute top-1/2 left-1 flex size-[38px] -translate-y-1/2 items-center justify-center rounded-full bg-white/14 text-white"
              >
                <ChevLeft className="size-4" aria-hidden="true" />
              </button>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentLog.photo_urls[lightbox.photoIndex]}
              alt={currentLog.title}
              className="size-full object-contain"
            />
            {currentLog.photo_urls.length > 1 ? (
              <button
                type="button"
                onClick={() =>
                  setLightbox((prev) =>
                    prev
                      ? {
                          ...prev,
                          photoIndex: (prev.photoIndex + 1) % currentLog.photo_urls.length,
                        }
                      : prev
                  )
                }
                className="absolute top-1/2 right-1 flex size-[38px] -translate-y-1/2 items-center justify-center rounded-full bg-white/14 text-white"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="px-8 pt-4 pb-1 text-center text-white">
            <p className="text-[13px] font-semibold">{currentLog.title}</p>
            <p className="mt-0.5 text-[11.5px] opacity-60">
              {formatShortDate(currentLog.created_at)} {formatTimeOnly(currentLog.created_at)}
              {currentLog.created_by_name ? ` · ${currentLog.created_by_name}` : ''}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

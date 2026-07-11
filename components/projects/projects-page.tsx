'use client'

import { useState } from 'react'
import { ProjectManagement } from '@/components/projects/project-management'
import { ProjectDetail } from '@/components/projects/project-detail'

// Modul Proyek tidak pakai routing Next.js (app/proyek/...) — mengikuti pola
// single-page aplikasi ini, semua modul di-switch lewat state di dalam satu
// route ('/'). Komponen ini yang jadi "halaman" untuk PageKey === 'proyek',
// dipanggil dari app/page.tsx.
export function ProjectsPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  if (selectedProjectId) {
    return (
      <ProjectDetail
        projectId={selectedProjectId}
        onBack={() => setSelectedProjectId(null)}
      />
    )
  }

  return <ProjectManagement onOpenProject={setSelectedProjectId} />
}

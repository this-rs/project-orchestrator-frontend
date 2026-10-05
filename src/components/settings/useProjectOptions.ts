import { useEffect, useState } from 'react'
import { projectsApi } from '@/services/projects'

export interface ProjectOption {
  slug: string
  name: string
}

/** Projects the pickers offer. `null` until loaded; an empty list on failure (the pickers then say there is none). */
export function useProjectOptions(): ProjectOption[] | null {
  const [projects, setProjects] = useState<ProjectOption[] | null>(null)
  useEffect(() => {
    let cancelled = false
    projectsApi
      .list({ limit: 200 })
      .then((res) => {
        if (!cancelled) setProjects((res.items ?? []).map((p) => ({ slug: p.slug, name: p.name || p.slug })))
      })
      .catch(() => {
        if (!cancelled) setProjects([])
      })
    return () => {
      cancelled = true
    }
  }, [])
  return projects
}

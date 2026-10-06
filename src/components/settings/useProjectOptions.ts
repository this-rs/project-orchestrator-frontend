import { useEffect, useState } from 'react'
import { projectsApi } from '@/services/projects'

export interface ProjectOption {
  slug: string
  name: string
}

/** The server refuses a page above 100 items (`limit cannot exceed 100`): ask for 100 and walk the pages. */
const PAGE = 100
/** A guard against a server that never returns a short page. */
const MAX_PAGES = 50

async function loadAllProjects(): Promise<ProjectOption[]> {
  const out: ProjectOption[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await projectsApi.list({ limit: PAGE, offset: page * PAGE })
    const items = res.items ?? []
    out.push(...items.map((p) => ({ slug: p.slug, name: p.name || p.slug })))
    if (items.length < PAGE || (typeof res.total === 'number' && out.length >= res.total)) break
  }
  return out
}

/** Projects the pickers offer. `null` until loaded; an empty list on failure (the pickers then say there is none). */
export function useProjectOptions(): ProjectOption[] | null {
  const [projects, setProjects] = useState<ProjectOption[] | null>(null)
  useEffect(() => {
    let cancelled = false
    loadAllProjects()
      .then((all) => {
        if (!cancelled) setProjects(all)
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

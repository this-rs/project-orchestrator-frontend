import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { workspacesApi } from '@/services'
import { useWorkspaceSlug } from '@/hooks/useWorkspace'
import type { Project } from '@/types'
import { tr } from '@/i18n/lazy'

export interface UseProjectFilterReturn {
  /** Workspace projects available for filtering */
  projects: Project[]
  /** Currently selected project ID, or 'all' */
  selectedProjectId: string
  /** Set the selected project (pass 'all' to clear) */
  setSelectedProjectId: (id: string) => void
  /** The project_id to pass to API calls, or undefined if 'all' */
  projectFilterParam: string | undefined
  /** Select options ready for <Select> component */
  projectOptions: { value: string; label: string }[]
}

export function useProjectFilter(): UseProjectFilterReturn {
  const wsSlug = useWorkspaceSlug()
  const [searchParams, setSearchParams] = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])

  // Load workspace projects
  useEffect(() => {
    workspacesApi
      .listProjects(wsSlug)
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setProjects([]))
  }, [wsSlug])

  const selectedProjectId = searchParams.get('project') || 'all'

  const setSelectedProjectId = useCallback(
    (id: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (id === 'all') {
          next.delete('project')
        } else {
          next.set('project', id)
        }
        return next
      }, { replace: true })
    },
    [setSearchParams],
  )

  const projectFilterParam = selectedProjectId !== 'all' ? selectedProjectId : undefined

  const projectOptions = useMemo(
    () => [
      { value: 'all', label: tr('app.hooks.allProjects') },
      ...projects.map((p) => ({ value: p.id, label: p.name })),
    ],
    [projects],
  )

  return {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    projectFilterParam,
    projectOptions,
  }
}

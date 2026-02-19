import { useEffect, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { chatSuggestedProjectIdAtom, chatSelectedProjectAtom, chatAllProjectsModeAtom, activeWorkspaceSlugAtom, activeWorkspaceAtom } from '@/atoms'
import { Select } from '@/components/ui'
import { workspacesApi } from '@/services'
import type { Project } from '@/types'

/** Shorten an absolute path by replacing the home directory with ~ */
function shortenPath(path: string): string {
  if (path.startsWith('~/')) return path
  return path.replace(/^\/(?:Users|home)\/[^/]+\//, '~/')
}

export function ProjectSelect() {
  const suggestedId = useAtomValue(chatSuggestedProjectIdAtom)
  const [selectedProject, setSelectedProject] = useAtom(chatSelectedProjectAtom)
  const [allProjectsMode, setAllProjectsMode] = useAtom(chatAllProjectsModeAtom)
  const activeWsSlug = useAtomValue(activeWorkspaceSlugAtom)
  const activeWorkspace = useAtomValue(activeWorkspaceAtom)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // Load projects from the active workspace
  useEffect(() => {
    if (!activeWsSlug) {
      setProjects([])
      setLoading(false)
      return
    }

    setLoading(true)
    workspacesApi.listProjects(activeWsSlug).then((data) => {
      const items = Array.isArray(data) ? data : []
      setProjects(items)

      // Auto-select a project for cwd fallback (even in all-workspace mode)
      if (!selectedProject && items.length > 0) {
        if (suggestedId) {
          const match = items.find((p) => p.id === suggestedId)
          if (match) {
            setSelectedProject(match)
            setLoading(false)
            return
          }
        }
        setSelectedProject(items[0])
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [activeWsSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="px-4 py-2">
        <div className="text-xs text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!activeWsSlug) {
    return (
      <div className="px-4 py-2">
        <div className="text-xs text-red-400">No workspace selected.</div>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="px-4 py-2">
        <div className="text-xs text-red-400">No projects in this workspace. Create a project first.</div>
      </div>
    )
  }

  return (
    <div className="px-4 py-2 border-b border-white/[0.06]">
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] uppercase tracking-wider text-gray-500">
          Scope
        </label>
        {activeWorkspace && (
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3 text-purple-400/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="text-[10px] text-purple-400 font-medium truncate">{activeWorkspace.name}</span>
          </div>
        )}
      </div>
      <Select
        options={[
          { value: '__all__', label: 'All workspace' },
          ...projects.map((p) => ({ value: p.id, label: p.name })),
        ]}
        value={allProjectsMode ? '__all__' : (selectedProject?.id || '')}
        onChange={(val) => {
          if (val === '__all__') {
            setAllProjectsMode(true)
            // Keep selectedProject as first project for cwd fallback
            if (!selectedProject && projects.length > 0) {
              setSelectedProject(projects[0])
            }
          } else {
            setAllProjectsMode(false)
            const project = projects.find((p) => p.id === val) || null
            setSelectedProject(project)
          }
        }}
      />
      {!allProjectsMode && selectedProject?.root_path && (
        <div className="text-[10px] text-gray-600 mt-1 truncate font-mono">
          {shortenPath(selectedProject.root_path)}
        </div>
      )}
    </div>
  )
}

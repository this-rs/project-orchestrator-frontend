import { useEffect, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { chatSuggestedProjectIdAtom, chatSelectedProjectAtom, chatAllProjectsModeAtom, chatWorkspaceHasProjectsAtom, activeWorkspaceSlugAtom, activeWorkspaceAtom, projectRefreshAtom } from '@/atoms'
import { Select } from '@/components/ui'
import { workspacesApi } from '@/services'
import type { Project } from '@/types'
import { Archive } from 'lucide-react'

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
  const setHasProjects = useSetAtom(chatWorkspaceHasProjectsAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // Load projects from the active workspace
  // Re-fetches when projectRefresh bumps (CRUD event via WebSocket)
  useEffect(() => {
    if (!activeWsSlug) {
      setProjects([])
      setHasProjects(false)
      setLoading(false)
      return
    }

    setLoading(true)
    workspacesApi.listProjects(activeWsSlug).then((data) => {
      const items = Array.isArray(data) ? data : []
      setProjects(items)
      setHasProjects(items.length > 0)

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
  }, [activeWsSlug, projectRefresh]) // eslint-disable-line react-hooks/exhaustive-deps

  // No projects → ChatPanel handles the empty state placeholder
  if (loading || !activeWsSlug || projects.length === 0) {
    return null
  }

  return (
    <div className="px-4 py-2 border-b border-white/[0.06]">
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] uppercase tracking-wider text-gray-500">
          Scope
        </label>
        {activeWorkspace && (
          <div className="flex items-center gap-1">
            <Archive className="w-3 h-3 text-purple-400/60 shrink-0" />
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

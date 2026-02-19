import { useEffect, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { chatSuggestedProjectIdAtom, chatSelectedProjectAtom, chatSelectedWorkspaceAtom, chatContextModeAtom } from '@/atoms'
import { Select } from '@/components/ui'
import { projectsApi, workspacesApi } from '@/services'
import type { Project, Workspace } from '@/types'

/** Shorten an absolute path by replacing the home directory with ~ */
function shortenPath(path: string): string {
  if (path.startsWith('~/')) return path
  return path.replace(/^\/(?:Users|home)\/[^/]+\//, '~/')
}

export function ProjectSelect() {
  const suggestedId = useAtomValue(chatSuggestedProjectIdAtom)
  const [selectedProject, setSelectedProject] = useAtom(chatSelectedProjectAtom)
  const [selectedWorkspace, setSelectedWorkspace] = useAtom(chatSelectedWorkspaceAtom)
  const [contextMode, setContextMode] = useAtom(chatContextModeAtom)
  const [projects, setProjects] = useState<Project[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceProjects, setWorkspaceProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // Load projects and workspaces on mount
  useEffect(() => {
    Promise.all([
      projectsApi.list({ limit: 100 }),
      workspacesApi.list({ limit: 100 }),
    ]).then(([projData, wsData]) => {
      const items = projData.items || []
      setProjects(items)
      setWorkspaces(wsData.items || [])
      setLoading(false)

      // Auto-select only if no project is already selected (atom persists across remounts)
      if (!selectedProject && items.length > 0 && contextMode === 'project') {
        if (suggestedId) {
          const match = items.find((p) => p.id === suggestedId)
          if (match) {
            setSelectedProject(match)
            return
          }
        }
        // Default to first project if none suggested
        setSelectedProject(items[0])
      }
    }).catch(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When workspace changes, load its projects and auto-select first as cwd
  const wsSlug = selectedWorkspace?.slug
  useEffect(() => {
    if (!wsSlug) return
    workspacesApi.listProjects(wsSlug).then((data) => {
      const wsProjs = Array.isArray(data) ? data : []
      // Resolve full project details from the loaded projects list
      const fullProjects = wsProjs
        .map((wp) => projects.find((p) => p.id === wp.id))
        .filter((p): p is Project => p != null)
      setWorkspaceProjects(fullProjects)
      // Auto-select first project as primary (used for cwd)
      if (fullProjects.length > 0 && contextMode === 'workspace') {
        setSelectedProject(fullProjects[0])
      }
    })
  }, [wsSlug, projects, contextMode, setSelectedProject])

  // Clear workspace projects when workspace is deselected
  const wsProjects = wsSlug ? workspaceProjects : []

  if (loading) {
    return (
      <div className="px-4 py-2">
        <div className="text-xs text-gray-500">Loading...</div>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="px-4 py-2">
        <div className="text-xs text-red-400">No projects found. Create a project first.</div>
      </div>
    )
  }

  const hasWorkspaces = workspaces.length > 0

  return (
    <div className="px-4 py-2 border-b border-white/[0.06]">
      {/* Mode toggle — only show if workspaces exist */}
      {hasWorkspaces && (
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => { setContextMode('project'); setSelectedWorkspace(null) }}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
              contextMode === 'project'
                ? 'bg-indigo-500/15 text-indigo-400'
                : 'text-gray-500 hover:text-gray-400 hover:bg-white/[0.04]'
            }`}
          >
            Project
          </button>
          <button
            onClick={() => { setContextMode('workspace'); setSelectedProject(null) }}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
              contextMode === 'workspace'
                ? 'bg-purple-500/15 text-purple-400'
                : 'text-gray-500 hover:text-gray-400 hover:bg-white/[0.04]'
            }`}
          >
            Workspace
          </button>
        </div>
      )}

      {contextMode === 'project' ? (
        <>
          <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">
            Project
          </label>
          <Select
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            value={selectedProject?.id || ''}
            onChange={(val) => {
              const project = projects.find((p) => p.id === val) || null
              setSelectedProject(project)
            }}
          />
          {selectedProject && (
            <div className="text-[10px] text-gray-600 mt-1 truncate font-mono">
              {selectedProject.root_path}
            </div>
          )}
        </>
      ) : (
        <>
          <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">
            Workspace
          </label>
          <Select
            options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
            value={selectedWorkspace?.id || ''}
            onChange={(val) => {
              const ws = workspaces.find((w) => w.id === val) || null
              setSelectedWorkspace(ws)
            }}
          />
          {/* Show workspace projects summary */}
          {selectedWorkspace && (
            <div className="mt-1.5">
              {wsProjects.length > 0 ? (
                <div className="space-y-0.5">
                  <div className="text-[10px] text-gray-500">
                    {wsProjects.length} project{wsProjects.length !== 1 ? 's' : ''} · Claude will have access to all
                  </div>
                  {wsProjects.map((p) => (
                    <div key={p.id} className="flex items-center gap-1.5 text-[10px]">
                      <svg className="w-2.5 h-2.5 text-purple-400/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      <span className="text-gray-400 truncate">{p.name}</span>
                      <span className="text-gray-600 truncate font-mono">{shortenPath(p.root_path)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-gray-600">Loading projects...</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

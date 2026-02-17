import { useEffect, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { chatSuggestedProjectIdAtom, chatSelectedProjectAtom } from '@/atoms'
import { Select } from '@/components/ui'
import { projectsApi } from '@/services'
import type { Project } from '@/types'

export function ProjectSelect() {
  const suggestedId = useAtomValue(chatSuggestedProjectIdAtom)
  const [selectedProject, setSelectedProject] = useAtom(chatSelectedProjectAtom)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    projectsApi.list({ limit: 100 }).then((data) => {
      const items = data.items || []
      setProjects(items)
      setLoading(false)

      // Auto-select only if no project is already selected (atom persists across remounts)
      if (!selectedProject && items.length > 0) {
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

  if (loading) {
    return (
      <div className="px-4 py-2">
        <div className="text-xs text-gray-500">Loading projects...</div>
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

  return (
    <div className="px-4 py-2 border-b border-white/[0.06]">
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
    </div>
  )
}

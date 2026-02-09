import { useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import { chatSuggestedProjectIdAtom } from '@/atoms'
import { Select } from '@/components/ui'
import { projectsApi } from '@/services'
import type { Project } from '@/types'

interface ProjectSelectProps {
  value: string | null
  onChange: (project: Project | null) => void
}

export function ProjectSelect({ value, onChange }: ProjectSelectProps) {
  const suggestedId = useAtomValue(chatSuggestedProjectIdAtom)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    projectsApi.list({ limit: 100 }).then((data) => {
      const items = data.items || []
      setProjects(items)
      setLoading(false)

      // Auto-select suggested project on first load
      if (!initialized && items.length > 0) {
        setInitialized(true)
        if (suggestedId) {
          const match = items.find((p) => p.id === suggestedId)
          if (match) {
            onChange(match)
            return
          }
        }
        // Default to first project if none suggested
        onChange(items[0])
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
        value={value || ''}
        onChange={(val) => {
          const project = projects.find((p) => p.id === val) || null
          onChange(project)
        }}
      />
      {value && (
        <div className="text-[10px] text-gray-600 mt-1 truncate font-mono">
          {projects.find((p) => p.id === value)?.root_path}
        </div>
      )}
    </div>
  )
}

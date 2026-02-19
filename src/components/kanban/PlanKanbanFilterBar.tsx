import { useEffect, useState } from 'react'
import { Select, Button } from '@/components/ui'
import { workspacesApi } from '@/services'
import { useWorkspaceSlug } from '@/hooks'
import type { Project } from '@/types'

export interface PlanKanbanFilters {
  project: string
  search: string
  priority_min?: number
  priority_max?: number
  hide_completed: boolean
  hide_cancelled: boolean
}

interface PlanKanbanFilterBarProps {
  filters: PlanKanbanFilters
  onFilterChange: <K extends keyof PlanKanbanFilters>(key: K, value: PlanKanbanFilters[K]) => void
  onClearFilters: () => void
  activeFilterCount: number
}

export function PlanKanbanFilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  activeFilterCount,
}: PlanKanbanFilterBarProps) {
  const wsSlug = useWorkspaceSlug()
  const [projects, setProjects] = useState<Project[]>([])

  // Load projects for the active workspace
  useEffect(() => {
    workspacesApi
      .listProjects(wsSlug)
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setProjects([]))
  }, [wsSlug])

  const projectOptions = [
    { value: 'all', label: 'All Projects' },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ]

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-[#1a1d27]/50 rounded-lg border border-white/[0.06] mb-4">
      {/* Search */}
      <input
        type="text"
        placeholder="Search title..."
        value={filters.search}
        onChange={(e) => onFilterChange('search', e.target.value)}
        className="w-40 px-2.5 py-1.5 text-sm bg-[#0f1117] border border-white/[0.1] rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
      />

      {/* Project */}
      <Select
        options={projectOptions}
        value={filters.project}
        onChange={(value) => onFilterChange('project', value)}
        className="w-44"
      />

      {/* Priority range */}
      <div className="flex items-center gap-1 text-xs text-gray-400">
        <span>P:</span>
        <input
          type="number"
          placeholder="Min"
          value={filters.priority_min ?? ''}
          onChange={(e) =>
            onFilterChange('priority_min', e.target.value ? Number(e.target.value) : undefined)
          }
          className="w-14 px-1.5 py-1.5 text-sm bg-[#0f1117] border border-white/[0.1] rounded text-gray-200 focus:outline-none focus:border-indigo-500"
        />
        <span>-</span>
        <input
          type="number"
          placeholder="Max"
          value={filters.priority_max ?? ''}
          onChange={(e) =>
            onFilterChange('priority_max', e.target.value ? Number(e.target.value) : undefined)
          }
          className="w-14 px-1.5 py-1.5 text-sm bg-[#0f1117] border border-white/[0.1] rounded text-gray-200 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-white/[0.06]" />

      {/* Hide toggles */}
      <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.hide_completed}
          onChange={(e) => onFilterChange('hide_completed', e.target.checked)}
          className="rounded border-white/[0.1] bg-[#0f1117] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
        />
        Hide completed
      </label>
      <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.hide_cancelled}
          onChange={(e) => onFilterChange('hide_cancelled', e.target.checked)}
          className="rounded border-white/[0.1] bg-[#0f1117] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
        />
        Hide cancelled
      </label>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Active filter count + clear */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-[10px] font-bold text-white">
            {activeFilterCount}
          </span>
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  )
}

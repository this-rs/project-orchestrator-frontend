import { useEffect, useState } from 'react'
import type { KanbanFilters } from '@/hooks/useKanbanFilters'
import type { Plan, Project } from '@/types'
import { plansApi, projectsApi } from '@/services'
import { Select, Button } from '@/components/ui'

interface KanbanFilterBarProps {
  filters: KanbanFilters
  onFilterChange: <K extends keyof KanbanFilters>(key: K, value: KanbanFilters[K]) => void
  onToggleExcludeProject: (projectId: string) => void
  onClearFilters: () => void
  activeFilterCount: number
}

export function KanbanFilterBar({
  filters,
  onFilterChange,
  onToggleExcludeProject,
  onClearFilters,
  activeFilterCount,
}: KanbanFilterBarProps) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    plansApi.list({ limit: 100 }).then((r) => setPlans(r.items || [])).catch(() => {})
    projectsApi.list({ limit: 100 }).then((r) => setProjects(r.items || [])).catch(() => {})
  }, [])

  const planOptions = [
    { value: '', label: 'All Plans' },
    ...plans.map((p) => ({ value: p.id, label: p.title })),
  ]

  const projectOptions = projects.filter(
    (p) => !filters.exclude_projects?.includes(p.id),
  )

  const excludedProjects = projects.filter(
    (p) => filters.exclude_projects?.includes(p.id),
  )

  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 p-3 bg-[#1a1d27]/50 rounded-lg border border-white/[0.06] mb-4">
      {/* Plan filter */}
      <Select
        options={planOptions}
        value={filters.plan_id || ''}
        onChange={(value) => onFilterChange('plan_id', value || undefined)}
        className="w-full sm:w-44"
      />

      {/* Assigned filter */}
      <input
        type="text"
        placeholder="Assigned to..."
        value={filters.assigned_to || ''}
        onChange={(e) => onFilterChange('assigned_to', e.target.value || undefined)}
        className="w-full sm:w-36 px-2.5 py-1.5 text-sm bg-[#0f1117] border border-white/[0.1] rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
      />

      {/* Priority range */}
      <div className="flex items-center gap-1 text-xs text-gray-400">
        <span>P:</span>
        <input
          type="number"
          placeholder="Min"
          value={filters.priority_min ?? ''}
          onChange={(e) => onFilterChange('priority_min', e.target.value ? Number(e.target.value) : undefined)}
          className="w-14 px-1.5 py-1.5 text-sm bg-[#0f1117] border border-white/[0.1] rounded text-gray-200 focus:outline-none focus:border-indigo-500"
        />
        <span>-</span>
        <input
          type="number"
          placeholder="Max"
          value={filters.priority_max ?? ''}
          onChange={(e) => onFilterChange('priority_max', e.target.value ? Number(e.target.value) : undefined)}
          className="w-14 px-1.5 py-1.5 text-sm bg-[#0f1117] border border-white/[0.1] rounded text-gray-200 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Divider */}
      <div className="hidden sm:block w-px h-6 bg-white/[0.06]" />

      {/* Hide completed/failed toggles */}
      <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.exclude_completed || false}
          onChange={(e) => onFilterChange('exclude_completed', e.target.checked || undefined)}
          className="rounded border-white/[0.1] bg-[#0f1117] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
        />
        Hide completed
      </label>
      <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.exclude_failed || false}
          onChange={(e) => onFilterChange('exclude_failed', e.target.checked || undefined)}
          className="rounded border-white/[0.1] bg-[#0f1117] text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
        />
        Hide failed
      </label>

      {/* Exclude projects */}
      {projectOptions.length > 0 && (
        <Select
          options={projectOptions.map((p) => ({ value: p.id, label: p.name }))}
          value=""
          onChange={(value) => { if (value) onToggleExcludeProject(value) }}
          placeholder="Exclude project..."
          className="w-full sm:w-40"
        />
      )}

      {/* Excluded project chips */}
      {excludedProjects.map((p) => (
        <button key={p.id} onClick={() => onToggleExcludeProject(p.id)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-900/50 text-red-400 hover:bg-red-900/70 transition-colors cursor-pointer">
          {p.name} &times;
        </button>
      ))}

      {/* Spacer */}
      <div className="hidden sm:block flex-1" />

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

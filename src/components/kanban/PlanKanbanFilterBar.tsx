import { useEffect, useState, type ReactNode } from 'react'
import { Folder } from 'lucide-react'
import { FilterBar, Select, Switch } from '@/components/ui'
import { workspacesApi } from '@/services'
import { useWorkspaceSlug } from '@/hooks'
import type { Project } from '@/types'
import { PriorityRangeFields } from './ListControls'

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
  /** Number of active filters (search excluded — it is not a filter). */
  activeFilterCount: number
  /** Right of the search row (view toggle). */
  trailing?: ReactNode
}

/** Plan board toolbar: title search + collapsible filters (FilterBar). */
export function PlanKanbanFilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  activeFilterCount,
  trailing,
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

  const projectOptions = [{ value: 'all', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]

  const activeLabels = [
    filters.project !== 'all' ? projects.find((p) => p.id === filters.project)?.name ?? 'Project' : '',
    filters.priority_min !== undefined ? `P ≥ ${filters.priority_min}` : '',
    filters.priority_max !== undefined ? `P ≤ ${filters.priority_max}` : '',
    filters.hide_completed ? 'Hide completed' : '',
    filters.hide_cancelled ? 'Hide cancelled' : '',
  ]

  return (
    <FilterBar
      search={filters.search}
      onSearchChange={(v) => onFilterChange('search', v)}
      searchPlaceholder="Search plans…"
      activeCount={activeFilterCount}
      activeLabels={activeLabels}
      onClear={onClearFilters}
      trailing={trailing}
      filters={
        <>
          {projects.length > 0 && (
            <Select
              options={projectOptions}
              value={filters.project}
              onChange={(value) => onFilterChange('project', value)}
              icon={<Folder className="w-3 h-3" />}
            />
          )}
          <PriorityRangeFields
            min={filters.priority_min}
            max={filters.priority_max}
            onMinChange={(v) => onFilterChange('priority_min', v)}
            onMaxChange={(v) => onFilterChange('priority_max', v)}
          />
          <Switch label="Hide completed" checked={filters.hide_completed} onChange={(v) => onFilterChange('hide_completed', v)} />
          <Switch label="Hide cancelled" checked={filters.hide_cancelled} onChange={(v) => onFilterChange('hide_cancelled', v)} />
        </>
      }
    />
  )
}

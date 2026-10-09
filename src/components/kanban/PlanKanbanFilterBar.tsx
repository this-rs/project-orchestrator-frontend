import { useEffect, useState, type ReactNode } from 'react'
import { Folder } from 'lucide-react'
import { FilterBar, Select, Switch } from '@/components/ui'
import { workspacesApi } from '@/services'
import { useWorkspaceSlug } from '@/hooks'
import { useT } from '@/i18n'
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
  const { t } = useT()
  const wsSlug = useWorkspaceSlug()
  const [projects, setProjects] = useState<Project[]>([])

  // Load projects for the active workspace
  useEffect(() => {
    workspacesApi
      .listProjects(wsSlug)
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setProjects([]))
  }, [wsSlug])

  const projectOptions = [{ value: 'all', label: t('kanban.filters.allProjects') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]

  const activeLabels = [
    filters.project !== 'all' ? projects.find((p) => p.id === filters.project)?.name ?? t('kanban.filters.project') : '',
    filters.priority_min !== undefined ? `P ≥ ${filters.priority_min}` : '',
    filters.priority_max !== undefined ? `P ≤ ${filters.priority_max}` : '',
    filters.hide_completed ? t('kanban.filters.hideCompleted') : '',
    filters.hide_cancelled ? t('kanban.filters.hideCancelled') : '',
  ]

  return (
    <FilterBar
      search={filters.search}
      onSearchChange={(v) => onFilterChange('search', v)}
      searchPlaceholder={t('kanban.filters.searchPlans')}
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
          <Switch label={t('kanban.filters.hideCompleted')} checked={filters.hide_completed} onChange={(v) => onFilterChange('hide_completed', v)} />
          <Switch label={t('kanban.filters.hideCancelled')} checked={filters.hide_cancelled} onChange={(v) => onFilterChange('hide_cancelled', v)} />
        </>
      }
    />
  )
}

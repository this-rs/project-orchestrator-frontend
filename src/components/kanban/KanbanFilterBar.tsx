import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { KanbanFilters } from '@/hooks/useKanbanFilters'
import type { Plan, Project } from '@/types'
import { plansApi, workspacesApi } from '@/services'
import { useWorkspaceSlug } from '@/hooks'
import { useT } from '@/i18n'
import { Button, FilterBar, Select, Switch } from '@/components/ui'
import { FilterField, PriorityRangeFields } from './ListControls'

interface KanbanFilterBarProps {
  filters: KanbanFilters
  onFilterChange: <K extends keyof KanbanFilters>(key: K, value: KanbanFilters[K]) => void
  onToggleExcludeProject: (projectId: string) => void
  onClearFilters: () => void
  activeFilterCount: number
  /** Right of the search row (view toggle). */
  trailing?: ReactNode
}

/**
 * Task board filters, rendered with the design-system FilterBar: filters
 * collapse behind the sliders button, the active-filter summary + Clear stay
 * visible. (The task API has no text search, so no search field.)
 */
export function KanbanFilterBar({
  filters,
  onFilterChange,
  onToggleExcludeProject,
  onClearFilters,
  activeFilterCount,
  trailing,
}: KanbanFilterBarProps) {
  const { t } = useT()
  const wsSlug = useWorkspaceSlug()
  const [plans, setPlans] = useState<Plan[]>([])
  const [projects, setProjects] = useState<Project[]>([])

  // Options scoped to the active workspace (plans / projects of other workspaces are not filterable here)
  useEffect(() => {
    plansApi.list({ limit: 100, workspace_slug: wsSlug }).then((r) => setPlans(r.items || [])).catch(() => {})
    workspacesApi.listProjects(wsSlug).then((data) => setProjects(Array.isArray(data) ? data : [])).catch(() => {})
  }, [wsSlug])

  const planOptions = [{ value: '', label: t('kanban.filters.allPlans') }, ...plans.map((p) => ({ value: p.id, label: p.title }))]
  const excluded = filters.exclude_projects ?? []
  const includable = projects.filter((p) => !excluded.includes(p.id))
  const excludedProjects = projects.filter((p) => excluded.includes(p.id))

  const planLabel = filters.plan_id ? plans.find((p) => p.id === filters.plan_id)?.title ?? t('kanban.filters.plan') : ''
  const activeLabels = [
    planLabel,
    filters.assigned_to ? `@${filters.assigned_to}` : '',
    filters.priority_min !== undefined ? `P ≥ ${filters.priority_min}` : '',
    filters.priority_max !== undefined ? `P ≤ ${filters.priority_max}` : '',
    filters.exclude_completed ? t('kanban.filters.hideCompleted') : '',
    filters.exclude_failed ? t('kanban.filters.hideFailed') : '',
    excluded.length > 0 ? (excludedProjects.length > 0
        ? t('kanban.filters.excluding', { names: excludedProjects.map((p) => p.name).join(', ') })
        : t('kanban.filters.excludingCount', { count: excluded.length })) : '',
  ]

  return (
    <FilterBar
      activeCount={activeFilterCount}
      activeLabels={activeLabels}
      onClear={onClearFilters}
      trailing={trailing}
      filters={
        <>
          <Select
            options={planOptions}
            value={filters.plan_id || ''}
            onChange={(value) => onFilterChange('plan_id', value || undefined)}
          />
          <FilterField
            label={t('kanban.filters.assignedTo')}
            placeholder={t('kanban.filters.assignedToPlaceholder')}
            value={filters.assigned_to}
            onChange={(v) => onFilterChange('assigned_to', v || undefined)}
          />
          <PriorityRangeFields
            min={filters.priority_min}
            max={filters.priority_max}
            onMinChange={(v) => onFilterChange('priority_min', v)}
            onMaxChange={(v) => onFilterChange('priority_max', v)}
          />
          <Switch
            label={t('kanban.filters.hideCompleted')}
            checked={filters.exclude_completed || false}
            onChange={(v) => onFilterChange('exclude_completed', v || undefined)}
          />
          <Switch
            label={t('kanban.filters.hideFailed')}
            checked={filters.exclude_failed || false}
            onChange={(v) => onFilterChange('exclude_failed', v || undefined)}
          />
          {includable.length > 0 && (
            <Select
              options={includable.map((p) => ({ value: p.id, label: p.name }))}
              value=""
              onChange={(value) => {
                if (value) onToggleExcludeProject(value)
              }}
              placeholder={t('kanban.filters.excludeProject')}
            />
          )}
          {excludedProjects.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2 lg:col-span-3">
              {excludedProjects.map((p) => (
                // One flat glass button per excluded project (repeated control → no blur).
                <Button
                  key={p.id}
                  size="sm"
                  variant="secondary"
                  flat
                  onClick={() => onToggleExcludeProject(p.id)}
                  aria-label={t('kanban.filters.stopExcluding', { name: p.name })}
                  className="text-xs font-normal text-gray-400"
                >
                  <span className="line-through decoration-gray-600">{p.name}</span>
                  <X className="w-3 h-3" aria-hidden="true" />
                </Button>
              ))}
            </div>
          )}
        </>
      }
    />
  )
}

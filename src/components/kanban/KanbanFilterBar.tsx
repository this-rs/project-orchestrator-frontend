import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { KanbanFilters } from '@/hooks/useKanbanFilters'
import type { Plan, Project } from '@/types'
import { plansApi, projectsApi } from '@/services'
import { FilterBar, Select, Switch } from '@/components/ui'
import { focusRing } from '@/components/ui/classes'
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
  const [plans, setPlans] = useState<Plan[]>([])
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    plansApi.list({ limit: 100 }).then((r) => setPlans(r.items || [])).catch(() => {})
    projectsApi.list({ limit: 100 }).then((r) => setProjects(r.items || [])).catch(() => {})
  }, [])

  const planOptions = [{ value: '', label: 'All plans' }, ...plans.map((p) => ({ value: p.id, label: p.title }))]
  const excluded = filters.exclude_projects ?? []
  const includable = projects.filter((p) => !excluded.includes(p.id))
  const excludedProjects = projects.filter((p) => excluded.includes(p.id))

  const planLabel = filters.plan_id ? plans.find((p) => p.id === filters.plan_id)?.title ?? 'Plan' : ''
  const activeLabels = [
    planLabel,
    filters.assigned_to ? `@${filters.assigned_to}` : '',
    filters.priority_min !== undefined ? `P ≥ ${filters.priority_min}` : '',
    filters.priority_max !== undefined ? `P ≤ ${filters.priority_max}` : '',
    filters.exclude_completed ? 'Hide completed' : '',
    filters.exclude_failed ? 'Hide failed' : '',
    excluded.length > 0 ? `Excluding ${excludedProjects.map((p) => p.name).join(', ') || `${excluded.length} projects`}` : '',
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
            label="Assigned to"
            placeholder="Assigned to…"
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
            label="Hide completed"
            checked={filters.exclude_completed || false}
            onChange={(v) => onFilterChange('exclude_completed', v || undefined)}
          />
          <Switch
            label="Hide failed"
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
              placeholder="Exclude project…"
            />
          )}
          {excludedProjects.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2 lg:col-span-3">
              {excludedProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onToggleExcludeProject(p.id)}
                  aria-label={`Stop excluding ${p.name}`}
                  className={`inline-flex items-center gap-1 min-h-9 px-2 rounded-md border border-white/[0.08] text-xs text-gray-400 line-through decoration-gray-600 hover:text-gray-200 ${focusRing}`}
                >
                  {p.name}
                  <X className="w-3 h-3 no-underline" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </>
      }
    />
  )
}

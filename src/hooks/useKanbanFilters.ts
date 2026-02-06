import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

export interface KanbanFilters {
  milestone_id?: string
  plan_id?: string
  assigned_to?: string
  tags?: string[]
  priority_min?: number
  priority_max?: number
  exclude_projects?: string[]
  exclude_completed?: boolean
  exclude_failed?: boolean
}

export interface UseKanbanFiltersReturn {
  filters: KanbanFilters
  setFilter: <K extends keyof KanbanFilters>(key: K, value: KanbanFilters[K]) => void
  toggleExcludeProject: (projectId: string) => void
  clearFilters: () => void
  hasActiveFilters: boolean
  activeFilterCount: number
  buildApiParams: () => Record<string, string | number | undefined>
}

function parseFiltersFromParams(params: URLSearchParams): KanbanFilters {
  const filters: KanbanFilters = {}

  const milestone = params.get('milestone')
  if (milestone) filters.milestone_id = milestone

  const plan = params.get('plan')
  if (plan) filters.plan_id = plan

  const assigned = params.get('assigned')
  if (assigned) filters.assigned_to = assigned

  const tags = params.get('tags')
  if (tags) filters.tags = tags.split(',').filter(Boolean)

  const pMin = params.get('priority_min')
  if (pMin) filters.priority_min = Number(pMin)

  const pMax = params.get('priority_max')
  if (pMax) filters.priority_max = Number(pMax)

  const exclude = params.get('exclude_projects')
  if (exclude) filters.exclude_projects = exclude.split(',').filter(Boolean)

  if (params.get('hide_completed') === '1') filters.exclude_completed = true
  if (params.get('hide_failed') === '1') filters.exclude_failed = true

  return filters
}

function filtersToParams(filters: KanbanFilters): Record<string, string> {
  const params: Record<string, string> = {}

  if (filters.milestone_id) params.milestone = filters.milestone_id
  if (filters.plan_id) params.plan = filters.plan_id
  if (filters.assigned_to) params.assigned = filters.assigned_to
  if (filters.tags?.length) params.tags = filters.tags.join(',')
  if (filters.priority_min !== undefined) params.priority_min = String(filters.priority_min)
  if (filters.priority_max !== undefined) params.priority_max = String(filters.priority_max)
  if (filters.exclude_projects?.length) params.exclude_projects = filters.exclude_projects.join(',')
  if (filters.exclude_completed) params.hide_completed = '1'
  if (filters.exclude_failed) params.hide_failed = '1'

  return params
}

export function useKanbanFilters(): UseKanbanFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo(() => parseFiltersFromParams(searchParams), [searchParams])

  const setFilter = useCallback(
    <K extends keyof KanbanFilters>(key: K, value: KanbanFilters[K]) => {
      const newFilters = { ...parseFiltersFromParams(searchParams), [key]: value }
      // Remove undefined/empty values
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
        delete newFilters[key]
      }
      setSearchParams((prev) => {
        const newParams = new URLSearchParams()
        // Preserve non-filter params (like view)
        const viewParam = prev.get('view')
        if (viewParam) newParams.set('view', viewParam)
        // Set filter params
        const filterParams = filtersToParams(newFilters)
        for (const [k, v] of Object.entries(filterParams)) {
          newParams.set(k, v)
        }
        return newParams
      }, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const toggleExcludeProject = useCallback(
    (projectId: string) => {
      const current = filters.exclude_projects || []
      const newList = current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
      setFilter('exclude_projects', newList.length > 0 ? newList : undefined)
    },
    [filters.exclude_projects, setFilter],
  )

  const clearFilters = useCallback(() => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams()
      const viewParam = prev.get('view')
      if (viewParam) newParams.set('view', viewParam)
      return newParams
    }, { replace: true })
  }, [setSearchParams])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.milestone_id) count++
    if (filters.plan_id) count++
    if (filters.assigned_to) count++
    if (filters.tags?.length) count++
    if (filters.priority_min !== undefined) count++
    if (filters.priority_max !== undefined) count++
    if (filters.exclude_projects?.length) count++
    if (filters.exclude_completed) count++
    if (filters.exclude_failed) count++
    return count
  }, [filters])

  const buildApiParams = useCallback((): Record<string, string | number | undefined> => {
    const params: Record<string, string | number | undefined> = {}
    if (filters.plan_id) params.plan_id = filters.plan_id
    if (filters.assigned_to) params.assigned_to = filters.assigned_to
    if (filters.tags?.length) params.tags = filters.tags.join(',')
    if (filters.priority_min !== undefined) params.priority_min = filters.priority_min
    if (filters.priority_max !== undefined) params.priority_max = filters.priority_max
    return params
  }, [filters])

  return {
    filters,
    setFilter,
    toggleExcludeProject,
    clearFilters,
    hasActiveFilters: activeFilterCount > 0,
    activeFilterCount,
    buildApiParams,
  }
}

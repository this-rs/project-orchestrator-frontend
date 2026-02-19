import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Link, useNavigate } from 'react-router-dom'
import { plansAtom, plansLoadingAtom, planStatusFilterAtom, planRefreshAtom } from '@/atoms'
import { plansApi } from '@/services'
import {
  Card,
  Button,
  LoadingPage,
  EmptyState,
  Select,
  InteractivePlanStatusBadge,
  ViewToggle,
  ConfirmDialog,
  FormDialog,
  OverflowMenu,
  PageShell,
  SelectZone,
  BulkActionBar,
  LoadMoreSentinel,
} from '@/components/ui'
import { useViewMode, useConfirmDialog, useFormDialog, useToast, useMultiSelect, useInfiniteList, useWorkspaceSlug } from '@/hooks'
import { CreatePlanForm } from '@/components/forms'
import { PlanKanbanBoard, PlanKanbanFilterBar } from '@/components/kanban'
import type { PlanKanbanFilters } from '@/components/kanban'
import type { Plan, PlanStatus, PaginatedResponse } from '@/types'

const statusOptions = [
  { value: 'all', label: 'All Status' },
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const defaultFilters: PlanKanbanFilters = {
  project: 'all',
  search: '',
  priority_min: undefined,
  priority_max: undefined,
  hide_completed: false,
  hide_cancelled: false,
}

export function PlansPage() {
  const [, setPlans] = useAtom(plansAtom)
  const [, setLoadingAtom] = useAtom(plansLoadingAtom)
  const [statusFilter, setStatusFilter] = useAtom(planStatusFilterAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const [viewMode, setViewMode] = useViewMode()
  const navigate = useNavigate()
  const confirmDialog = useConfirmDialog()
  const formDialog = useFormDialog()
  const toast = useToast()
  const [formLoading, setFormLoading] = useState(false)
  const wsSlug = useWorkspaceSlug()

  // Kanban filters (workspace filter removed — implicit via wsSlug)
  const [kanbanFilters, setKanbanFilters] = useState<PlanKanbanFilters>(defaultFilters)

  const handleFilterChange = useCallback(
    <K extends keyof PlanKanbanFilters>(key: K, value: PlanKanbanFilters[K]) => {
      setKanbanFilters((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const handleClearFilters = useCallback(() => {
    setKanbanFilters(defaultFilters)
  }, [])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (kanbanFilters.project !== 'all') count++
    if (kanbanFilters.search) count++
    if (kanbanFilters.priority_min !== undefined) count++
    if (kanbanFilters.priority_max !== undefined) count++
    if (kanbanFilters.hide_completed) count++
    if (kanbanFilters.hide_cancelled) count++
    return count
  }, [kanbanFilters])

  // --- Infinite scroll for list mode (workspace-scoped) ---
  const listFilters = useMemo(
    () => ({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      _refresh: planRefresh,
      _ws: wsSlug, // trigger reset on workspace change
    }),
    [statusFilter, planRefresh, wsSlug],
  )

  const listFetcher = useCallback(
    (params: { limit: number; offset: number; status?: string }): Promise<PaginatedResponse<Plan>> => {
      return plansApi.list({
        limit: params.limit,
        offset: params.offset,
        status: params.status,
        workspace_slug: wsSlug,
      })
    },
    [wsSlug],
  )

  const {
    items: plans,
    loading,
    loadingMore,
    hasMore,
    total,
    sentinelRef,
    reset,
    removeItems,
    updateItem,
  } = useInfiniteList({
    fetcher: listFetcher,
    filters: listFilters,
    enabled: viewMode === 'list',
  })

  // Sync plans atom for other components that read it
  useEffect(() => {
    if (viewMode === 'list') {
      setPlans(plans)
      setLoadingAtom(loading)
    }
  }, [plans, loading, viewMode, setPlans, setLoadingAtom])

  // Stable fetchFn for PlanKanbanBoard (workspace-scoped via server filter)
  const kanbanFetchFn = useCallback(
    async (params: Record<string, unknown>): Promise<PaginatedResponse<Plan>> => {
      const apiParams: Record<string, unknown> = {
        ...params,
        workspace_slug: wsSlug,
      }
      if (kanbanFilters.priority_min !== undefined) apiParams.priority_min = kanbanFilters.priority_min
      if (kanbanFilters.priority_max !== undefined) apiParams.priority_max = kanbanFilters.priority_max
      if (kanbanFilters.search) apiParams.search = kanbanFilters.search

      const response = await plansApi.list(apiParams as Record<string, string | number | undefined>)

      // Client-side filtering (project only — workspace is handled server-side)
      let filtered = response.items || []

      if (kanbanFilters.project !== 'all') {
        filtered = filtered.filter((p) => p.project_id === kanbanFilters.project)
      }

      // Client-side search fallback
      if (kanbanFilters.search) {
        const term = kanbanFilters.search.toLowerCase()
        filtered = filtered.filter(
          (p) =>
            p.title.toLowerCase().includes(term) ||
            (p.description && p.description.toLowerCase().includes(term)),
        )
      }

      return {
        ...response,
        items: filtered,
        total: filtered.length,
      }
    },
    [kanbanFilters, wsSlug],
  )

  // Filters key — triggers column re-fetch when any filter changes
  const kanbanColumnFilters = useMemo(() => ({ ...kanbanFilters, _ws: wsSlug }), [kanbanFilters, wsSlug])

  // Determine which statuses to hide
  const hiddenStatuses = useMemo(() => {
    const hidden: PlanStatus[] = []
    if (kanbanFilters.hide_completed) hidden.push('completed')
    if (kanbanFilters.hide_cancelled) hidden.push('cancelled')
    return hidden
  }, [kanbanFilters.hide_completed, kanbanFilters.hide_cancelled])

  const handlePlanStatusChange = useCallback(
    async (planId: string, newStatus: PlanStatus) => {
      updateItem(
        (p) => p.id === planId,
        (p) => ({ ...p, status: newStatus }),
      )
      await plansApi.updateStatus(planId, newStatus)
      toast.success('Status updated')
    },
    [updateItem, toast],
  )

  const planForm = CreatePlanForm({
    workspaceSlug: wsSlug,
    onSubmit: async (data) => {
      setFormLoading(true)
      try {
        await plansApi.create(data)
        toast.success('Plan created')
        formDialog.close()
        reset()
      } finally {
        setFormLoading(false)
      }
    },
    loading: formLoading,
  })

  const multiSelect = useMultiSelect(plans, (p) => p.id)

  const handleBulkDelete = () => {
    const count = multiSelect.selectionCount
    confirmDialog.open({
      title: `Delete ${count} plan${count > 1 ? 's' : ''}`,
      description: `This will permanently delete ${count} plan${count > 1 ? 's' : ''} and all their tasks.`,
      onConfirm: async () => {
        const items = multiSelect.selectedItems
        confirmDialog.setProgress({ current: 0, total: items.length })
        for (let i = 0; i < items.length; i++) {
          await plansApi.delete(items[i].id)
          confirmDialog.setProgress({ current: i + 1, total: items.length })
        }
        const ids = new Set(items.map((p) => p.id))
        removeItems((p) => ids.has(p.id))
        multiSelect.clear()
        toast.success(`Deleted ${count} plan${count > 1 ? 's' : ''}`)
      },
    })
  }

  const openCreatePlan = () => formDialog.open({ title: 'Create Plan', size: 'lg' })

  if (loading && viewMode === 'list' && plans.length === 0) {
    return <LoadingPage />
  }

  return (
    <PageShell
      title="Plans"
      description="Plan and track implementation phases"
      actions={
        <>
          {viewMode === 'list' && (
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as PlanStatus | 'all')}
              className="w-full sm:w-40"
            />
          )}
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button onClick={openCreatePlan}>Create Plan</Button>
        </>
      }
    >
      {/* Kanban filters */}
      {viewMode === 'kanban' && (
        <PlanKanbanFilterBar
          filters={kanbanFilters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
          activeFilterCount={activeFilterCount}
        />
      )}

      {viewMode === 'kanban' ? (
        <PlanKanbanBoard
          fetchFn={kanbanFetchFn}
          filters={kanbanColumnFilters}
          hiddenStatuses={hiddenStatuses}
          onPlanStatusChange={handlePlanStatusChange}
          onPlanClick={(planId) => navigate(`/workspace/${wsSlug}/plans/${planId}`)}
          refreshTrigger={planRefresh}
        />
      ) : plans.length === 0 ? (
        <EmptyState
          title="No plans found"
          description={
            total === 0 && statusFilter === 'all'
              ? 'Create a plan to organize your development work.'
              : 'No plans match the current filters.'
          }
          action={total === 0 && statusFilter === 'all' ? <Button onClick={openCreatePlan}>Create Plan</Button> : undefined}
        />
      ) : (
        <>
          {viewMode === 'list' && plans.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={multiSelect.toggleAll}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                {multiSelect.isAllSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
          <div className="space-y-4">
            {plans.map((plan) => (
              <PlanCard
                wsSlug={wsSlug}
                selected={multiSelect.isSelected(plan.id)}
                onToggleSelect={(shiftKey) => multiSelect.toggle(plan.id, shiftKey)}
                key={plan.id}
                plan={plan}
                onStatusChange={async (newStatus) => {
                  await plansApi.updateStatus(plan.id, newStatus)
                  updateItem(
                    (p) => p.id === plan.id,
                    (p) => ({ ...p, status: newStatus }),
                  )
                  toast.success('Status updated')
                }}
                onDelete={() =>
                  confirmDialog.open({
                    title: 'Delete Plan',
                    description: 'This plan and all its tasks will be permanently deleted.',
                    onConfirm: async () => {
                      await plansApi.delete(plan.id)
                      removeItems((p) => p.id === plan.id)
                      toast.success('Plan deleted')
                    },
                  })
                }
              />
            ))}
          </div>
          <LoadMoreSentinel sentinelRef={sentinelRef} loadingMore={loadingMore} hasMore={hasMore} />
        </>
      )}

      <BulkActionBar
        count={multiSelect.selectionCount}
        onDelete={handleBulkDelete}
        onClear={multiSelect.clear}
      />
      <FormDialog {...formDialog.dialogProps} onSubmit={planForm.submit} loading={formLoading}>
        {planForm.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

const planStatusBarColor: Record<PlanStatus, string> = {
  draft: 'bg-gray-400',
  approved: 'bg-blue-400',
  in_progress: 'bg-purple-400',
  completed: 'bg-green-400',
  cancelled: 'bg-red-400',
}

function PlanCard({
  plan,
  onStatusChange,
  onDelete,
  selected,
  onToggleSelect,
  wsSlug,
}: {
  plan: Plan
  onStatusChange: (status: PlanStatus) => Promise<void>
  onDelete: () => void
  selected?: boolean
  onToggleSelect?: (shiftKey: boolean) => void
  wsSlug: string
}) {
  return (
    <Link to={`/workspace/${wsSlug}/plans/${plan.id}`}>
      <Card className={`transition-colors ${selected ? 'border-indigo-500/40 bg-indigo-500/[0.05]' : 'hover:border-indigo-500'}`}>
        <div className="flex">
          {onToggleSelect && (
            <SelectZone selected={!!selected} onToggle={onToggleSelect} />
          )}
          <div className={`w-1 shrink-0 ${!onToggleSelect ? 'rounded-l-xl' : ''} ${planStatusBarColor[plan.status] || 'bg-gray-400'}`} />
          <div className="flex-1 min-w-0 p-3 md:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 mb-1">
                <h3 className="text-base sm:text-lg font-semibold text-gray-100 truncate min-w-0">{plan.title}</h3>
                <InteractivePlanStatusBadge status={plan.status} onStatusChange={onStatusChange} />
              </div>
              <p className="text-sm text-gray-400 line-clamp-1">{plan.description}</p>
            </div>
            <div className="flex items-center gap-3 sm:ml-4 shrink-0">
              <div className="text-right">
                <div className="text-sm text-gray-400">Priority</div>
                <div className="text-lg font-bold text-indigo-400">{plan.priority}</div>
              </div>
              <OverflowMenu
                actions={[
                  { label: 'Delete', variant: 'danger', onClick: () => onDelete() },
                ]}
              />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}

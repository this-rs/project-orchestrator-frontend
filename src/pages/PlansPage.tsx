import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Folder, FolderKanban, Pencil, Plus, Trash2 } from 'lucide-react'
import { plansAtom, plansLoadingAtom, planStatusFilterAtom, planRefreshAtom } from '@/atoms'
import { plansApi } from '@/services'
import {
  BulkActionBar,
  Button,
  ConfirmDialog,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  FilterBar,
  FormDialog,
  LoadMoreSentinel,
  PageShell,
  PriorityText,
  RelativeTime,
  Select,
  StatusMenu,
  getStatusOptions,
  hitArea,
  textLink,
} from '@/components/ui'
import {
  useViewMode,
  useConfirmDialog,
  useFormDialog,
  useToast,
  useMultiSelect,
  useInfiniteList,
  useWorkspaceSlug,
  useViewTransition,
  useProjectFilter,
} from '@/hooks'
import { CreatePlanForm, EditPlanForm } from '@/components/forms'
import type { EditPlanFormData } from '@/components/forms/EditPlanForm'
import { PlanKanbanFilterBar, RowSelect, UniversalKanban, ViewModeToggle, createPlanKanbanConfig } from '@/components/kanban'
import type { PlanKanbanFilters } from '@/components/kanban'
import type { Plan, PlanStatus, PaginatedResponse } from '@/types'
import { workspacePath } from '@/utils/paths'

const statusOptions = [{ value: 'all', label: 'All statuses' }, ...getStatusOptions('plan')]

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
  const { navigate } = useViewTransition()
  const confirmDialog = useConfirmDialog()
  const formDialog = useFormDialog()
  const editDialog = useFormDialog()
  const toast = useToast()
  const wsSlug = useWorkspaceSlug()
  const { selectedProjectId, setSelectedProjectId, projectFilterParam, projectOptions } = useProjectFilter()
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)

  // Board filters (+ the search text, shared by both views)
  const [kanbanFilters, setKanbanFilters] = useState<PlanKanbanFilters>(defaultFilters)

  const handleFilterChange = useCallback(<K extends keyof PlanKanbanFilters>(key: K, value: PlanKanbanFilters[K]) => {
    setKanbanFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  // "Clear" resets filters, not the search (FilterBar contract)
  const handleClearFilters = useCallback(() => {
    setKanbanFilters((prev) => ({ ...defaultFilters, search: prev.search }))
  }, [])

  const boardActiveCount = useMemo(() => {
    let count = 0
    if (kanbanFilters.project !== 'all') count++
    if (kanbanFilters.priority_min !== undefined) count++
    if (kanbanFilters.priority_max !== undefined) count++
    if (kanbanFilters.hide_completed) count++
    if (kanbanFilters.hide_cancelled) count++
    return count
  }, [kanbanFilters])

  // Debounced search for the list view (server-side `search` param)
  const [listSearch, setListSearch] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setListSearch(kanbanFilters.search.trim()), 300)
    return () => clearTimeout(id)
  }, [kanbanFilters.search])

  // --- Infinite scroll for list mode (workspace-scoped) ---
  const listFilters = useMemo(
    () => ({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      project_id: projectFilterParam,
      search: listSearch || undefined,
      _refresh: planRefresh,
      _ws: wsSlug, // trigger reset on workspace change
    }),
    [statusFilter, projectFilterParam, listSearch, planRefresh, wsSlug],
  )

  const listFetcher = useCallback(
    (params: { limit: number; offset: number; status?: string; project_id?: string; search?: string }): Promise<PaginatedResponse<Plan>> => {
      return plansApi.list({
        limit: params.limit,
        offset: params.offset,
        status: params.status,
        project_id: params.project_id,
        search: params.search,
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

  // Stable fetchFn for the board (workspace-scoped via server filter)
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
          (p) => p.title.toLowerCase().includes(term) || (p.description && p.description.toLowerCase().includes(term)),
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

  /** List rows: optimistic update + rollback. */
  const handlePlanStatusChange = useCallback(
    async (planId: string, newStatus: PlanStatus) => {
      const oldPlan = plans.find((p) => p.id === planId)
      updateItem(
        (p) => p.id === planId,
        (p) => ({ ...p, status: newStatus }),
      )
      try {
        await plansApi.updateStatus(planId, newStatus)
        toast.success('Status updated')
      } catch {
        if (oldPlan)
          updateItem(
            (p) => p.id === planId,
            () => oldPlan,
          )
        toast.error('Failed to update status')
      }
    },
    [plans, updateItem, toast],
  )

  /** Board: the board moves the card optimistically; rethrow so it can roll back. */
  const handleBoardStatusChange = useCallback(
    async (planId: string, newStatus: string) => {
      try {
        await plansApi.updateStatus(planId, newStatus)
        toast.success('Status updated')
      } catch (err) {
        toast.error('Failed to update status')
        throw err
      }
    },
    [toast],
  )

  const planKanbanConfig = useMemo(
    () => createPlanKanbanConfig({ fetchFn: kanbanFetchFn, onStatusChange: handleBoardStatusChange }),
    [kanbanFetchFn, handleBoardStatusChange],
  )

  const planForm = CreatePlanForm({
    workspaceSlug: wsSlug,
    onSubmit: async (data) => {
      await plansApi.create(data)
      toast.success('Plan created')
      reset()
    },
  })

  const editForm = EditPlanForm({
    initialValues: {
      title: editingPlan?.title ?? '',
      description: editingPlan?.description,
      priority: editingPlan?.priority,
      project_id: editingPlan?.project_id,
    },
    workspaceSlug: wsSlug,
    onSubmit: async (data: EditPlanFormData) => {
      if (!editingPlan) return
      const { project_id, ...updateData } = data
      await plansApi.update(editingPlan.id, updateData)
      if (project_id && project_id !== editingPlan.project_id) {
        await plansApi.linkToProject(editingPlan.id, project_id)
      } else if (!project_id && editingPlan.project_id) {
        await plansApi.unlinkFromProject(editingPlan.id)
      }
      updateItem(
        (p) => p.id === editingPlan.id,
        (p) => ({ ...p, ...updateData, project_id }),
      )
      toast.success('Plan updated')
    },
  })

  const handleEditPlan = (plan: Plan) => {
    setEditingPlan(plan)
    editDialog.open({ title: 'Edit Plan' })
  }

  const handleDeletePlan = async (plan: Plan) => {
    await plansApi.delete(plan.id)
    removeItems((p) => p.id === plan.id)
    toast.success('Plan deleted')
  }

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

  const isKanban = viewMode === 'kanban'
  const showListSkeleton = loading && !isKanban && plans.length === 0
  const viewToggle = <ViewModeToggle value={viewMode} onChange={setViewMode} />

  const projectNames = useMemo(() => new Map(projectOptions.map((o) => [o.value, o.label])), [projectOptions])

  // List filters (FilterBar)
  const listActiveCount = (projectFilterParam ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)
  const listActiveLabels = [
    projectFilterParam ? projectNames.get(selectedProjectId) ?? 'Project' : '',
    statusFilter !== 'all' ? statusOptions.find((o) => o.value === statusFilter)?.label ?? statusFilter : '',
  ]
  const isPristine = total === 0 && listActiveCount === 0 && !listSearch

  return (
    <PageShell
      title="Plans"
      description="Plan and track implementation phases"
      count={!isKanban && !loading ? total : undefined}
      width={isKanban ? 'full' : 'wide'}
      actions={
        <Button size="sm" onClick={openCreatePlan}>
          <Plus className="w-4 h-4 mr-1 -ml-0.5" aria-hidden="true" />
          New plan
        </Button>
      }
      filters={
        isKanban ? (
          <PlanKanbanFilterBar
            filters={kanbanFilters}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            activeFilterCount={boardActiveCount}
            trailing={viewToggle}
          />
        ) : (
          <FilterBar
            search={kanbanFilters.search}
            onSearchChange={(v) => handleFilterChange('search', v)}
            searchPlaceholder="Search plans…"
            activeCount={listActiveCount}
            activeLabels={listActiveLabels}
            onClear={() => {
              setSelectedProjectId('all')
              setStatusFilter('all')
            }}
            trailing={viewToggle}
            filters={
              <>
                {projectOptions.length > 1 && (
                  <Select
                    options={projectOptions}
                    value={selectedProjectId}
                    onChange={setSelectedProjectId}
                    icon={<Folder className="w-3 h-3" />}
                  />
                )}
                <Select
                  options={statusOptions}
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as PlanStatus | 'all')}
                />
              </>
            }
          />
        )
      }
    >
      {isKanban ? (
        <UniversalKanban
          config={planKanbanConfig}
          filters={kanbanColumnFilters}
          hiddenStatuses={hiddenStatuses}
          onItemClick={(planId) => navigate(`/workspace/${wsSlug}/plans/${planId}`, { type: 'card-click' })}
          refreshTrigger={planRefresh}
        />
      ) : showListSkeleton ? (
        <EntityListSkeleton rows={6} />
      ) : plans.length === 0 ? (
        <EmptyState
          variant={isPristine ? 'plans' : undefined}
          title={isPristine ? 'No plans yet' : 'No matching plans'}
          description={
            isPristine ? 'Create a plan to organize your development work.' : 'Try adjusting your search or filters.'
          }
          action={
            isPristine ? (
              <Button size="sm" onClick={openCreatePlan}>
                Create Plan
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-1 pb-1.5 min-h-9 text-[11px] text-gray-500">
            <span className="tabular-nums">
              {plans.length < total ? `${plans.length} of ${total} loaded` : `${total} plan${total === 1 ? '' : 's'}`}
            </span>
            <button type="button" onClick={multiSelect.toggleAll} className={`${hitArea} ${textLink}`}>
              {multiSelect.isAllSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          {/* No recency / status grouping here: the server orders by priority and the list is
              paginated on scroll — groups would shift as pages arrive. Status is filterable above. */}
          <EntityList aria-label="Plans">
            {plans.map((plan) => (
              <EntityRow
                key={plan.id}
                title={plan.title}
                href={workspacePath(wsSlug, `/plans/${plan.id}`)}
                viewTransitionName={`plan-title-${plan.id}`}
                selected={multiSelect.isSelected(plan.id)}
                muted={plan.status === 'completed' || plan.status === 'cancelled'}
                leading={
                  <RowSelect
                    selected={multiSelect.isSelected(plan.id)}
                    onToggle={(shiftKey) => multiSelect.toggle(plan.id, shiftKey)}
                    label={`Select ${plan.title}`}
                  />
                }
                trailing={<RelativeTime date={plan.created_at} />}
                description={plan.description}
                meta={[
                  <StatusMenu
                    key="status"
                    kind="plan"
                    status={plan.status}
                    onChange={(s) => handlePlanStatusChange(plan.id, s)}
                  />,
                  <PriorityText key="p" priority={plan.priority} />,
                  plan.project_id ? (
                    <span key="project" className="inline-flex items-center gap-1 min-w-0" title="Project">
                      <FolderKanban className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span className="truncate max-w-[12rem]">{projectNames.get(plan.project_id) ?? 'Project'}</span>
                    </span>
                  ) : null,
                  plan.created_by ? (
                    <span key="by" className="truncate max-w-[10rem]" title={`Created by ${plan.created_by}`}>
                      {plan.created_by}
                    </span>
                  ) : null,
                ]}
                actions={[
                  { label: 'Edit', icon: Pencil, onClick: () => handleEditPlan(plan) },
                  {
                    label: 'Delete',
                    icon: Trash2,
                    variant: 'danger',
                    onClick: () => handleDeletePlan(plan),
                    confirm: {
                      title: 'Delete Plan',
                      description: 'This plan and all its tasks will be permanently deleted.',
                    },
                  },
                ]}
              />
            ))}
          </EntityList>
          <LoadMoreSentinel sentinelRef={sentinelRef} loadingMore={loadingMore} hasMore={hasMore} />
        </>
      )}

      <BulkActionBar count={multiSelect.selectionCount} onDelete={handleBulkDelete} onClear={multiSelect.clear} />
      <FormDialog {...formDialog.dialogProps} onSubmit={planForm.submit}>
        {planForm.fields}
      </FormDialog>
      <FormDialog {...editDialog.dialogProps} onSubmit={editForm.submit}>
        {editForm.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

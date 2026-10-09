import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Folder, FolderKanban, Pencil, Plus, Trash2, User } from 'lucide-react'
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
  Fact,
  FilterBar,
  FormDialog,
  LoadMoreSentinel,
  PageShell,
  PriorityText,
  RelativeTime,
  Select,
  StatusMenu,
  TaskProgress,
  getStatusMeta,
  getStatusOptions,
  RowCheckbox,
  ViewToggle,
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
  useTaskProgress,
} from '@/hooks'
import { CreatePlanForm, EditPlanForm } from '@/components/forms'
import type { EditPlanFormData } from '@/components/forms/EditPlanForm'
import { PlanKanbanFilterBar, UniversalKanban, createPlanKanbanConfig } from '@/components/kanban'
import type { PlanKanbanFilters } from '@/components/kanban'
import type { Plan, PlanStatus, PaginatedResponse } from '@/types'
import { workspacePath } from '@/utils/paths'
import { useT } from '@/i18n'
import { translateOptions, useStatusLabel } from '@/components/kanban/statusLabels'

const defaultFilters: PlanKanbanFilters = {
  project: 'all',
  search: '',
  priority_min: undefined,
  priority_max: undefined,
  hide_completed: false,
  hide_cancelled: false,
}

export function PlansPage() {
  const { t } = useT()
  const statusLabel = useStatusLabel()
  const statusOptions = [{ value: 'all', label: t('plans.allStatuses') }, ...translateOptions(getStatusOptions('plan'), statusLabel)]
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
    total,
    sentinelProps,
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
        toast.success(t('tasks.toast.statusUpdated'))
      } catch {
        if (oldPlan)
          updateItem(
            (p) => p.id === planId,
            () => oldPlan,
          )
        toast.error(t('tasks.toast.statusFailed'))
      }
    },
    [plans, updateItem, toast, t],
  )

  /** Board: the board moves the card optimistically; rethrow so it can roll back. */
  const handleBoardStatusChange = useCallback(
    async (planId: string, newStatus: string) => {
      try {
        await plansApi.updateStatus(planId, newStatus)
        toast.success(t('tasks.toast.statusUpdated'))
      } catch (err) {
        toast.error(t('tasks.toast.statusFailed'))
        throw err
      }
    },
    [toast, t],
  )

  const planKanbanConfig = useMemo(
    () => createPlanKanbanConfig({ fetchFn: kanbanFetchFn, onStatusChange: handleBoardStatusChange }),
    [kanbanFetchFn, handleBoardStatusChange],
  )

  const planForm = CreatePlanForm({
    workspaceSlug: wsSlug,
    onSubmit: async (data) => {
      await plansApi.create(data)
      toast.success(t('plans.toast.created'))
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
      toast.success(t('plans.toast.updated'))
    },
  })

  const handleEditPlan = (plan: Plan) => {
    setEditingPlan(plan)
    editDialog.open({ title: t('plans.dialog.edit') })
  }

  const handleDeletePlan = async (plan: Plan) => {
    await plansApi.delete(plan.id)
    removeItems((p) => p.id === plan.id)
    toast.success(t('plans.toast.deleted'))
  }

  const multiSelect = useMultiSelect(plans, (p) => p.id)
  const planIds = useMemo(() => plans.map((p) => p.id), [plans])
  const progress = useTaskProgress('plan', planIds, planRefresh)

  const handleBulkDelete = () => {
    const count = multiSelect.selectionCount
    confirmDialog.open({
      title: t(count === 1 ? 'plans.confirm.bulkTitle.one' : 'plans.confirm.bulkTitle.other', { count }),
      description: t(count === 1 ? 'plans.confirm.bulkBody.one' : 'plans.confirm.bulkBody.other', { count }),
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
        toast.success(t(count === 1 ? 'plans.toast.deletedMany.one' : 'plans.toast.deletedMany.other', { count }))
      },
    })
  }

  const openCreatePlan = () => formDialog.open({ title: t('plans.dialog.create'), size: 'lg' })

  const isKanban = viewMode === 'kanban'
  const showListSkeleton = loading && !isKanban && plans.length === 0
  const clearFilters = () => {
    setSelectedProjectId('all')
    setStatusFilter('all')
    setListSearch('')
  }
  const viewToggle = <ViewToggle value={viewMode} onChange={setViewMode} />

  const projectNames = useMemo(() => new Map(projectOptions.map((o) => [o.value, o.label])), [projectOptions])

  // List filters (FilterBar)
  const listActiveCount = (projectFilterParam ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)
  const listActiveLabels = [
    projectFilterParam ? projectNames.get(selectedProjectId) ?? t('plans.project') : '',
    statusFilter !== 'all' ? statusOptions.find((o) => o.value === statusFilter)?.label ?? statusFilter : '',
  ]
  const isPristine = total === 0 && listActiveCount === 0 && !listSearch

  return (
    <PageShell
      title={t('nav.concepts.plans')}
      description={t('plans.description')}
      intro="plans"
      count={!isKanban && !loading ? total : undefined}
      width={isKanban ? 'full' : 'wide'}
      actions={
        <Button size="sm" onClick={openCreatePlan}>
          <Plus className="w-4 h-4 mr-1 -ml-0.5" aria-hidden="true" />
          {t('plans.newPlan')}
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
            searchPlaceholder={t('plans.searchPlaceholder')}
            activeCount={listActiveCount}
            activeLabels={listActiveLabels}
            onClear={clearFilters}
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
          size={isPristine ? 'page' : 'md'}
          variant={isPristine ? 'plans' : 'search'}
          title={isPristine ? t('plans.empty.pristineTitle') : t('plans.empty.filteredTitle')}
          description={
            isPristine ? t('plans.empty.pristineBody') : t('plans.empty.filteredBody')
          }
          action={
            isPristine ? (
              <Button size="sm" onClick={openCreatePlan}>
                {t('plans.newPlan')}
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                {t('tasks.actions.clear')}
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 pl-1 pb-1.5 min-h-9 text-[11px] text-gray-500">
            <span className="tabular-nums">
              {plans.length < total
                ? t('plans.loaded', { loaded: plans.length, total })
                : t(total === 1 ? 'plans.count.one' : 'plans.count.other', { count: total })}
            </span>
            <Button size="sm" variant="ghost" flat onClick={multiSelect.toggleAll}>
              {multiSelect.isAllSelected ? t('tasks.actions.deselectAll') : t('tasks.actions.selectAll')}
            </Button>
          </div>
          {/* No recency / status grouping here: the server orders by priority and the list is
              paginated on scroll — groups would shift as pages arrive. Status is filterable above. */}
          <EntityList aria-label={t('plans.listLabel')}>
            {plans.map((plan) => (
              <EntityRow
                key={plan.id}
                title={plan.title}
                entityRef={{ kind: 'plan', id: plan.id }}
                href={workspacePath(wsSlug, `/plans/${plan.id}`)}
                viewTransitionName={`plan-title-${plan.id}`}
                selected={multiSelect.isSelected(plan.id)}
                muted={plan.status === 'completed' || plan.status === 'cancelled'}
                leading={
                  <RowCheckbox
                    checked={multiSelect.isSelected(plan.id)}
                    onToggle={(shiftKey) => multiSelect.toggle(plan.id, shiftKey)}
                    label={t('plans.selectPlan', { title: plan.title })}
                  />
                }
                trailing={<RelativeTime date={plan.created_at} />}
                description={plan.description}
                context={<TaskProgress counts={progress[plan.id]} />}
                tone={getStatusMeta('plan', plan.status).tone}
                status={[
                  <StatusMenu
                    key="status"
                    kind="plan"
                    icon
                    status={plan.status}
                    onChange={(s) => handlePlanStatusChange(plan.id, s)}
                  />,
                  <PriorityText key="p" priority={plan.priority} />,
                ]}
                meta={[
                  plan.project_id ? (
                    <Fact key="project" icon={FolderKanban} title={t('plans.project')} truncateAt="max-w-[12rem]">
                      {projectNames.get(plan.project_id) ?? t('plans.project')}
                    </Fact>
                  ) : null,
                  plan.created_by ? (
                    <Fact key="by" icon={User} title={t('plans.createdBy', { name: plan.created_by })} truncateAt="max-w-[10rem]">
                      {plan.created_by}
                    </Fact>
                  ) : null,
                ]}
                actions={[
                  { label: t('tasks.actions.edit'), icon: Pencil, onClick: () => handleEditPlan(plan) },
                  {
                    label: t('tasks.actions.delete'),
                    icon: Trash2,
                    variant: 'danger',
                    onClick: () => handleDeletePlan(plan),
                    confirm: {
                      title: t('plans.confirm.deleteTitle'),
                      description: t('plans.confirm.deleteBody'),
                    },
                  },
                ]}
              />
            ))}
          </EntityList>
          <LoadMoreSentinel {...sentinelProps} />
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

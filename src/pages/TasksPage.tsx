import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Link } from 'react-router-dom'
import { ClipboardList, Folder, Pencil, Tag, Trash2, User } from 'lucide-react'
import { tasksAtom, tasksLoadingAtom, taskStatusFilterAtom, taskRefreshAtom } from '@/atoms'
import { tasksApi } from '@/services'
import {
  BulkActionBar,
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
  getStatusMeta,
  getStatusOptions,
  hitArea,
  inlineLink,
  rowInteractive,
  RowCheckbox,
  ViewToggle,
  Button,
} from '@/components/ui'
import {
  useKanbanFilters,
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
import { KanbanFilterBar, UniversalKanban, createTaskKanbanConfig } from '@/components/kanban'
import { RowStateLink } from '@/components/tasks/RowStateLink'
import { EditTaskForm } from '@/components/forms'
import type { EditTaskFormData } from '@/components/forms/EditTaskForm'
import type { TaskWithPlan, TaskStatus, PaginatedResponse } from '@/types'
import type { KanbanTask } from '@/components/kanban/KanbanCard'
import { workspacePath } from '@/utils/paths'
import { useT } from '@/i18n'
import { translateOptions, useStatusLabel } from '@/components/kanban/statusLabels'

export function TasksPage() {
  const { t } = useT()
  const statusLabel = useStatusLabel()
  const statusOptions = [{ value: 'all', label: t('tasks.list.allStatuses') }, ...translateOptions(getStatusOptions('task'), statusLabel)]
  const [, setTasksAtom] = useAtom(tasksAtom)
  const [, setLoadingAtom] = useAtom(tasksLoadingAtom)
  const [statusFilter, setStatusFilter] = useAtom(taskStatusFilterAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const [viewMode, setViewMode] = useViewMode()
  const { navigate } = useViewTransition()
  const confirmDialog = useConfirmDialog()
  const editDialog = useFormDialog()
  const toast = useToast()
  const [editingTask, setEditingTask] = useState<TaskWithPlan | null>(null)
  const kanbanFilters = useKanbanFilters()
  const wsSlug = useWorkspaceSlug()
  const { selectedProjectId, setSelectedProjectId, projectFilterParam, projectOptions } = useProjectFilter()

  // --- Infinite scroll for list mode (workspace-scoped) ---
  const listFilters = useMemo(
    () => ({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      project_id: projectFilterParam,
      _refresh: taskRefresh,
      _ws: wsSlug,
    }),
    [statusFilter, projectFilterParam, taskRefresh, wsSlug],
  )

  const listFetcher = useCallback(
    (params: { limit: number; offset: number; status?: string; project_id?: string }): Promise<PaginatedResponse<TaskWithPlan>> => {
      return tasksApi.list({
        limit: params.limit,
        offset: params.offset,
        status: params.status,
        project_id: params.project_id,
        workspace_slug: wsSlug,
      })
    },
    [wsSlug],
  )

  const {
    items: tasks,
    loading,
    total,
    sentinelProps,
    removeItems,
    updateItem,
  } = useInfiniteList({
    fetcher: listFetcher,
    filters: listFilters,
    enabled: viewMode === 'list',
  })

  // Sync tasks atom for other components that read it
  useEffect(() => {
    if (viewMode === 'list') {
      setTasksAtom(tasks)
      setLoadingAtom(loading)
    }
  }, [tasks, loading, viewMode, setTasksAtom, setLoadingAtom])

  // Stable fetchFn for kanban board — wraps tasksApi.list with kanban filters
  const kanbanApiParams = kanbanFilters.buildApiParams()
  const kanbanApiParamsKey = JSON.stringify(kanbanApiParams)

  const kanbanFetchFn = useCallback(
    (params: Record<string, unknown>): Promise<PaginatedResponse<KanbanTask>> => {
      const apiFilters = JSON.parse(kanbanApiParamsKey)
      return tasksApi.list({ ...apiFilters, ...params, workspace_slug: wsSlug } as Record<string, string | number | undefined>)
    },
    [kanbanApiParamsKey, wsSlug],
  )

  // Build filters object for useKanbanColumnData (exclude_completed / exclude_failed
  // are handled client-side by not fetching those columns)
  const kanbanColumnFilters = useMemo(() => {
    const f: Record<string, unknown> = {}
    const apiParams = JSON.parse(kanbanApiParamsKey)
    Object.assign(f, apiParams)
    f._ws = wsSlug
    return f
  }, [kanbanApiParamsKey, wsSlug])

  // Determine which statuses to hide based on kanban filters
  const hiddenStatuses = useMemo(() => {
    const hidden: TaskStatus[] = []
    if (kanbanFilters.filters.exclude_completed) hidden.push('completed')
    if (kanbanFilters.filters.exclude_failed) hidden.push('failed')
    return hidden
  }, [kanbanFilters.filters.exclude_completed, kanbanFilters.filters.exclude_failed])

  /** List rows: optimistic update + rollback. */
  const handleTaskStatusChange = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      const oldTask = tasks.find((t) => t.id === taskId)
      updateItem(
        (t) => t.id === taskId,
        (t) => ({ ...t, status: newStatus }),
      )
      try {
        await tasksApi.update(taskId, { status: newStatus })
        toast.success(t('tasks.toast.statusUpdated'))
      } catch {
        // Rollback optimistic update
        if (oldTask) updateItem((t) => t.id === taskId, () => oldTask)
        toast.error(t('tasks.toast.statusFailed'))
      }
    },
    [tasks, updateItem, toast, t],
  )

  /** Board: the board moves the card optimistically; rethrow so it can roll back. */
  const handleBoardStatusChange = useCallback(
    async (taskId: string, newStatus: string) => {
      try {
        await tasksApi.update(taskId, { status: newStatus as TaskStatus })
        toast.success(t('tasks.toast.statusUpdated'))
      } catch (err) {
        toast.error(t('tasks.toast.statusFailed'))
        throw err
      }
    },
    [toast, t],
  )

  const handleTaskClick = useCallback(
    (taskId: string) => {
      navigate(`/workspace/${wsSlug}/tasks/${taskId}`, { type: 'card-click' })
    },
    [navigate, wsSlug],
  )

  // UniversalKanban config for tasks
  const taskKanbanConfig = useMemo(
    () => createTaskKanbanConfig({ fetchFn: kanbanFetchFn, onStatusChange: handleBoardStatusChange }),
    [kanbanFetchFn, handleBoardStatusChange],
  )

  const editForm = EditTaskForm({
    initialValues: {
      title: editingTask?.title,
      description: editingTask?.description,
      priority: editingTask?.priority,
      estimated_complexity: editingTask?.estimated_complexity,
      tags: editingTask?.tags,
    },
    onSubmit: async (data: EditTaskFormData) => {
      if (!editingTask) return
      await tasksApi.update(editingTask.id, data)
      updateItem(
        (t) => t.id === editingTask.id,
        (t) => ({ ...t, ...data }),
      )
      toast.success(t('tasks.list.updated'))
    },
  })

  const handleEditTask = (task: TaskWithPlan) => {
    setEditingTask(task)
    editDialog.open({ title: t('tasks.list.editTitle') })
  }

  const handleDeleteTask = async (task: TaskWithPlan) => {
    await tasksApi.delete(task.id)
    removeItems((t) => t.id === task.id)
    toast.success(t('tasks.list.deleted'))
  }

  const multiSelect = useMultiSelect(tasks, (t) => t.id)

  const handleBulkDelete = () => {
    const count = multiSelect.selectionCount
    confirmDialog.open({
      title: t(count === 1 ? 'tasks.list.bulkTitle.one' : 'tasks.list.bulkTitle.other', { count }),
      description: t(count === 1 ? 'tasks.list.bulkBody.one' : 'tasks.list.bulkBody.other', { count }),
      onConfirm: async () => {
        const items = multiSelect.selectedItems
        confirmDialog.setProgress({ current: 0, total: items.length })
        for (let i = 0; i < items.length; i++) {
          await tasksApi.delete(items[i].id)
          confirmDialog.setProgress({ current: i + 1, total: items.length })
        }
        const ids = new Set(items.map((t) => t.id))
        removeItems((t) => ids.has(t.id))
        multiSelect.clear()
        toast.success(t(count === 1 ? 'tasks.list.deletedMany.one' : 'tasks.list.deletedMany.other', { count }))
      },
    })
  }

  const isKanban = viewMode === 'kanban'
  const showListSkeleton = loading && !isKanban && tasks.length === 0
  const clearFilters = () => {
    setSelectedProjectId('all')
    setStatusFilter('all')
  }
  const viewToggle = <ViewToggle value={viewMode} onChange={setViewMode} />

  // List filters (FilterBar)
  const listActiveCount = (projectFilterParam ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)
  const listActiveLabels = [
    projectFilterParam ? projectOptions.find((o) => o.value === selectedProjectId)?.label ?? t('tasks.list.project') : '',
    statusFilter !== 'all' ? statusOptions.find((o) => o.value === statusFilter)?.label ?? statusFilter : '',
  ]
  const isPristine = total === 0 && listActiveCount === 0

  return (
    <PageShell
      title={t('nav.concepts.tasks')}
      description={t('tasks.list.description')}
      intro="tasks"
      count={!isKanban && !loading ? total : undefined}
      width={isKanban ? 'full' : 'wide'}
      filters={
        isKanban ? (
          <KanbanFilterBar
            filters={kanbanFilters.filters}
            onFilterChange={kanbanFilters.setFilter}
            onToggleExcludeProject={kanbanFilters.toggleExcludeProject}
            onClearFilters={kanbanFilters.clearFilters}
            activeFilterCount={kanbanFilters.activeFilterCount}
            trailing={viewToggle}
          />
        ) : (
          <FilterBar
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
                  onChange={(value) => setStatusFilter(value as TaskStatus | 'all')}
                />
              </>
            }
          />
        )
      }
    >
      {isKanban ? (
        <UniversalKanban
          config={taskKanbanConfig}
          filters={kanbanColumnFilters}
          hiddenStatuses={hiddenStatuses}
          onItemClick={handleTaskClick}
          refreshTrigger={taskRefresh}
        />
      ) : showListSkeleton ? (
        <EntityListSkeleton rows={6} />
      ) : tasks.length === 0 ? (
        <EmptyState
          size={isPristine ? 'page' : 'md'}
          variant={isPristine ? 'tasks' : 'search'}
          title={isPristine ? t('tasks.list.emptyPristineTitle') : t('tasks.list.emptyFilteredTitle')}
          description={isPristine ? t('tasks.list.emptyPristineBody') : t('tasks.list.emptyFilteredBody')}
          action={
            isPristine ? (
              <Button size="sm" onClick={() => navigate(workspacePath(wsSlug, '/plans'))}>
                {t('tasks.list.openPlans')}
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
              {tasks.length < total
                ? t('tasks.list.loaded', { loaded: tasks.length, total })
                : t(total === 1 ? 'tasks.list.count.one' : 'tasks.list.count.other', { count: total })}
            </span>
            <Button size="sm" variant="ghost" flat onClick={multiSelect.toggleAll}>
              {multiSelect.isAllSelected ? t('tasks.actions.deselectAll') : t('tasks.actions.selectAll')}
            </Button>
          </div>
          {/* No recency / status grouping here: the server orders by priority and the list is
              paginated on scroll — groups would shift as pages arrive. Status is filterable above. */}
          <EntityList aria-label={t('tasks.list.listLabel')}>
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                wsSlug={wsSlug}
                selected={multiSelect.isSelected(task.id)}
                onToggleSelect={(shiftKey) => multiSelect.toggle(task.id, shiftKey)}
                onEdit={() => handleEditTask(task)}
                onStatusChange={(status) => handleTaskStatusChange(task.id, status)}
                onDelete={() => handleDeleteTask(task)}
              />
            ))}
          </EntityList>
          <LoadMoreSentinel {...sentinelProps} />
        </>
      )}

      <BulkActionBar count={multiSelect.selectionCount} onDelete={handleBulkDelete} onClear={multiSelect.clear} />
      <FormDialog {...editDialog.dialogProps} onSubmit={editForm.submit}>
        {editForm.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

// ── Task row ────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: TaskWithPlan
  wsSlug: string
  selected: boolean
  onToggleSelect: (shiftKey: boolean) => void
  onEdit: () => void
  onStatusChange: (status: TaskStatus) => Promise<void>
  onDelete: () => Promise<void>
}

function TaskRow({ task, wsSlug, selected, onToggleSelect, onEdit, onStatusChange, onDelete }: TaskRowProps) {
  const { t } = useT()
  const title = task.title || task.description || t('tasks.list.untitled')
  const tags = task.tags || []
  return (
    <EntityRow
      title={
        <RowStateLink
          to={workspacePath(wsSlug, `/tasks/${task.id}`)}
          state={{ planId: task.plan_id, planTitle: task.plan_title }}
        >
          {title}
        </RowStateLink>
      }
      ariaLabel={title}
      viewTransitionName={`task-title-${task.id}`}
      entityRef={{ kind: 'task', id: task.id, label: title }}
      className="hover:bg-white/[0.03] active:bg-white/[0.05]"
      selected={selected}
      muted={task.status === 'completed'}
      leading={<RowCheckbox checked={selected} onToggle={onToggleSelect} label={t('tasks.list.select', { title })} />}
      trailing={<RelativeTime date={task.updated_at ?? task.created_at} />}
      description={task.title ? task.description : undefined}
      tone={getStatusMeta('task', task.status).tone}
      status={[
        <StatusMenu key="status" kind="task" icon status={task.status} onChange={onStatusChange} />,
        <PriorityText key="p" priority={task.priority} />,
      ]}
      meta={[
        task.plan_id && task.plan_title ? (
          <Link
            key="plan"
            to={workspacePath(wsSlug, `/plans/${task.plan_id}`)}
            title={t('tasks.list.planTitle', { title: task.plan_title })}
            className={`${rowInteractive} ${hitArea} ${inlineLink} inline-flex items-center gap-1 min-w-0`}
          >
            <ClipboardList className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[14rem]">{task.plan_title}</span>
          </Link>
        ) : null,
        task.assigned_to ? (
          <Fact key="assignee" icon={User} title={t('tasks.list.assignedTo', { name: task.assigned_to })} truncateAt="max-w-[10rem]">
            @{task.assigned_to}
          </Fact>
        ) : null,
        tags.length > 0 ? (
          <Fact key="tags" icon={Tag}>
            {tags.map((tag) => `#${tag}`).join(' ')}
          </Fact>
        ) : null,
      ]}
      actions={[
        { label: t('tasks.actions.edit'), icon: Pencil, onClick: onEdit },
        {
          label: t('tasks.actions.delete'),
          icon: Trash2,
          variant: 'danger',
          onClick: onDelete,
          confirm: {
            title: t('tasks.list.deleteTitle'),
            description: t('tasks.list.deleteBody'),
          },
        },
      ]}
    />
  )
}

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Link } from 'react-router-dom'
import { ClipboardList, Folder, Pencil, Trash2 } from 'lucide-react'
import { tasksAtom, tasksLoadingAtom, taskStatusFilterAtom, taskRefreshAtom } from '@/atoms'
import { tasksApi } from '@/services'
import {
  BulkActionBar,
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
  inlineLink,
  rowInteractive,
  textLink,
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
import { KanbanFilterBar, RowSelect, UniversalKanban, ViewModeToggle, createTaskKanbanConfig } from '@/components/kanban'
import { RowStateLink } from '@/components/tasks/RowStateLink'
import { EditTaskForm } from '@/components/forms'
import type { EditTaskFormData } from '@/components/forms/EditTaskForm'
import type { TaskWithPlan, TaskStatus, PaginatedResponse } from '@/types'
import type { KanbanTask } from '@/components/kanban/KanbanCard'
import { workspacePath } from '@/utils/paths'

const statusOptions = [{ value: 'all', label: 'All statuses' }, ...getStatusOptions('task')]

export function TasksPage() {
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
    loadingMore,
    hasMore,
    total,
    sentinelRef,
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
        toast.success('Status updated')
      } catch {
        // Rollback optimistic update
        if (oldTask) updateItem((t) => t.id === taskId, () => oldTask)
        toast.error('Failed to update status')
      }
    },
    [tasks, updateItem, toast],
  )

  /** Board: the board moves the card optimistically; rethrow so it can roll back. */
  const handleBoardStatusChange = useCallback(
    async (taskId: string, newStatus: string) => {
      try {
        await tasksApi.update(taskId, { status: newStatus as TaskStatus })
        toast.success('Status updated')
      } catch (err) {
        toast.error('Failed to update status')
        throw err
      }
    },
    [toast],
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
      toast.success('Task updated')
    },
  })

  const handleEditTask = (task: TaskWithPlan) => {
    setEditingTask(task)
    editDialog.open({ title: 'Edit Task' })
  }

  const handleDeleteTask = async (task: TaskWithPlan) => {
    await tasksApi.delete(task.id)
    removeItems((t) => t.id === task.id)
    toast.success('Task deleted')
  }

  const multiSelect = useMultiSelect(tasks, (t) => t.id)

  const handleBulkDelete = () => {
    const count = multiSelect.selectionCount
    confirmDialog.open({
      title: `Delete ${count} task${count > 1 ? 's' : ''}`,
      description: `This will permanently delete ${count} task${count > 1 ? 's' : ''} and all their steps and decisions.`,
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
        toast.success(`Deleted ${count} task${count > 1 ? 's' : ''}`)
      },
    })
  }

  const isKanban = viewMode === 'kanban'
  const showListSkeleton = loading && !isKanban && tasks.length === 0
  const viewToggle = <ViewModeToggle value={viewMode} onChange={setViewMode} />

  // List filters (FilterBar)
  const listActiveCount = (projectFilterParam ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)
  const listActiveLabels = [
    projectFilterParam ? projectOptions.find((o) => o.value === selectedProjectId)?.label ?? 'Project' : '',
    statusFilter !== 'all' ? statusOptions.find((o) => o.value === statusFilter)?.label ?? statusFilter : '',
  ]
  const isPristine = total === 0 && listActiveCount === 0

  return (
    <PageShell
      title="Tasks"
      description="Manage tasks across all plans"
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
          variant={isPristine ? 'tasks' : undefined}
          title={isPristine ? 'No tasks yet' : 'No matching tasks'}
          description={isPristine ? 'Tasks will appear here when you create plans.' : 'No tasks match the current filters.'}
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-1 pb-1.5 min-h-9 text-[11px] text-gray-500">
            <span className="tabular-nums">
              {tasks.length < total ? `${tasks.length} of ${total} loaded` : `${total} task${total === 1 ? '' : 's'}`}
            </span>
            <button type="button" onClick={multiSelect.toggleAll} className={`${hitArea} ${textLink}`}>
              {multiSelect.isAllSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          {/* No recency / status grouping here: the server orders by priority and the list is
              paginated on scroll — groups would shift as pages arrive. Status is filterable above. */}
          <EntityList aria-label="Tasks">
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
          <LoadMoreSentinel sentinelRef={sentinelRef} loadingMore={loadingMore} hasMore={hasMore} />
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
  const title = task.title || task.description || 'Untitled task'
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
      className="hover:bg-white/[0.03] active:bg-white/[0.05]"
      selected={selected}
      muted={task.status === 'completed'}
      leading={<RowSelect selected={selected} onToggle={onToggleSelect} label={`Select ${title}`} />}
      trailing={<RelativeTime date={task.updated_at ?? task.created_at} />}
      description={task.title ? task.description : undefined}
      meta={[
        <StatusMenu key="status" kind="task" status={task.status} onChange={onStatusChange} />,
        <PriorityText key="p" priority={task.priority} />,
        task.plan_id && task.plan_title ? (
          <Link
            key="plan"
            to={workspacePath(wsSlug, `/plans/${task.plan_id}`)}
            title={`Plan: ${task.plan_title}`}
            className={`${rowInteractive} ${hitArea} ${inlineLink} inline-flex items-center gap-1 min-w-0`}
          >
            <ClipboardList className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[14rem]">{task.plan_title}</span>
          </Link>
        ) : null,
        task.assigned_to ? (
          <span key="assignee" className="truncate max-w-[10rem]" title={`Assigned to ${task.assigned_to}`}>
            @{task.assigned_to}
          </span>
        ) : null,
        tags.length > 0 ? (
          <span key="tags" className="break-words">
            {tags.map((t) => `#${t}`).join(' ')}
          </span>
        ) : null,
      ]}
      actions={[
        { label: 'Edit', icon: Pencil, onClick: onEdit },
        {
          label: 'Delete',
          icon: Trash2,
          variant: 'danger',
          onClick: onDelete,
          confirm: {
            title: 'Delete Task',
            description: 'This will permanently delete this task and all its steps and decisions.',
          },
        },
      ]}
    />
  )
}

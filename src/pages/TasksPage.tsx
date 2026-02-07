import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Link, useNavigate } from 'react-router-dom'
import { tasksAtom, tasksLoadingAtom, taskStatusFilterAtom, taskRefreshAtom } from '@/atoms'
import { tasksApi } from '@/services'
import {
  Card,
  LoadingPage,
  EmptyState,
  Select,
  InteractiveTaskStatusBadge,
  Badge,
  Pagination,
  ViewToggle,
  ConfirmDialog,
  OverflowMenu,
  PageShell,
  SelectZone,
  BulkActionBar,
} from '@/components/ui'
import { usePagination, useKanbanFilters, useViewMode, useConfirmDialog, useToast, useMultiSelect } from '@/hooks'
import { KanbanBoard, KanbanFilterBar } from '@/components/kanban'
import type { TaskWithPlan, TaskStatus, PaginatedResponse } from '@/types'
import type { KanbanTask } from '@/components/kanban'

const statusOptions = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
]

export function TasksPage() {
  const [tasks, setTasks] = useAtom(tasksAtom)
  const [loading, setLoading] = useAtom(tasksLoadingAtom)
  const [statusFilter, setStatusFilter] = useAtom(taskStatusFilterAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const [viewMode, setViewMode] = useViewMode()
  const [total, setTotal] = useState(0)
  const { page, pageSize, offset, setPage, paginationProps } = usePagination()
  const navigate = useNavigate()
  const confirmDialog = useConfirmDialog()
  const toast = useToast()
  const kanbanFilters = useKanbanFilters()

  // Fetch tasks for list mode (paginated)
  useEffect(() => {
    if (viewMode !== 'list') return
    async function fetchTasks() {
      // Only show loading spinner on initial load, not on WS-triggered refreshes
      const isInitialLoad = tasks.length === 0
      if (isInitialLoad) setLoading(true)
      try {
        const params: { limit: number; offset: number; status?: string } = { limit: pageSize, offset }
        if (statusFilter !== 'all') {
          params.status = statusFilter
        }
        const response = await tasksApi.list(params)
        setTasks(response.items || [])
        setTotal(response.total || 0)
      } catch (error) {
        console.error('Failed to fetch tasks:', error)
        toast.error('Failed to load tasks')
      } finally {
        if (isInitialLoad) setLoading(false)
      }
    }
    fetchTasks()
  }, [setTasks, setLoading, page, pageSize, offset, statusFilter, viewMode, taskRefresh])

  // Stable fetchFn for kanban board — wraps tasksApi.list with kanban filters
  const kanbanApiParams = kanbanFilters.buildApiParams()
  const kanbanApiParamsKey = JSON.stringify(kanbanApiParams)

  const kanbanFetchFn = useCallback(
    (params: Record<string, unknown>): Promise<PaginatedResponse<KanbanTask>> => {
      const apiFilters = JSON.parse(kanbanApiParamsKey)
      return tasksApi.list({ ...apiFilters, ...params } as Record<string, string | number | undefined>)
    },
    [kanbanApiParamsKey],
  )

  // Build filters object for useKanbanColumnData (exclude_completed / exclude_failed
  // are handled client-side by not fetching those columns)
  const kanbanColumnFilters = useMemo(() => {
    const f: Record<string, unknown> = {}
    const apiParams = JSON.parse(kanbanApiParamsKey)
    Object.assign(f, apiParams)
    return f
  }, [kanbanApiParamsKey])

  // Determine which statuses to hide based on kanban filters
  const hiddenStatuses = useMemo(() => {
    const hidden: TaskStatus[] = []
    if (kanbanFilters.filters.exclude_completed) hidden.push('completed')
    if (kanbanFilters.filters.exclude_failed) hidden.push('failed')
    return hidden
  }, [kanbanFilters.filters.exclude_completed, kanbanFilters.filters.exclude_failed])

  const handleStatusFilterChange = (newFilter: TaskStatus | 'all') => {
    setStatusFilter(newFilter)
    setPage(1)
  }

  const handleTaskStatusChange = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      // Also update list mode atom
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)))
      await tasksApi.update(taskId, { status: newStatus })
      toast.success('Status updated')
    },
    [setTasks, toast],
  )

  const handleTaskClick = useCallback(
    (taskId: string) => {
      navigate(`/tasks/${taskId}`)
    },
    [navigate],
  )

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
        setTasks((prev) => prev.filter((t) => !multiSelect.selectedIds.has(t.id)))
        setTotal((prev) => prev - items.length)
        multiSelect.clear()
        toast.success(`Deleted ${count} task${count > 1 ? 's' : ''}`)
      },
    })
  }

  if (loading && viewMode === 'list' && tasks.length === 0) {
    return <LoadingPage />
  }

  return (
    <PageShell
      title="Tasks"
      description="Manage tasks across all plans"
      actions={
        <>
          {viewMode === 'list' && (
            <Select
              options={statusOptions}
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value as TaskStatus | 'all')}
              className="w-full sm:w-40"
            />
          )}
          <ViewToggle value={viewMode} onChange={setViewMode} />
        </>
      }
    >
      {/* Kanban filter bar */}
      {viewMode === 'kanban' && (
        <KanbanFilterBar
          filters={kanbanFilters.filters}
          onFilterChange={kanbanFilters.setFilter}
          onToggleExcludeProject={kanbanFilters.toggleExcludeProject}
          onClearFilters={kanbanFilters.clearFilters}
          activeFilterCount={kanbanFilters.activeFilterCount}
        />
      )}

      {/* Content */}
      {viewMode === 'kanban' ? (
        <KanbanBoard
          fetchFn={kanbanFetchFn}
          filters={kanbanColumnFilters}
          hiddenStatuses={hiddenStatuses}
          onTaskStatusChange={handleTaskStatusChange}
          onTaskClick={handleTaskClick}
          refreshTrigger={taskRefresh}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          title="No tasks found"
          description={
            total === 0 && statusFilter === 'all'
              ? 'Tasks will appear here when you create plans.'
              : 'No tasks match the current filters.'
          }
        />
      ) : (
        <>
          {viewMode === 'list' && tasks.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={multiSelect.toggleAll}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                {multiSelect.isAllSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
          <div className="space-y-3">
            {tasks.map((task) => (
              <TaskCard
                selected={multiSelect.isSelected(task.id)}
                onToggleSelect={(shiftKey) => multiSelect.toggle(task.id, shiftKey)}
                key={task.id}
                task={task}
                onStatusChange={async (newStatus) => {
                  await tasksApi.update(task.id, { status: newStatus })
                  setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)))
                  toast.success('Status updated')
                }}
                onDelete={() =>
                  confirmDialog.open({
                    title: 'Delete Task',
                    description: 'This will permanently delete this task and all its steps and decisions.',
                    onConfirm: async () => {
                      await tasksApi.delete(task.id)
                      setTasks((prev) => prev.filter((t) => t.id !== task.id))
                      toast.success('Task deleted')
                    },
                  })
                }
              />
            ))}
          </div>
          <div className="mt-6">
            <Pagination {...paginationProps(total)} />
          </div>
        </>
      )}

      <BulkActionBar
        count={multiSelect.selectionCount}
        onDelete={handleBulkDelete}
        onClear={multiSelect.clear}
      />
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

const taskStatusBarColor: Record<TaskStatus, string> = {
  pending: 'bg-gray-400',
  in_progress: 'bg-blue-400',
  blocked: 'bg-yellow-400',
  completed: 'bg-green-400',
  failed: 'bg-red-400',
}

function TaskCard({
  task,
  onStatusChange,
  onDelete,
  selected,
  onToggleSelect,
}: {
  task: TaskWithPlan
  onStatusChange: (status: TaskStatus) => Promise<void>
  onDelete: () => void
  selected?: boolean
  onToggleSelect?: (shiftKey: boolean) => void
}) {
  const tags = task.tags || []
  return (
    <Link to={`/tasks/${task.id}`}>
      <Card className={`transition-colors ${selected ? 'border-indigo-500/40 bg-indigo-500/[0.05]' : 'hover:border-indigo-500'}`}>
        <div className="flex">
          {onToggleSelect && (
            <SelectZone selected={!!selected} onToggle={onToggleSelect} />
          )}
          <div className={`w-1 shrink-0 ${!onToggleSelect ? 'rounded-l-xl' : ''} ${taskStatusBarColor[task.status] || 'bg-gray-400'}`} />
          <div className="flex-1 p-3 md:p-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-100 truncate min-w-0">
                    {task.title || (task.description || '').slice(0, 60)}
                  </h3>
                  <InteractiveTaskStatusBadge status={task.status} onStatusChange={onStatusChange} />
                </div>
                <p className="text-sm text-gray-400 line-clamp-2 mb-2">{task.description}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                  <span className="truncate max-w-[200px]">Plan: {task.plan_title}</span>
                  {task.assigned_to && <span className="truncate">Assigned: {task.assigned_to}</span>}
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tags.map((tag, index) => (
                      <Badge key={`${tag}-${index}`} variant="default">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 sm:ml-4 shrink-0">
                {task.priority !== undefined && (
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Priority</div>
                    <div className="text-lg font-bold text-indigo-400">{task.priority}</div>
                  </div>
                )}
                <OverflowMenu
                  actions={[
                    { label: 'Delete', variant: 'danger', onClick: () => onDelete() },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}

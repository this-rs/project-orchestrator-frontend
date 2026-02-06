import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAtom } from 'jotai'
import { Link, useNavigate } from 'react-router-dom'
import { tasksAtom, tasksLoadingAtom, taskStatusFilterAtom } from '@/atoms'
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
} from '@/components/ui'
import { usePagination, useKanbanFilters, useViewMode, useConfirmDialog, useToast } from '@/hooks'
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
      setLoading(true)
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
        setLoading(false)
      }
    }
    fetchTasks()
  }, [setTasks, setLoading, page, pageSize, offset, statusFilter, viewMode])

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
              className="w-40"
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
          <div className="space-y-3">
            {tasks.map((task) => (
              <TaskCard
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
}: {
  task: TaskWithPlan
  onStatusChange: (status: TaskStatus) => Promise<void>
  onDelete: () => void
}) {
  const tags = task.tags || []
  return (
    <Link to={`/tasks/${task.id}`}>
      <Card className="hover:border-indigo-500 transition-colors">
        <div className="flex">
          <div className={`w-1 shrink-0 rounded-l-xl ${taskStatusBarColor[task.status] || 'bg-gray-400'}`} />
          <div className="flex-1 p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-100 truncate">
                    {task.title || (task.description || '').slice(0, 60)}
                  </h3>
                  <InteractiveTaskStatusBadge status={task.status} onStatusChange={onStatusChange} />
                </div>
                <p className="text-sm text-gray-400 line-clamp-2 mb-2">{task.description}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Plan: {task.plan_title}</span>
                  {task.assigned_to && <span>Assigned: {task.assigned_to}</span>}
                </div>
                {tags.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {tags.map((tag, index) => (
                      <Badge key={`${tag}-${index}`} variant="default">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4 shrink-0">
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

import { atom } from 'jotai'
import type { TaskWithPlan, TaskDetails, TaskStatus } from '@/types'

export const tasksAtom = atom<TaskWithPlan[]>([])

export const tasksLoadingAtom = atom<boolean>(false)

export const selectedTaskIdAtom = atom<string | null>(null)

export const selectedTaskAtom = atom<TaskWithPlan | null>((get) => {
  const id = get(selectedTaskIdAtom)
  const tasks = get(tasksAtom)
  return tasks.find((t) => t.id === id) ?? null
})

export const taskDetailsAtom = atom<TaskDetails | null>(null)

// Filters
export const taskStatusFilterAtom = atom<TaskStatus | 'all'>('all')

export const taskTagsFilterAtom = atom<string[]>([])

export const taskAssigneeFilterAtom = atom<string | null>(null)

export const filteredTasksAtom = atom<TaskWithPlan[]>((get) => {
  const tasks = get(tasksAtom)
  const statusFilter = get(taskStatusFilterAtom)
  const tagsFilter = get(taskTagsFilterAtom)
  const assigneeFilter = get(taskAssigneeFilterAtom)

  return tasks.filter((task) => {
    if (statusFilter !== 'all' && task.status !== statusFilter) return false
    if (tagsFilter.length > 0 && !tagsFilter.some((tag) => task.tags?.includes(tag)))
      return false
    if (assigneeFilter && task.assigned_to !== assigneeFilter) return false
    return true
  })
})

// Stats
export const taskStatsAtom = atom((get) => {
  const tasks = get(tasksAtom)
  return {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
  }
})

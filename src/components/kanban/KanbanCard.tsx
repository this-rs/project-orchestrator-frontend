import type { ReactNode } from 'react'
import type { Translator } from '@/i18n/translate'
import type { Task, TaskStatus } from '@/types'
import { PriorityText, StatusMenu } from '@/components/ui'
import { BoardCard, BoardCardOverlay } from './BoardCard'
import { useT } from '@/i18n'

/** KanbanTask is the minimal type the card needs — works with both Task and TaskWithPlan */
export type KanbanTask = Task & { plan_title?: string; plan_id?: string }

function taskTitle(task: KanbanTask, t: Translator['t']) {
  return task.title || (task.description || '').slice(0, 80) || t('kanban.card.untitledTask')
}

function taskMeta(task: KanbanTask, t: Translator['t'], status?: ReactNode): ReactNode[] {
  const tags = task.tags || []
  return [
    status,
    <PriorityText key="p" priority={task.priority} />,
    task.plan_title ? (
      <span key="plan" className="truncate max-w-[12rem]" title={t('kanban.card.planTitle', { title: task.plan_title })}>
        {task.plan_title}
      </span>
    ) : null,
    task.assigned_to ? <span key="a" className="truncate max-w-[8rem]" title={t('kanban.card.assignedTitle', { name: task.assigned_to })}>@{task.assigned_to}</span> : null,
    tags.length > 0 ? (
      <span key="tags" className="truncate max-w-[12rem]" title={tags.map((tag) => `#${tag}`).join(' ')}>
        {tags.slice(0, 2).map((tag) => `#${tag}`).join(' ')}
        {tags.length > 2 ? ` +${tags.length - 2}` : ''}
      </span>
    ) : null,
  ]
}

interface KanbanCardProps {
  task: KanbanTask
  onStatusChange?: (status: TaskStatus) => Promise<void>
}

export function KanbanCard({ task, onStatusChange }: KanbanCardProps) {
  const { t } = useT()
  const title = taskTitle(task, t)
  return (
    <BoardCard
      id={task.id}
      entityRef={{ kind: 'task', id: task.id, label: title }}
      dataKey="task"
      item={task}
      ariaLabel={title}
      title={title}
      meta={taskMeta(
        task,
        t,
        onStatusChange ? <StatusMenu key="s" kind="task" status={task.status} onChange={onStatusChange} /> : null,
      )}
    />
  )
}

/** Card rendered in the DragOverlay (no drag listeners) */
export function KanbanCardOverlay({ task }: { task: KanbanTask }) {
  const { t } = useT()
  return <BoardCardOverlay title={taskTitle(task, t)} meta={taskMeta(task, t)} />
}

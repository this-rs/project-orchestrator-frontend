/**
 * TodoWriteRenderer — visual checklist for TodoWrite tool calls.
 *
 * Instead of showing raw JSON, renders the todo list as a styled checklist
 * with status indicators, progress bar, and the active task highlighted.
 */

import type { ToolRendererProps } from './types'

interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string
}

const STATUS_CONFIG = {
  completed: {
    icon: '✓',
    iconClass: 'text-emerald-400',
    textClass: 'text-gray-500 line-through',
    bgClass: '',
    dotClass: 'bg-emerald-400',
  },
  in_progress: {
    icon: '▸',
    iconClass: 'text-amber-400',
    textClass: 'text-gray-200 font-medium',
    bgClass: 'bg-amber-400/[0.06]',
    dotClass: 'bg-amber-400 animate-pulse',
  },
  pending: {
    icon: '○',
    iconClass: 'text-gray-600',
    textClass: 'text-gray-500',
    bgClass: '',
    dotClass: 'bg-gray-600',
  },
} as const

export function TodoWriteRenderer({ toolInput }: ToolRendererProps) {
  const todos = (toolInput.todos as TodoItem[]) ?? []

  if (todos.length === 0) {
    return (
      <div className="text-xs text-gray-600 italic py-1">No tasks</div>
    )
  }

  const completed = todos.filter((t) => t.status === 'completed').length
  const total = todos.length
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0
  const activeTask = todos.find((t) => t.status === 'in_progress')

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-400/80 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-gray-500 shrink-0">
          {completed}/{total}
        </span>
      </div>

      {/* Task list */}
      <ul className="space-y-0.5">
        {todos.map((todo, i) => {
          const cfg = STATUS_CONFIG[todo.status] ?? STATUS_CONFIG.pending
          return (
            <li
              key={i}
              className={`flex items-start gap-2 px-2 py-1 rounded text-xs ${cfg.bgClass}`}
            >
              <span className={`shrink-0 w-3.5 text-center font-mono ${cfg.iconClass}`}>
                {cfg.icon}
              </span>
              <span className={cfg.textClass}>
                {todo.status === 'in_progress' ? todo.activeForm : todo.content}
              </span>
            </li>
          )
        })}
      </ul>

      {/* Active task highlight */}
      {activeTask && (
        <div className="flex items-center gap-1.5 px-2 pt-1 border-t border-white/[0.04]">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span className="text-[10px] text-amber-400/80 truncate">
            {activeTask.activeForm}
          </span>
        </div>
      )}
    </div>
  )
}

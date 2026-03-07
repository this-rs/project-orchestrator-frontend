/**
 * ProgressBarViz — Plan/task completion visualization.
 *
 * Shows a segmented progress bar colored by task status,
 * with an optional task list below.
 *
 * Data schema (from backend build_progress_viz):
 * {
 *   plan_title: string,
 *   plan_id: string,
 *   total: number,
 *   completed: number,
 *   in_progress: number,
 *   pending: number,
 *   blocked: number,
 *   failed: number,
 *   percentage: number,
 *   tasks: [{ title: string, status: string, priority: number }]
 * }
 */
import { useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, Clock, Circle, AlertTriangle, XCircle, Loader2 } from 'lucide-react'
import type { VizBlockProps } from './registry'

// ============================================================================
// Status styling
// ============================================================================

interface TaskEntry {
  title: string
  status: string
  priority?: number
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  completed: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500', label: 'Completed' },
  in_progress: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500', label: 'In Progress' },
  pending: { icon: Circle, color: 'text-gray-500', bg: 'bg-gray-600', label: 'Pending' },
  blocked: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500', label: 'Blocked' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500', label: 'Failed' },
}

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-600', label: status }
}

// ============================================================================
// Main component
// ============================================================================

export function ProgressBarViz({ data, expanded = false }: VizBlockProps) {
  const [showTasks, setShowTasks] = useState(expanded)

  const planTitle = (data.plan_title as string) ?? 'Plan'
  const total = (data.total as number) ?? 0
  const completed = (data.completed as number) ?? 0
  const inProgress = (data.in_progress as number) ?? 0
  const pending = (data.pending as number) ?? 0
  const blocked = (data.blocked as number) ?? 0
  const failed = (data.failed as number) ?? 0
  const percentage = (data.percentage as number) ?? 0
  const tasks = (data.tasks as TaskEntry[]) ?? []

  // Segments for the stacked bar
  const segments = [
    { count: completed, color: 'bg-emerald-500', label: 'Completed' },
    { count: inProgress, color: 'bg-blue-500', label: 'In Progress' },
    { count: blocked, color: 'bg-yellow-500', label: 'Blocked' },
    { count: failed, color: 'bg-red-500', label: 'Failed' },
    { count: pending, color: 'bg-gray-600', label: 'Pending' },
  ].filter((s) => s.count > 0)

  return (
    <div className="space-y-2">
      {/* Title + percentage */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-300 truncate">{planTitle}</span>
        <span className="text-xs font-mono text-gray-400 shrink-0 ml-2">
          {percentage.toFixed(0)}% ({completed}/{total})
        </span>
      </div>

      {/* Segmented progress bar */}
      <div className="w-full h-2.5 bg-white/[0.06] rounded-full overflow-hidden flex">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`h-full ${seg.color} first:rounded-l-full last:rounded-r-full transition-all duration-500`}
            style={{ width: total > 0 ? `${(seg.count / total) * 100}%` : '0%' }}
            title={`${seg.label}: ${seg.count}`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-gray-500">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${seg.color}`} />
            <span>{seg.label} ({seg.count})</span>
          </div>
        ))}
      </div>

      {/* Task list toggle */}
      {tasks.length > 0 && (
        <div>
          <button
            onClick={() => setShowTasks((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            {showTasks ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <span>{showTasks ? 'Hide' : 'Show'} tasks</span>
          </button>

          {showTasks && (
            <div className="mt-1.5 space-y-0.5">
              {tasks.map((task, i) => {
                const cfg = getStatusConfig(task.status)
                const Icon = cfg.icon
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-white/[0.03] transition-colors"
                  >
                    <Icon className={`w-3 h-3 shrink-0 ${cfg.color} ${task.status === 'in_progress' ? 'animate-spin' : ''}`} />
                    <span className="text-gray-300 truncate flex-1">{task.title}</span>
                    {task.priority != null && (
                      <span className="text-[10px] text-gray-600 font-mono shrink-0">P{task.priority}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

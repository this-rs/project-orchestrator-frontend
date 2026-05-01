/**
 * Toolbar indicator surfacing the background subprocesses currently
 * tracked for the active chat session — Monitor + Bash run_in_background.
 *
 * Plan 5985a7c4 (F3). Sits in the chat toolbar (`ChatInput.tsx`,
 * integration in F4) between the Mode/Model pills on the left and the
 * Auto-continue toggle on the right.
 *
 * ## Visibility
 *
 * Returns `null` when no tasks are tracked — the toolbar stays uncluttered
 * by default, the indicator only materialises when there's actual
 * background activity to surface (constraint of plan 5985a7c4).
 *
 * ## Interaction
 *
 * Single trigger button summarising the counts ("👀 N • ⚙ M"). Click
 * opens a native popover (`popover="auto"`, anchored via CSS
 * `positionAnchor` — same pattern as `src/components/ui/Dropdown.tsx`)
 * listing every tracked task with description, live duration, and a
 * per-task Stop button. The Stop button calls `cancelTask` from
 * `useBackgroundTasks`; on success the entry transitions to
 * "stopping…" via the backend's grace period (5s) before disappearing
 * from the next `active_tasks_update` (cf backend plan 754a1379, T12).
 *
 * ## Why a single combined trigger (not per-kind pills)
 *
 * The audit spec sketched per-kind pills (Monitor pill + Bash pill).
 * In practice that adds visual noise without UX value — the popover
 * is the source of truth for details. A single button keeps the
 * toolbar compact and dovetails with the existing Mode/Model pill
 * styling. We can split later if heuristics prove otherwise.
 */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Eye, Square, Terminal, AlertTriangle, Loader2 } from 'lucide-react'
import { useBackgroundTasks } from '@/hooks/useBackgroundTasks'
import type { BackgroundTaskInfo, BackgroundTaskKind } from '@/types'
import { useElapsedMs, formatDurationShort } from './useElapsedMs'

const KIND_ICONS: Record<BackgroundTaskKind, typeof Eye> = {
  monitor: Eye,
  bash_background: Terminal,
}

const KIND_LABELS: Record<BackgroundTaskKind, { singular: string; plural: string }> = {
  monitor: { singular: 'Monitor', plural: 'Monitors' },
  bash_background: { singular: 'Bash', plural: 'Bash' },
}

interface TaskRowProps {
  task: BackgroundTaskInfo
  cancelling: boolean
  onStop: () => void
}

function TaskRow({ task, cancelling, onStop }: TaskRowProps) {
  const Icon = KIND_ICONS[task.kind]
  // The duration tracker only "lives" while the entry is alive (no
  // pending-removal-at exposed on the wire). Backend strips that
  // field; the frontend treats every entry it sees as live.
  const elapsedMs = useElapsedMs(task.started_at, true)
  const elapsed = elapsedMs != null ? formatDurationShort(elapsedMs) : '—'

  return (
    <div
      className={
        'px-3 py-2 flex items-start gap-2 transition-colors ' +
        (cancelling
          ? 'bg-amber-500/[0.04] opacity-70'
          : 'hover:bg-white/[0.04]')
      }
    >
      <Icon
        size={14}
        className={
          'mt-0.5 shrink-0 ' +
          (cancelling ? 'text-amber-400/70' : 'text-emerald-400/80')
        }
      />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-gray-200 truncate" title={task.description}>
          {task.description || '(no description)'}
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">
          {KIND_LABELS[task.kind].singular} • {elapsed}
          {cancelling && (
            <span className="ml-1.5 text-amber-300/80">• stopping…</span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!cancelling) onStop()
        }}
        disabled={cancelling}
        title={cancelling ? 'Stopping…' : 'Stop this task'}
        aria-label={`Stop ${task.description}`}
        className={
          'shrink-0 inline-flex items-center justify-center w-6 h-6 rounded ' +
          'text-gray-300 hover:bg-white/[0.08] hover:text-red-300 ' +
          'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
        }
      >
        {cancelling ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
      </button>
    </div>
  )
}

export function BackgroundTasksIndicator() {
  const { tasks, cancelTask } = useBackgroundTasks()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()
  const anchorName = `--bg-tasks-anchor-${popoverId.replace(/[:.]/g, '-')}`
  // `cancellingIds` is sticky: once the user clicks Stop, the row
  // shows "stopping…" until the entry actually leaves the snapshot
  // (which happens after the backend's 5s grace period — see plan
  // 754a1379 T12). Without sticky state, the spinner would flash for
  // the network round-trip (~50ms) and the user would think the
  // click did nothing during the grace window.
  const [cancellingIds, setCancellingIds] = useState<ReadonlySet<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  // Drop ids from `cancellingIds` once the entry actually disappears
  // from the snapshot — that's our cue that the backend's grace
  // period elapsed and the entry was purged. Avoids a stale "stopping"
  // state if a different entry replaces it later.
  useEffect(() => {
    setCancellingIds((prev) => {
      if (prev.size === 0) return prev
      const ids = new Set(tasks.map((t) => t.id))
      let changed = false
      const next = new Set(prev)
      for (const id of prev) {
        if (!ids.has(id)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [tasks])

  // Visibility constraint: the toolbar stays clean when nothing is
  // running. As soon as a Monitor / Bash bg appears in the snapshot,
  // the indicator materialises.
  if (tasks.length === 0) {
    return null
  }

  const counts = tasks.reduce<Record<BackgroundTaskKind, number>>(
    (acc, t) => {
      acc[t.kind] = (acc[t.kind] ?? 0) + 1
      return acc
    },
    { monitor: 0, bash_background: 0 },
  )

  const handleStop = async (taskId: string) => {
    setError(null)
    // Optimistic: immediately mark as cancelling so the row shows
    // "stopping…" without waiting for the network or the backend's
    // grace period. The flag clears when the entry leaves the
    // snapshot (see the useEffect above).
    setCancellingIds((prev) => {
      if (prev.has(taskId)) return prev
      const next = new Set(prev)
      next.add(taskId)
      return next
    })
    try {
      const result = await cancelTask(taskId)
      if (result.capped) {
        // Cap hit — the click was refused, so we should NOT keep the
        // "stopping…" indicator. Drop the id back out and surface the
        // toast.
        setCancellingIds((prev) => {
          const next = new Set(prev)
          next.delete(taskId)
          return next
        })
        setError('Cancelling too fast — try again in a moment.')
      }
    } catch {
      // Network / backend error — same: drop the id and surface the
      // error.
      setCancellingIds((prev) => {
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
      setError('Failed to cancel task — try the global Stop instead.')
    }
    // No `finally` reset: on success, the id stays in `cancellingIds`
    // until the entry disappears from `tasks` (driven by the useEffect
    // above), giving the user continuous "stopping…" feedback during
    // the backend's grace period.
  }

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        // @ts-expect-error — `popoverTarget` is a valid HTML attribute
        // for the native popover API but React's typings haven't
        // caught up yet.
        popovertarget={popoverId}
        title="Background tasks running on this session"
        aria-label={`${tasks.length} background task${tasks.length > 1 ? 's' : ''} running`}
        className={
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ' +
          'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 ' +
          'border border-emerald-500/20 transition-colors cursor-pointer'
        }
        style={{ anchorName } as CSSProperties}
      >
        {counts.monitor > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <Eye size={11} aria-hidden />
            <span>
              {counts.monitor}
              <span className="sr-only"> {KIND_LABELS.monitor[counts.monitor === 1 ? 'singular' : 'plural']}</span>
            </span>
          </span>
        )}
        {counts.monitor > 0 && counts.bash_background > 0 && (
          <span className="text-emerald-400/40" aria-hidden>
            •
          </span>
        )}
        {counts.bash_background > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <Terminal size={11} aria-hidden />
            <span>
              {counts.bash_background}
              <span className="sr-only"> {KIND_LABELS.bash_background.plural}</span>
            </span>
          </span>
        )}
      </button>

      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        role="dialog"
        aria-label="Background tasks running on this session"
        className="popover-dropdown glass-heavy rounded-lg shadow-md py-1 min-w-[280px] max-w-[420px]"
        style={{ positionAnchor: anchorName } as CSSProperties}
      >
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            cancelling={cancellingIds.has(task.id)}
            onStop={() => void handleStop(task.id)}
          />
        ))}
        {error && (
          <div className="px-3 py-2 flex items-start gap-2 border-t border-white/10 text-[11px] text-amber-300">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

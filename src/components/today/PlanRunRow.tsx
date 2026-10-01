import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { StatusDot } from '@/components/ui/Status'
import { focusRing, metaTextReadable as metaText, pressFeedback } from '@/components/ui/classes'
import { formatCost, formatDurationMs } from '@/components/ui/format'
import type { AttentionThread, WaveSummaryDto } from '@/types/attention'
import { workspacePath } from '@/utils/paths'
import { MiniThreadGraph } from './MiniThreadGraph'

/**
 * One row of "En cours": ONE PLAN. Rows, not cards (a `ThreadRowList` draws the
 * dividers): no surface, border or shadow.
 *
 * - title (opens the plan graph), the workspace as a plain label;
 * - a progress bar "faites / total" taken from the thread's wave summary
 *   (`waves[].points[].status`) — counted, never estimated;
 * - what advances NOW: an active agent, or "toi" when a task waits on the user;
 * - duration and cost, updated IN PLACE (plain text nodes, no tween);
 * - the plan's MiniThreadGraph;
 * - a "Discussions" button that exists only when the parent provides
 *   `renderDiscussions` (the discussion tree is assembled later, it is not built here).
 */

export const DISCUSSIONS_TEXT = {
  show: 'Voir les discussions',
  hide: 'Masquer les discussions',
} as const

export interface PlanProgress {
  done: number
  total: number
}

/** Done / total tasks over every wave of the thread. */
export function planProgress(waves: WaveSummaryDto[]): PlanProgress {
  let done = 0
  let total = 0
  for (const w of waves) {
    for (const p of w.points) {
      total += 1
      if (p.status === 'done') done += 1
    }
  }
  return { done, total }
}

export interface NowWorking {
  who: 'you' | 'agent' | 'nobody'
  text: string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Who moves the plan forward right now, from what the thread says:
 * a task waiting on the user => "toi"; else live sessions or running tasks => an
 * active agent; else nobody (the run is stopped).
 */
export function nowWorking(thread: AttentionThread): NowWorking {
  const points = thread.waves.flatMap((w) => w.points)
  const waiting = points.filter((p) => p.status === 'waiting').length
  if (waiting > 0) {
    return { who: 'you', text: `Toi : ${plural(waiting, 'tâche attend', 'tâches attendent')} ta réponse` }
  }
  const live = thread.sessions.filter((s) => s.state === 'live').length
  const running = points.filter((p) => p.status === 'running').length
  if (live > 0) return { who: 'agent', text: `Agent actif : ${plural(live, 'session vivante', 'sessions vivantes')}` }
  if (running > 0 || thread.run?.status === 'running') {
    return { who: 'agent', text: `Agent actif : ${plural(running, 'tâche en cours', 'tâches en cours')}` }
  }
  return { who: 'nobody', text: 'Personne pour le moment' }
}

export interface PlanRunRowProps {
  thread: AttentionThread
  /** Other threads of the same plan, only mentioned. */
  others?: number
  /** Display name of the workspace; falls back to its slug. */
  laneName?: string
  /** Slot for the thread's discussions; the "Discussions" button exists only when provided AND the thread has a plan. */
  renderDiscussions?: (thread: AttentionThread) => ReactNode
  className?: string
}

export function PlanRunRow({ thread, others = 0, laneName, renderDiscussions, className = '' }: PlanRunRowProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const run = thread.run
  const running = run?.status === 'running'
  const { done, total } = planProgress(thread.waves)
  const now = nowWorking(thread)
  const label = thread.plan?.title ?? thread.title

  const title = <span className="min-w-0 break-words text-sm text-gray-200">{label}</span>

  return (
    <li data-variant="running" data-thread={thread.id} className={`flex min-w-0 flex-col gap-1 py-3 ${className}`}>
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-[15px] flex w-4 shrink-0 items-center justify-center">
          <StatusDot tone="progress" pulse={running} size="md" label={running ? 'En cours' : 'Arrêté'} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          {thread.plan ? (
            <Link
              to={`${workspacePath(thread.workspace, `/plans/${thread.plan.id}`)}#graph`}
              className={`inline-flex min-h-9 min-w-0 items-center rounded ${focusRing} hover:text-gray-100`}
            >
              {title}
            </Link>
          ) : (
            <span className="inline-flex min-h-9 min-w-0 items-center">{title}</span>
          )}
          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${metaText}`}>
            <span data-testid="lane-label">{laneName ?? thread.workspace}</span>
            {run && (
              <>
                <span data-testid="run-duration" className="tabular-nums">
                  {formatDurationMs(run.duration_secs * 1000)}
                </span>
                <span data-testid="run-cost" className="tabular-nums">
                  {formatCost(run.cost_usd) ?? '$0.00'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0 pl-6">
        {total > 0 && (
          <div className="flex items-center gap-3">
            <div
              role="progressbar"
              aria-label="Avancement"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
              aria-valuetext={`${done} sur ${total} faites`}
              className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.08]"
            >
              <div data-testid="progress-fill" className="h-full bg-emerald-500/70" style={{ width: `${(done / total) * 100}%` }} />
            </div>
            <span data-testid="progress-text" className="shrink-0 text-xs tabular-nums text-gray-300">
              {done}/{total} faites
            </span>
          </div>
        )}
        <p data-testid="now-working" data-who={now.who} className={`mt-1 text-xs ${now.who === 'you' ? 'text-sky-300' : 'text-gray-300'}`}>
          {now.text}
        </p>
        <MiniThreadGraph waves={thread.waves} planId={thread.plan?.id} workspace={thread.workspace} />
        {others > 0 && (
          <p className={`mt-1 ${metaText}`}>
            {others === 1 ? '+ 1 autre fil du même plan' : `+ ${others} autres fils du même plan`}
          </p>
        )}
        {renderDiscussions && thread.plan && (
          <div className="mt-1">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((o) => !o)}
              className={`${pressFeedback} inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm text-gray-100 ${focusRing} ${
                open ? 'border-indigo-400/60 bg-indigo-500/15' : 'border-white/[0.12] bg-white/[0.06] hover:bg-white/[0.1]'
              }`}
            >
              <ChevronRight className={`h-4 w-4 shrink-0 ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
              {open ? DISCUSSIONS_TEXT.hide : DISCUSSIONS_TEXT.show}
            </button>
            <div id={panelId} hidden={!open} className="min-w-0">
              {open && renderDiscussions(thread)}
            </div>
          </div>
        )}
      </div>
    </li>
  )
}

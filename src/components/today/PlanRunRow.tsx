import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { StatusDot } from '@/components/ui/Status'
import { focusRing, hitArea, metaTextReadable as metaText } from '@/components/ui/classes'
import { formatDurationMs } from '@/components/ui/format'
import { CostDisplay } from '@/components/ui/CostDisplay'
import { costReport, formatUsd2 } from '@/utils/cost'
import type { AttentionThread, WaveSummaryDto } from '@/types/attention'
import { workspacePath } from '@/utils/paths'
import { PlanStateBar, countPlanStates, stateSegments } from './PlanStateBar'
import { Ring } from './charts'

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
  show: 'Conversations',
  hide: 'Masquer les conversations',
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
    return { who: 'you', text: `${plural(waiting, 'tâche attend', 'tâches attendent')} ta réponse` }
  }
  const live = thread.sessions.filter((s) => s.state === 'live').length
  const running = points.filter((p) => p.status === 'running').length
  if (live > 0) return { who: 'agent', text: `${plural(live, 'assistant y travaille', 'assistants y travaillent')}` }
  if (running > 0 || thread.run?.status === 'running') {
    return { who: 'agent', text: `${plural(running, 'tâche en cours', 'tâches en cours')}` }
  }
  return { who: 'nobody', text: 'Personne pour le moment' }
}

export interface PlanRunRowProps {
  thread: AttentionThread
  /** Other threads of the same plan: a mention that unfolds their list (state + discussions). */
  others?: AttentionThread[]
  /** Display name of the workspace; falls back to its slug. */
  laneName?: string
  /** Slot for the thread's discussions; the "Discussions" button exists only when provided AND the thread has a plan. */
  renderDiscussions?: (thread: AttentionThread) => ReactNode
  className?: string
}

export function PlanRunRow({ thread, others = [], laneName, renderDiscussions, className = '' }: PlanRunRowProps) {
  const run = thread.run
  const running = run?.status === 'running'
  const now = nowWorking(thread)
  const states = countPlanStates(thread.waves)
  const label = thread.plan?.title ?? thread.title

  const title = <span className="min-w-0 break-words text-sm font-medium leading-5 text-gray-100 line-clamp-2">{label}</span>

  return (
    <li data-variant="running" data-thread={thread.id} className={`flex min-w-0 flex-col py-3 ${className}`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <Ring size={40} stroke={4} total={states.total || 1} segments={stateSegments(states)} className="mt-0.5">
          <StatusDot tone="progress" pulse={running} size="md" label={running ? 'En cours' : 'Arrêté'} />
        </Ring>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-3">
            {thread.plan ? (
              <Link
                to={`${workspacePath(thread.workspace, `/plans/${thread.plan.id}`)}#graph`}
                className={`min-w-0 flex-1 rounded ${hitArea} ${focusRing} hover:text-white`}
              >
                {title}
              </Link>
            ) : (
              <span className="min-w-0 flex-1">{title}</span>
            )}
            {run && (
              <span className={`flex shrink-0 items-center gap-2 leading-5 tabular-nums ${metaText}`}>
                <span data-testid="run-duration">{formatDurationMs(run.duration_secs * 1000)}</span>
                <span data-testid="run-cost">
                  {/* The basis comes with the figure; without one (an older backend) it is a reported cost, zero included. */}
                  <CostDisplay cost={costReport(run.cost_usd, run.cost_basis)} format={formatUsd2} />
                </span>
              </span>
            )}
          </div>

          <PlanStateBar waves={thread.waves} planId={thread.plan?.id} workspace={thread.workspace} className="mt-1" />

          <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${metaText}`}>
            <span data-testid="now-working" data-who={now.who} className={now.who === 'you' ? 'font-medium text-sky-300' : ''}>
              {now.text}
            </span>
            <span data-testid="lane-label">{laneName ?? thread.workspace}</span>
          </div>

          {others.length > 0 && <OtherThreads threads={others} renderDiscussions={renderDiscussions} />}
          {renderDiscussions && thread.plan && <DiscussionsToggle thread={thread} renderDiscussions={renderDiscussions} />}
        </div>
      </div>
    </li>
  )
}

function DiscussionsToggle({
  thread,
  renderDiscussions,
}: {
  thread: AttentionThread
  renderDiscussions: (thread: AttentionThread) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`-ml-2 text-xs! ${open ? 'text-gray-100!' : 'text-gray-400!'}`}
      >
        <ChevronRight className={`mr-1 h-3.5 w-3.5 shrink-0 ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
        {open ? DISCUSSIONS_TEXT.hide : DISCUSSIONS_TEXT.show}
      </Button>
      <div id={panelId} hidden={!open} className="min-w-0">
        {open && renderDiscussions(thread)}
      </div>
    </div>
  )
}

/** "+ N autres fils du même plan", clickable: unfolds those threads with their state and discussions. */
function OtherThreads({
  threads,
  renderDiscussions,
}: {
  threads: AttentionThread[]
  renderDiscussions?: (thread: AttentionThread) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const n = threads.length
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex min-h-9 items-center gap-1 rounded ${metaText} hover:text-gray-100 ${focusRing}`}
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
        {n === 1 ? '+ 1 autre exécution de ce plan' : `+ ${n} autres exécutions de ce plan`}
      </button>
      <ul id={listId} hidden={!open} aria-label="Autres exécutions de ce plan" className="m-0 min-w-0 list-none space-y-2 p-0">
        {open &&
          threads.map((t) => (
            <li key={t.id} data-testid="other-thread" data-thread={t.id} className="min-w-0 border-l border-white/[0.08] pl-3">
              <p className="min-w-0 break-words text-sm text-gray-200">{t.title}</p>
              <p className={metaText}>
                {t.run?.status === 'running' ? 'En cours' : 'Arrêté'} · {nowWorking(t).text}
              </p>
              {renderDiscussions && t.plan && <DiscussionsToggle thread={t} renderDiscussions={renderDiscussions} />}
            </li>
          ))}
      </ul>
    </div>
  )
}

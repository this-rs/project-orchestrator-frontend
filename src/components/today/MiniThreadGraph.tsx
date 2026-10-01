import { Link } from 'react-router-dom'
import { TONE_CLASSES, type StatusTone } from '@/components/ui/statusMeta'
import { focusRing } from '@/components/ui/classes'
import type { WavePointStatus, WaveSummaryDto } from '@/types/attention'
import { workspacePath } from '@/utils/paths'

/**
 * A thread's plan in one glance: the waves side by side on ONE line (wrapping only when
 * the width runs out), one mark per task. A wave is a short run of marks, not a column:
 * stacked columns made a 5-task wave five rows tall, and 40 threads a 7000 px page.
 * No task text — the reader sees where the thread is and where it is stopped.
 *
 * - Light inline SVG / HTML (a canvas per thread would not survive 40 threads on a phone).
 * - State = shape AND colour (readable in greyscale): ● done, ◉ running, ○ pending,
 *   ◆ waiting on you, ✕ failed, ■ blocked.
 * - Only the running mark pulses (`.pulse-ring`, already disabled under
 *   prefers-reduced-motion); it is a different element once the state changes.
 * - Above COMPRESS_THRESHOLD tasks, each wave collapses to a count per state.
 * - Never scrolls horizontally: waves wrap.
 * - Tap / Enter opens the existing plan graph (plan page, Graph tab).
 */

/** Above this many tasks, waves are compressed to counts per state. */
export const COMPRESS_THRESHOLD = 24

interface StateMeta {
  tone: StatusTone
  /** Singular noun phrase used in the accessible label ("5 done"). */
  word: string
}

/** Reading order, also the order of counts in labels. Tones: existing status tones. */
export const STATE_META: Record<WavePointStatus, StateMeta> = {
  done: { tone: 'success', word: 'done' },
  running: { tone: 'progress', word: 'running' },
  waiting: { tone: 'info', word: 'waiting on you' },
  pending: { tone: 'neutral', word: 'up next' },
  blocked: { tone: 'warning', word: 'blocked' },
  failed: { tone: 'danger', word: 'failed' },
}
const ORDER = Object.keys(STATE_META) as WavePointStatus[]

type Counts = Record<WavePointStatus, number>

function countStates(wave: WaveSummaryDto): Counts {
  const c = { done: 0, running: 0, waiting: 0, pending: 0, blocked: 0, failed: 0 } as Counts
  for (const p of wave.points) c[p.status] += 1
  return c
}

function describe(counts: Counts): string {
  const parts = ORDER.filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${STATE_META[s].word}`)
  return parts.length ? parts.join(', ') : 'empty'
}

/** Full text label, e.g. "Plan graph, 3 waves: wave 1 of 3: 5 done; wave 2 of 3: 1 running, 2 up next". */
export function miniThreadGraphLabel(waves: WaveSummaryDto[]): string {
  if (waves.length === 0) return 'Plan graph: no waves'
  const total = waves.length
  const body = waves.map((w, i) => `wave ${i + 1} of ${total}: ${describe(countStates(w))}`).join('; ')
  return `Plan graph, ${total} ${total === 1 ? 'wave' : 'waves'}: ${body}`
}

/** One mark. 12px box, `currentColor` carries the tone, the shape carries the state. */
function Glyph({ status }: { status: WavePointStatus }) {
  const shape = (() => {
    switch (status) {
      case 'done':
        return <circle cx="6" cy="6" r="4.5" fill="currentColor" />
      case 'running':
        return (
          <>
            <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="6" cy="6" r="2.2" fill="currentColor" />
          </>
        )
      case 'pending':
        return <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      case 'waiting':
        return <path d="M6 0.8 11.2 6 6 11.2 0.8 6Z" fill="currentColor" />
      case 'failed':
        return <path d="M2 2 10 10M10 2 2 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      case 'blocked':
        return <rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="currentColor" />
    }
  })()
  return (
    <span
      data-state={status}
      className={`relative inline-flex h-3 w-3 shrink-0 ${TONE_CLASSES[STATE_META[status].tone].text}`}
    >
      {status === 'running' && (
        <span
          data-testid="pulse"
          aria-hidden="true"
          className={`pulse-ring absolute inset-0 rounded-full ${TONE_CLASSES.progress.dot}`}
        />
      )}
      <svg viewBox="0 0 12 12" className="relative h-3 w-3" aria-hidden="true" focusable="false">
        {shape}
      </svg>
    </span>
  )
}

function WaveColumn({ wave, compressed }: { wave: WaveSummaryDto; compressed: boolean }) {
  if (compressed) {
    const counts = countStates(wave)
    return (
      <li data-wave={wave.wave_number} className="flex min-w-0 flex-col items-start gap-1">
        {ORDER.filter((s) => counts[s] > 0).map((s) => (
          <span key={s} className="inline-flex items-center gap-1 text-[11px] leading-3 tabular-nums text-gray-400">
            <Glyph status={s} />
            {counts[s]}
          </span>
        ))}
      </li>
    )
  }
  return (
    <li data-wave={wave.wave_number} className="flex min-w-0 flex-wrap items-center gap-1">
      {wave.points.map((p) => (
        <Glyph key={p.task_id} status={p.status} />
      ))}
    </li>
  )
}

export interface MiniThreadGraphProps {
  waves: WaveSummaryDto[]
  /** With `workspace`, makes the graph a link to the plan's full graph. */
  planId?: string | null
  workspace?: string | null
  className?: string
}

export function MiniThreadGraph({ waves, planId, workspace, className = '' }: MiniThreadGraphProps) {
  const label = miniThreadGraphLabel(waves)
  const total = waves.reduce((n, w) => n + w.points.length, 0)
  const compressed = total > COMPRESS_THRESHOLD

  if (waves.length === 0) {
    return <span className={`text-[11px] leading-4 text-gray-600 ${className}`}>No plan graph</span>
  }

  const columns = (
    <ul className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1" data-compressed={compressed || undefined}>
      {waves.map((w) => (
        <WaveColumn key={w.wave_number} wave={w} compressed={compressed} />
      ))}
    </ul>
  )
  const box = `block min-h-9 max-w-full min-w-0 overflow-hidden rounded-lg px-1 py-2 ${className}`

  if (planId && workspace) {
    return (
      <Link
        to={`${workspacePath(workspace, `/plans/${planId}`)}#graph`}
        aria-label={label}
        className={`${box} hover:bg-white/[0.04] ${focusRing}`}
      >
        {columns}
      </Link>
    )
  }
  return (
    <div role="img" aria-label={label} className={box}>
      {columns}
    </div>
  )
}

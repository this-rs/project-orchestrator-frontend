import { Link } from 'react-router-dom'
import { TONE_CLASSES } from '@/components/ui/statusMeta'
import { focusRing } from '@/components/ui/classes'
import type { WavePointStatus, WaveSummaryDto } from '@/types/attention'
import { workspacePath } from '@/utils/paths'
import { STATE_META } from './MiniThreadGraph'

/**
 * Where a plan stands, readable without a legend: ONE bar cut by state, "21/49" at its right,
 * and the states that matter spelled out underneath ("9 en cours · 1 attend ta réponse ·
 * 1 bloquée"). It replaces the per-wave dots on Today: a row of counts per wave asked the
 * reader to know what a wave is and what each shape means.
 *
 * - Counted from the thread's wave summary, never estimated; no width tween (live data).
 * - Colour is never the only cue: every state shown in the bar is also named in words.
 * - Tap / Enter opens the plan's full graph (the waves live there).
 */

/** Left to right in the bar: what is finished, what moves, what waits on the user, what is stopped. */
const BAR_ORDER: WavePointStatus[] = ['done', 'running', 'waiting', 'blocked', 'failed']
/** In words under the bar: what needs the reader first. "faites" is already the "21/49". */
const WORDS_ORDER: WavePointStatus[] = ['waiting', 'failed', 'blocked', 'running']

export type StateCounts = Record<WavePointStatus, number>

export function countPlanStates(waves: WaveSummaryDto[]): StateCounts & { total: number } {
  const c = { done: 0, running: 0, waiting: 0, pending: 0, blocked: 0, failed: 0, total: 0 }
  for (const w of waves) {
    for (const p of w.points) {
      c[p.status] += 1
      c.total += 1
    }
  }
  return c
}

const phrase = (s: WavePointStatus, n: number) => `${n} ${n === 1 ? STATE_META[s].one : STATE_META[s].many}`

/** "21 faites sur 49, 9 en cours, 1 attend ta réponse, 1 bloquée". */
export function planStateLabel(c: StateCounts & { total: number }): string {
  if (c.total === 0) return 'Aucune tâche'
  const rest = WORDS_ORDER.filter((s) => c[s] > 0).map((s) => phrase(s, c[s]))
  return [`${phrase('done', c.done)} sur ${c.total}`, ...rest].join(', ')
}

export interface PlanStateBarProps {
  waves: WaveSummaryDto[]
  /** With `workspace`, the bar links to the plan's full graph. */
  planId?: string | null
  workspace?: string | null
  className?: string
}

export function PlanStateBar({ waves, planId, workspace, className = '' }: PlanStateBarProps) {
  const c = countPlanStates(waves)
  if (c.total === 0) return null
  const words = WORDS_ORDER.filter((s) => c[s] > 0)

  const body = (
    <>
      <span className="flex items-center gap-3">
        <span
          role="progressbar"
          aria-label="Avancement"
          aria-valuemin={0}
          aria-valuemax={c.total}
          aria-valuenow={c.done}
          aria-valuetext={planStateLabel(c)}
          className="flex h-1.5 min-w-0 flex-1 gap-px overflow-hidden rounded-full bg-white/[0.08]"
        >
          {BAR_ORDER.filter((s) => c[s] > 0).map((s) => (
            <span
              key={s}
              data-segment={s}
              data-testid={s === 'done' ? 'progress-fill' : undefined}
              className={`h-full ${TONE_CLASSES[STATE_META[s].tone].dot}`}
              style={{ width: `${(c[s] / c.total) * 100}%` }}
            />
          ))}
        </span>
        <span data-testid="progress-text" className="shrink-0 text-xs tabular-nums text-gray-300">
          {c.done}/{c.total}
        </span>
      </span>
      {words.length > 0 && (
        <span data-testid="state-words" className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs leading-4">
          {words.map((s) => (
            <span key={s} data-state={s} className={`inline-flex items-center gap-1.5 ${TONE_CLASSES[STATE_META[s].tone].text}`}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONE_CLASSES[STATE_META[s].tone].dot}`} />
              {phrase(s, c[s])}
            </span>
          ))}
        </span>
      )}
    </>
  )

  if (planId && workspace) {
    return (
      <Link
        to={`${workspacePath(workspace, `/plans/${planId}`)}#graph`}
        title="Ouvrir le graphe du plan"
        className={`-mx-1 block min-w-0 rounded-lg px-1 py-1.5 hover:bg-white/[0.04] ${focusRing} ${className}`}
      >
        {body}
      </Link>
    )
  }
  return <div className={`min-w-0 py-1.5 ${className}`}>{body}</div>
}

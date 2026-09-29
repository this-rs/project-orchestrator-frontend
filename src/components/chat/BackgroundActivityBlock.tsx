import { useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { Activity, ChevronRight } from 'lucide-react'
import { chatBackgroundTasksAtom } from '@/atoms'
import type { ContentBlock } from '@/types'
import { ToneText } from '@/components/ui/Status'
import { focusRingInset } from '@/components/ui/classes'
import {
  ACTIVITY_STATUS_META,
  buildActivityFromBlock,
  summarizeStatuses,
  type ActivityStatus,
  type StatusCounts,
} from '@/utils/backgroundActivity'
import { ActivityCard } from './BackgroundActivityCard'

/** Status-first summary: only the buckets that are non-empty, most urgent first. */
const SUMMARY_ORDER: Array<{ key: keyof Omit<StatusCounts, 'total' | 'other'>; status: ActivityStatus }> = [
  { key: 'running', status: 'running' },
  { key: 'queued', status: 'queued' },
  { key: 'failed', status: 'failed' },
  { key: 'done', status: 'done' },
]

export function StatusSummary({ counts }: { counts: StatusCounts }) {
  const parts = SUMMARY_ORDER.filter(({ key }) => counts[key] > 0)
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] leading-4">
      {parts.map(({ key, status }) => (
        <ToneText
          key={key}
          tone={ACTIVITY_STATUS_META[status].tone}
          label={`${counts[key]} ${ACTIVITY_STATUS_META[status].label.toLowerCase()}`}
          pulse={status === 'running'}
          className="tabular-nums"
        />
      ))}
      {counts.other > 0 && <ToneText tone="muted" label={`${counts.other} ended`} className="tabular-nums" />}
    </span>
  )
}

interface BackgroundActivityGroupProps {
  /** Consecutive `background_activity` blocks of one assistant message. */
  blocks: ContentBlock[]
}

/**
 * Background activity of a message, made legible: a status-first summary
 * (running / queued / failed / done) over a chained list of activities, each
 * rendered by a renderer specialised for its type (workflow fan-out, shell
 * command + output tail, sub-agent, generic key/value).
 *
 * Open by default only while something is still moving or failed; the state
 * is decided at mount so later ticks never re-flow the transcript.
 */
export function BackgroundActivityGroup({ blocks }: BackgroundActivityGroupProps) {
  const tasks = useAtomValue(chatBackgroundTasksAtom)
  const activities = useMemo(() => {
    const activeIds = new Set(tasks.map((t) => t.id))
    return blocks.map((b) => buildActivityFromBlock(b, { activeIds }))
  }, [blocks, tasks])
  const counts = summarizeStatuses(activities)
  const [expanded, setExpanded] = useState(() => counts.running + counts.queued + counts.failed > 0)

  return (
    <div
      className="my-1.5 rounded-lg bg-white/[0.02] border border-white/[0.05] overflow-hidden"
      data-testid="background-activity-block"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={`flex items-center gap-2 w-full px-3 py-1.5 min-h-9 text-left text-[11px] text-gray-500 hover:bg-white/[0.02] transition-colors motion-reduce:transition-none ${focusRingInset}`}
      >
        <ChevronRight
          aria-hidden="true"
          className={`w-3 h-3 text-gray-600 transition-transform motion-reduce:transition-none shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
        <Activity aria-hidden="true" className="w-3 h-3 text-gray-500 shrink-0" />
        <span className="shrink-0">Background activity</span>
        <span aria-hidden="true" className="text-gray-700 shrink-0">·</span>
        <StatusSummary counts={counts} />
      </button>

      {expanded && (
        <ol aria-label="Background activities" className="mb-2 ml-4 mr-3 space-y-1.5 border-l border-white/[0.06] pl-3">
          {activities.map((activity, i) => (
            <li key={blocks[i].id}>
              <ActivityCard
                activity={activity}
                defaultOpen={activities.length === 1 && (activity.status === 'running' || activity.status === 'failed')}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Single-block form, kept for callers that render one orphan block. */
export function BackgroundActivityBlock({ block }: { block: ContentBlock }) {
  const blocks = useMemo(() => [block], [block])
  return <BackgroundActivityGroup blocks={blocks} />
}

import { useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { Activity, ChevronRight } from 'lucide-react'
import { useT } from '@/i18n'
import { chatBackgroundTasksAtom } from '@/atoms'
import type { ContentBlock } from '@/types'
import { ToneText } from '@/components/ui/Status'
import { focusRingInset } from '@/components/ui/classes'
import {
  ACTIVITY_STATUS_META,
  buildActivityFromBlock,
  partitionActivities,
  summarizeStatuses,
  type ActivityModel,
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
  const { t } = useT()
  const parts = SUMMARY_ORDER.filter(({ key }) => counts[key] > 0)
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] leading-4">
      {parts.map(({ key, status }) => (
        <ToneText
          key={key}
          tone={ACTIVITY_STATUS_META[status].tone}
          label={t(`chatA-activity.bg.summary.${status}`, { count: counts[key] })}
          pulse={status === 'running'}
          className="tabular-nums"
        />
      ))}
      {counts.other > 0 && <ToneText tone="muted" label={t('chatA-activity.bg.summary.ended', { count: counts.other })} className="tabular-nums" />}
    </span>
  )
}

interface BackgroundActivityGroupProps {
  /** Consecutive `background_activity` blocks of one assistant message. */
  blocks: ContentBlock[]
}

/**
 * Provider telemetry, folded into one line.
 *
 * `system:*` ticks (thinking-token counts, status pings, init, MCP server
 * status…) are 27 % of the background feed and describe no work. They are not
 * cards: one line says they exist, and unfolding it lists them as one-liners —
 * their source and their first line, never a payload.
 */
function ProviderNotices({ notices }: { notices: ActivityModel[] }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1" data-testid="background-provider-notices">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`${focusRingInset} flex min-h-9 items-center gap-1 rounded px-1 text-[11px] text-gray-600 hover:text-gray-400`}
      >
        <ChevronRight
          aria-hidden="true"
          className={`h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
        {t(notices.length === 1 ? 'chatA-activity.bg.noticeOne' : 'chatA-activity.bg.noticeMany', { count: notices.length })}
      </button>
      {open && (
        <ul aria-label={t('chatA-activity.bg.noticesAria')} className="mt-0.5 space-y-0.5 pl-4">
          {notices.map((n) => (
            <li key={n.id} className="flex min-w-0 gap-2 text-[11px] text-gray-600">
              <span className="shrink-0 font-mono text-gray-500">{n.title}</span>
              <span className="min-w-0 truncate" title={n.outputLines[0] ?? ''}>
                {n.outputLines.find((l) => l.trim() !== '') ?? ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Background activity of a message, made legible: a status-first summary
 * (running / queued / failed / done) over a chained list of activities, each
 * rendered by a renderer specialised for its type (workflow fan-out, shell
 * command + output tail, sub-agent, generic key/value).
 *
 * Open by default only when something failed (running work is followed in the
 * activity bar above the composer, see `ActivityBar`); the state
 * is decided at mount so later ticks never re-flow the transcript.
 */
export function BackgroundActivityGroup({ blocks }: BackgroundActivityGroupProps) {
  const { t } = useT()
  const tasks = useAtomValue(chatBackgroundTasksAtom)
  const activities = useMemo(() => {
    const activeIds = new Set(tasks.map((t) => t.id))
    return blocks.map((b) => buildActivityFromBlock(b, { activeIds }))
  }, [blocks, tasks])
  const { work, notices } = useMemo(() => partitionActivities(activities), [activities])
  const counts = summarizeStatuses(work)
  // Closed while things run: the activity bar above the composer is where a
  // running activity is followed, and an open panel per activity is what made
  // the transcript hard to read. A failure still opens it — that one needs eyes.
  const [expanded, setExpanded] = useState(() => counts.failed > 0)

  return (
    <div
      className="my-1.5 rounded-lg bg-white/[0.02] border border-white/[0.05] overflow-hidden"
      data-testid="background-activity-block"
      // The activity bar scrolls here: one group stands for several blocks.
      data-activity-anchors={blocks.map((b) => b.id).join(' ')}
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
        <span className="shrink-0">{t('chatA-activity.bg.title')}</span>
        <span aria-hidden="true" className="text-gray-700 shrink-0">·</span>
        {work.length > 0 ? (
          <StatusSummary counts={counts} />
        ) : (
          <ToneText tone="muted" label={t('chatA-activity.bg.noWork')} className="tabular-nums" />
        )}
      </button>

      {expanded && (
        <>
          {work.length > 0 && (
            <ol aria-label={t('chatA-activity.bg.listAria')} className="mb-2 ml-4 mr-3 space-y-1.5 border-l border-white/[0.06] pl-3">
              {work.map((activity) => (
                <li key={activity.id}>
                  <ActivityCard
                    activity={activity}
                    defaultOpen={work.length === 1 && activity.status === 'failed'}
                  />
                </li>
              ))}
            </ol>
          )}
          {notices.length > 0 && (
            <div className="ml-4 mr-3 mb-2">
              <ProviderNotices notices={notices} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Single-block form, kept for callers that render one orphan block. */
export function BackgroundActivityBlock({ block }: { block: ContentBlock }) {
  const blocks = useMemo(() => [block], [block])
  return <BackgroundActivityGroup blocks={blocks} />
}

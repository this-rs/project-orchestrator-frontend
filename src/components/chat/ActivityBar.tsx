/**
 * What is running in this session, on one line above the composer.
 *
 * Collapsed: a count per kind (runs, workflows, agents, shells, monitors) and how
 * long the oldest has been running. Expanded: one row per activity — title,
 * fan-out progress, live duration, "show in the conversation", and Stop where
 * the backend can stop that one thing on its own (Monitor / Bash in the
 * background).
 *
 * It replaces the toolbar pill that only knew Monitor and Bash
 * (`BackgroundTasksIndicator`): workflows and sub-agents used to be visible
 * only where their tool call sat in the transcript, i.e. not at all once the
 * conversation had scrolled.
 *
 * Like the queue under it, it is a block in the composer's column, never an
 * overlay (see `MessageQueueBar`): the dock measures its height, so the
 * transcript keeps clear of it. Renders nothing when nothing runs.
 */
import { memo, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Bot, CheckCircle2, ChevronDown, CornerRightUp, ExternalLink, Eye, Layers, Loader2, MessageSquare, Square, Terminal, Workflow } from 'lucide-react'
import { useT } from '@/i18n'
import { useBackgroundTasks } from '@/hooks/useBackgroundTasks'
import { readCancelFailure } from '@/utils/cancelFailure'
import { countByKind, type RunningItem, type RunningKind } from './runningActivity'
import { useElapsedMs, formatDurationShort } from './useElapsedMs'

const KIND_META: Record<RunningKind, { icon: typeof Eye }> = {
  run: { icon: Layers },
  workflow: { icon: Workflow },
  agent: { icon: Bot },
  shell: { icon: Terminal },
  monitor: { icon: Eye },
}

/** How long the Stop confirmation stays visible. */
const FEEDBACK_TTL_MS = 2500

/**
 * What a Stop click came back with (`CancelTaskResult`):
 * - `success`: the backend signalled at least one process;
 * - `fallback`: the cancel was registered but no pid was known — the
 *   subprocess may survive, the global Stop is the way out;
 * - `error`: refused (rate cap) or failed.
 */
type Feedback =
  | { kind: 'success'; killed: number }
  | { kind: 'stopped'; message: string }
  | { kind: 'fallback' }
  | { kind: 'error'; message: string }

/** Scroll the transcript to the block an activity came from. */
function revealInTranscript(anchorId: string): void {
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(anchorId) : anchorId.replace(/"/g, '\\"')
  document
    .querySelector(`[data-tool-call-id="${escaped}"], [data-activity-anchors~="${escaped}"]`)
    ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

function oldestStart(items: ReadonlyArray<RunningItem>): string | undefined {
  return items.reduce<string | undefined>(
    (oldest, item) => (item.startedAt && (!oldest || item.startedAt < oldest) ? item.startedAt : oldest),
    undefined,
  )
}

/** What can be done with a detached run (a child session) from the bar. */
export interface RunActions {
  /** Open the run's conversation. */
  view: (sessionId: string) => void
  /** Interrupt the run. */
  stop: (sessionId: string) => void
  /** Open the runner dashboard of the plan the run belongs to. */
  dashboard: (planId: string) => void
}

interface RowProps {
  item: RunningItem
  stopping: boolean
  onStop: (taskId: string) => void
  runActions?: RunActions
}

function ActivityRow({ item, stopping, onStop, runActions }: RowProps) {
  const { t } = useT()
  const { icon: Icon } = KIND_META[item.kind]
  const elapsedMs = useElapsedMs(item.startedAt, true)
  return (
    <li className={`flex items-center gap-2 px-2.5 py-1.5 ${stopping ? 'opacity-70' : ''}`} data-kind={item.kind}>
      <Icon className="w-3 h-3 shrink-0 text-emerald-400/80" aria-label={t(`chatA-activity.kindName.${item.kind}`)} />
      <span className="flex-1 min-w-0 truncate text-xs text-gray-300" title={item.title}>
        {item.title}
      </span>
      {item.progress && (
        <span className="shrink-0 text-[10px] tabular-nums text-gray-400">
          {t('chatA-activity.row.progress', { settled: item.progress.settled, total: item.progress.total })}
        </span>
      )}
      {stopping ? (
        <span className="shrink-0 text-[10px] text-amber-300/80">{t('chatA-activity.row.stopping')}</span>
      ) : (
        elapsedMs != null && (
          <span className="shrink-0 text-[10px] tabular-nums text-gray-500">{formatDurationShort(elapsedMs)}</span>
        )
      )}
      <div className="shrink-0 flex items-center gap-0.5">
        {item.anchorId && (
          <button
            type="button"
            onClick={() => revealInTranscript(item.anchorId!)}
            aria-label={t('chatA-activity.row.showAria', { title: item.title })}
            title={t('chatA-activity.row.show')}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] transition-colors"
          >
            <CornerRightUp className="w-3 h-3" />
          </button>
        )}
        {runActions && item.sessionId && (
          <button
            type="button"
            onClick={() => runActions.view(item.sessionId!)}
            aria-label={t('chatA-activity.row.openConversationAria', { title: item.title })}
            title={t('chatA-activity.row.openConversation')}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
          </button>
        )}
        {runActions && item.planId && (
          <button
            type="button"
            onClick={() => runActions.dashboard(item.planId!)}
            aria-label={t('chatA-activity.row.dashboardAria', { title: item.title })}
            title={t('chatA-activity.row.dashboard')}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-gray-200 hover:bg-white/[0.06] transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
        {runActions && item.sessionId && (
          <button
            type="button"
            onClick={() => runActions.stop(item.sessionId!)}
            aria-label={t('chatA-activity.row.stopAria', { title: item.title })}
            title={t('chatA-activity.row.stopRun')}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-600/10 transition-colors"
          >
            <Square className="w-3 h-3" />
          </button>
        )}
        {item.taskId && (
          <button
            type="button"
            onClick={() => onStop(item.taskId!)}
            disabled={stopping}
            aria-label={t('chatA-activity.row.stopAria', { title: item.title })}
            title={stopping ? t('chatA-activity.row.stoppingTitle') : t('chatA-activity.row.stop')}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-600/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {stopping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
          </button>
        )}
      </div>
    </li>
  )
}

export const ActivityBar = memo(function ActivityBar({ items, runActions }: { items: ReadonlyArray<RunningItem>; runActions?: RunActions }) {
  const { t } = useT()
  const { cancelTask } = useBackgroundTasks()
  const [expanded, setExpanded] = useState(false)
  // Sticky: a row says "stopping…" from the click until the task leaves the
  // list (the backend keeps it for a grace period). Without it the spinner
  // would flash for the round-trip and the click would look ignored.
  const [stopping, setStopping] = useState<ReadonlySet<string>>(() => new Set())
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elapsedMs = useElapsedMs(oldestStart(items), items.length > 0)

  useEffect(() => {
    setStopping((prev) => {
      const alive = new Set(items.map((i) => i.id))
      const next = new Set([...prev].filter((id) => alive.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [items])

  useEffect(() => () => {
    if (feedbackTimer.current != null) clearTimeout(feedbackTimer.current)
  }, [])

  if (items.length === 0) return null

  const flash = (next: Feedback) => {
    if (feedbackTimer.current != null) clearTimeout(feedbackTimer.current)
    setFeedback(next)
    feedbackTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_TTL_MS)
  }

  const setStoppingFor = (taskId: string, on: boolean) =>
    setStopping((prev) => {
      const next = new Set(prev)
      if (on) next.add(taskId)
      else next.delete(taskId)
      return next
    })

  const handleStop = async (taskId: string) => {
    setFeedback(null)
    setStoppingFor(taskId, true)
    try {
      const result = await cancelTask(taskId)
      if (result.capped) {
        // Refused: the click did nothing, so the row must not say "stopping…".
        setStoppingFor(taskId, false)
        flash({ kind: 'error', message: t('chatA-activity.bar.tooFast') })
      } else if (result.killed_pids.length > 0) {
        flash({ kind: 'success', killed: result.killed_pids.length })
      } else {
        flash({ kind: 'fallback' })
      }
    } catch (err) {
      setStoppingFor(taskId, false)
      const failure = readCancelFailure(err)
      if (failure.alreadyStopped) {
        // 409 owner_unreachable: nothing runs any more, nothing to retry.
        flash({ kind: 'stopped', message: t('chatA-activity.cancel.alreadyStoppedNotice') })
      } else if (failure.code === 'owner_timeout') {
        // No answer in time: it may still happen (retryable or not, say that first).
        flash({ kind: 'error', message: t('chatA-activity.cancel.timeoutNotice') })
      } else if (failure.retryable) {
        flash({ kind: 'error', message: t('chatA-activity.cancel.retryNotice') })
      } else {
        flash({ kind: 'error', message: t('chatA-activity.bar.cancelFailed') })
      }
    }
  }

  const counts = countByKind(items)
  const summary = counts.map(({ kind, count }) => t(count === 1 ? `chatA-activity.kindCount.${kind}.one` : `chatA-activity.kindCount.${kind}.many`, { count })).join(', ')
  const workflows = items.filter((i) => i.kind === 'workflow' && i.progress)
  const soleProgress = workflows.length === 1 ? workflows[0].progress : undefined

  return (
    <div data-testid="activity-bar">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={t('chatA-activity.bar.runningAria', { summary })}
        className="flex w-full items-center gap-2.5 px-2.5 py-1 text-[11px] text-gray-400 hover:bg-white/[0.03] transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" aria-hidden />
        {/* One line whatever the number of kinds: what does not fit is cut, the
            duration and the chevron on the right stay. */}
        <span className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden whitespace-nowrap">
        {counts.map(({ kind, count }) => {
          const { icon: Icon } = KIND_META[kind]
          return (
            <span key={kind} className="inline-flex items-center gap-1 shrink-0" data-kind={kind}>
              <Icon className="w-3 h-3 text-emerald-400/80" aria-hidden />
              <span>
                {t(count === 1 ? `chatA-activity.kindCount.${kind}.one` : `chatA-activity.kindCount.${kind}.many`, { count })}
                {kind === 'workflow' && soleProgress && (
                  <span className="tabular-nums text-gray-500">
                    {' '}
                    {soleProgress.settled}/{soleProgress.total}
                  </span>
                )}
              </span>
            </span>
          )
        })}
        </span>
        <span className="ml-auto flex items-center gap-1.5 shrink-0 text-[10px] text-gray-600">
          {elapsedMs != null && <span className="tabular-nums">{formatDurationShort(elapsedMs)}</span>}
          <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      </button>

      {expanded && (
        <ul className="max-h-40 overflow-y-auto border-t border-white/[0.06] divide-y divide-white/[0.04]">
          {items.map((item) => (
            <ActivityRow key={item.id} item={item} stopping={stopping.has(item.id)} onStop={(id) => void handleStop(id)} runActions={runActions} />
          ))}
        </ul>
      )}

      {feedback && (
        <div
          role="status"
          className={`flex items-start gap-2 px-2.5 py-1.5 border-t border-white/[0.06] text-[11px] ${
            feedback.kind === 'success' || feedback.kind === 'stopped' ? 'text-emerald-300' : 'text-amber-300'
          }`}
          data-feedback={feedback.kind}
        >
          {feedback.kind === 'success' || feedback.kind === 'stopped' ? (
            <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          )}
          <span>
            {feedback.kind === 'success'
              ? t(feedback.killed === 1 ? 'chatA-activity.bar.stoppedOne' : 'chatA-activity.bar.stoppedMany', { count: feedback.killed })
              : feedback.kind === 'fallback'
                ? t('chatA-activity.bar.noPid')
                : feedback.message}
          </span>
        </div>
      )}
    </div>
  )
})

/**
 * ActivityHubPage — everything that is running, right now, by kind.
 *
 *   Activity  6                                  [● Live] [↻]
 *   Plan runs ▸ RunCard RunCard                  (grid, 320px min)
 *   Protocols ▸ ProtocolRunCard
 *   Conversations ▸ ChatSessionCard
 *   ── Live log ─────────────────────────────── (filtered, click to jump)
 *
 * Why one page instead of three lists: a plan run, a protocol run and a
 * conversation are three *implementations* of the same thing the person is
 * watching — work happening in the background — and today each one only exists
 * inside its own screen. Here they are three sections of one answer, each with
 * the anatomy that belongs to its kind of run.
 *
 * The page reads its data through `useActivityStream`, which pairs the snapshot
 * (the truth) with the feed (the timing). Nothing here derives run state from
 * events: it re-reads the snapshot when something moves.
 */
import { useCallback, type ReactNode } from 'react'
import { useAtom } from 'jotai'
import { RefreshCw } from 'lucide-react'
import { EmptyState, ErrorState, PageShell, SkeletonCard } from '@/components/ui'
import { iconButton } from '@/components/ui/classes'
import { ActivityLog } from '@/components/activity/ActivityLog'
import { ActivitySidebar } from '@/components/activity/ActivitySidebar'
import { ChatSessionCard } from '@/components/activity/ChatSessionCard'
import { PlanRunCard } from '@/components/activity/PlanRunCard'
import { ProtocolRunCard } from '@/components/activity/ProtocolRunCard'
import { CATEGORY_META } from '@/components/activity/categoryMeta'
import type { ActivityConnectionStatus } from '@/services/activityWs'
import {
  activityCategoriesAtom,
  activityFollowLogAtom,
  activityPulseAtom,
  activityStatusesAtom,
} from '@/atoms/activityFilters'
import { useActivityStream } from '@/hooks/useActivityStream'
import { useWorkspaceSlug } from '@/hooks'
import { useT } from '@/i18n'
import type { ActivityCategory } from '@/types/activity'
import { workspacePath } from '@/utils/paths'

export function ActivityHubPage() {
  const { t } = useT()
  const workspaceSlug = useWorkspaceSlug()

  const [categories, setCategories] = useAtom(activityCategoriesAtom)
  const [statuses, setStatuses] = useAtom(activityStatusesAtom)
  const [pulse, setPulse] = useAtom(activityPulseAtom)
  const [follow, setFollow] = useAtom(activityFollowLogAtom)

  const { snapshot, events, status, loading, error, gap, lastEventSeqByEntity, refresh } =
    useActivityStream({ workspaceSlug, categories, statuses })

  const toggleCategory = useCallback(
    (category: ActivityCategory) => {
      setCategories((current) =>
        current.includes(category)
          ? current.filter((value) => value !== category)
          : [...current, category],
      )
    },
    [setCategories],
  )

  const toggleStatus = useCallback(
    (value: string) => {
      setStatuses((current) =>
        current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
      )
    },
    [setStatuses],
  )

  /** Bring the card of an entity into view — the gesture the log exists to offer. */
  const jumpTo = useCallback((entityId: string) => {
    const card = document.getElementById(`activity-card-${entityId}`)
    if (!card) return
    card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    card.focus({ preventScroll: true })
  }, [])

  const visible = useCallback(
    (category: ActivityCategory) => categories.length === 0 || categories.includes(category),
    [categories],
  )

  const planRuns = snapshot?.plan_runs ?? []
  const protocolRuns = snapshot?.protocol_runs ?? []
  const chatSessions = snapshot?.chat_sessions ?? []

  const shownCount =
    (visible('plan_run') ? planRuns.length : 0) +
    (visible('protocol_run') ? protocolRuns.length : 0) +
    (visible('chat_session') ? chatSessions.length : 0)

  return (
    <PageShell
      title={t('nav.concepts.activity')}
      description={t('nomenclature.activity.description')}
      count={snapshot ? shownCount : undefined}
      intro="activity"
      actions={
        <>
          <ConnectionBadge status={status} />
          <button
            type="button"
            onClick={refresh}
            className={iconButton()}
            aria-label={t('ui.retry')}
            title={t('ui.retry')}
          >
            <RefreshCw className="size-4" />
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-6 lg:flex-row">
        <ActivitySidebar
          categories={categories}
          onToggleCategory={toggleCategory}
          statuses={statuses}
          onToggleStatus={toggleStatus}
          pulse={pulse}
          onTogglePulse={setPulse}
          counts={snapshot?.counts}
        />

        <div className="min-w-0 flex-1">
          {error ? (
            <ErrorState description={error} onRetry={refresh} />
          ) : loading && !snapshot ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <SkeletonCard key={index} />
              ))}
            </div>
          ) : shownCount === 0 ? (
            <EmptyState
              icon={<CATEGORY_META.plan_run.icon className="size-5" />}
              title={t('activity.hub.emptyTitle')}
              description={t('activity.hub.emptyDescription')}
            />
          ) : (
            <div className="space-y-6">
              {visible('plan_run') && planRuns.length > 0 && (
                <CardSection category="plan_run" count={planRuns.length}>
                  {planRuns.map((run) => (
                    <PlanRunCard
                      key={run.run_id}
                      run={run}
                      href={workspacePath(workspaceSlug, `/plans/${run.plan_id}/runner`)}
                      pulseSeq={lastEventSeqByEntity[run.run_id] ?? 0}
                      pulseEnabled={pulse}
                    />
                  ))}
                </CardSection>
              )}

              {visible('protocol_run') && protocolRuns.length > 0 && (
                <CardSection category="protocol_run" count={protocolRuns.length}>
                  {protocolRuns.map((run) => (
                    <ProtocolRunCard
                      key={run.run_id}
                      run={run}
                      href={workspacePath(workspaceSlug, `/protocols/${run.protocol_id}`)}
                      pulseSeq={lastEventSeqByEntity[run.run_id] ?? 0}
                      pulseEnabled={pulse}
                    />
                  ))}
                </CardSection>
              )}

              {visible('chat_session') && chatSessions.length > 0 && (
                <CardSection category="chat_session" count={chatSessions.length}>
                  {chatSessions.map((session) => (
                    <ChatSessionCard
                      key={session.session_id}
                      session={session}
                      href={workspacePath(workspaceSlug, `/chat/${session.session_id}`)}
                      pulseSeq={lastEventSeqByEntity[session.session_id] ?? 0}
                      pulseEnabled={pulse}
                    />
                  ))}
                </CardSection>
              )}
            </div>
          )}

          <ActivityLog
            events={events}
            onJump={jumpTo}
            follow={follow}
            onToggleFollow={setFollow}
            gap={gap}
          />
        </div>
      </div>
    </PageShell>
  )
}

/** One titled grid of cards — the section header carries the type and its count. */
function CardSection({
  category,
  count,
  children,
}: {
  category: ActivityCategory
  count: number
  children: ReactNode
}) {
  const meta = CATEGORY_META[category]
  return (
    <section aria-label={meta.label()}>
      <h2 className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-400">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.tint }} aria-hidden="true" />
        {meta.label()}
        <span className="tabular-nums text-gray-600">{count}</span>
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  )
}

/** The socket's own words: live, reconnecting, or offline. Colour never carries it alone. */
function ConnectionBadge({ status }: { status: ActivityConnectionStatus }) {
  const { t } = useT()
  const label =
    status === 'connected'
      ? t('activity.hub.connectionLive')
      : status === 'disconnected'
        ? t('activity.hub.connectionOffline')
        : t('activity.hub.connectionReconnecting')
  const dot =
    status === 'connected' ? 'bg-emerald-400' : status === 'disconnected' ? 'bg-gray-500' : 'bg-amber-400'
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-400">
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  )
}

export default ActivityHubPage

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton, SkeletonLine, EntityListSkeleton, EmptyState, Button, focusRing, surface } from '@/components/ui'
import type { AttentionResponse, AttentionThread, Band, WaitingRequest } from '@/types/attention'
import { workspacePath } from '@/utils/paths'
import { AttentionCard, type AnswerResult } from './AttentionCard'
import { ThinkingList } from './ThinkingList'
import { ThreadRow, ThreadRowList } from './ThreadRow'
import { BAND_ORDER, BAND_TEXT, TODAY_TEXT, buildBands, linkNames, type LaneGroup } from './bands'

/**
 * The four bands of the cockpit, assembled. Presentation only: data and actions come
 * from a `TodaySource` (the live `useAttention`, or a demo fixture).
 *
 * Rules kept here (DESIGN.md §8):
 * - fixed band order; an empty band shrinks to ONE line, it is never hidden;
 * - first load: skeletons with the final shape of each band, no centred spinner;
 * - a failed source degrades ITS band only; the others stay usable;
 * - no entrance animation on bands or rows.
 */

export interface TodaySource {
  status: 'loading' | 'ready' | 'error'
  data: AttentionResponse | null
  /** Why the page could not load, or why the last refresh failed. */
  error: Error | null
  refresh: () => void
  notices: Record<string, string>
  drafts: Record<string, string>
  setDraft: (id: string, text: string) => void
  answerPermission: (req: WaitingRequest, allow: boolean) => Promise<boolean>
  sendReply: (req: WaitingRequest, content: string) => Promise<boolean>
  resumeRun: (thread: AttentionThread) => Promise<boolean>
  /** A `user_message` to a session (resumes a dead one). Throws on failure. */
  sendMessage: (sessionId: string, text: string) => Promise<void>
}

// ---------------------------------------------------------------------------
// Band frame
// ---------------------------------------------------------------------------

function ErrorLine({ children, onRetry }: { children: ReactNode; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm text-red-300">
      <span className="min-w-0 break-words">{children}</span>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        {TODAY_TEXT.retry}
      </Button>
    </div>
  )
}

interface BandFrameProps {
  band: Band
  count: number | null
  /** Whole-band load state. */
  state: 'loading' | 'error' | 'ready'
  errorText?: string
  /** A partial failure: the content below is real but incomplete. */
  degraded?: string | null
  onRetry: () => void
  skeleton: ReactNode
  empty: boolean
  className?: string
  children: ReactNode
}

function BandFrame({ band, count, state, errorText, degraded, onRetry, skeleton, empty, className = '', children }: BandFrameProps) {
  const { title, empty: emptyText } = BAND_TEXT[band]
  return (
    <section aria-label={title} data-band={band} data-state={state} className={`min-w-0 ${className}`}>
      <h2 className="mb-1 flex items-baseline gap-2 text-sm font-semibold text-gray-200">
        <span>{title}</span>
        {count !== null && <span className="text-xs font-normal tabular-nums text-gray-500">{count}</span>}
      </h2>
      {state === 'loading' ? (
        skeleton
      ) : state === 'error' ? (
        <ErrorLine onRetry={onRetry}>{errorText ?? TODAY_TEXT.bandError}</ErrorLine>
      ) : (
        <>
          {degraded && <ErrorLine onRetry={onRetry}>{degraded}</ErrorLine>}
          {empty ? <p className="py-2 text-sm text-gray-500">{emptyText}</p> : children}
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Skeletons: final shapes
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <div role="status" aria-label="Chargement" className={`${surface} space-y-3 p-4`}>
      <SkeletonLine width="35%" className="h-3" />
      <SkeletonLine width="90%" className="h-4" />
      <SkeletonLine width="60%" className="h-4" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
    </div>
  )
}

function ThreadRowsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Chargement" className="divide-y divide-white/[0.06]">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 py-3" aria-hidden="true">
          <div className="flex items-start gap-2">
            <Skeleton className="mt-[15px] h-2 w-2 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2 pt-3">
              <SkeletonLine width="55%" className="h-3.5" />
              <SkeletonLine width="35%" className="h-2.5" />
            </div>
          </div>
          <Skeleton className="ml-6 h-3 w-40" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export interface TodayViewProps {
  source: TodaySource
  /** Active lane slug (filter) or null for every lane. */
  lane: string | null
  /** Where "plans" leads: any workspace slug the user can reach. */
  plansSlug: string | null
  onClearLane: () => void
}

export function TodayCounters({ counts }: { counts: Record<Band, number> | null }) {
  return (
    <ul aria-label="Résumé par bande" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
      {BAND_ORDER.map((b) => (
        <li key={b} className="flex items-baseline gap-1.5" data-counter={b}>
          <span>{BAND_TEXT[b].title}</span>
          {counts ? (
            <span className="tabular-nums font-medium text-gray-200">{counts[b]}</span>
          ) : (
            <Skeleton className="h-3 w-4" />
          )}
        </li>
      ))}
    </ul>
  )
}

export function TodayView({ source, lane, plansSlug, onClearLane }: TodayViewProps) {
  const { status, data, error, refresh } = source
  const bands = data ? buildBands(data) : null
  const errors = data?.source_errors ?? []
  const laneName = (slug: string) => data?.lanes.find((l) => l.slug === slug)?.name ?? slug

  const state: 'loading' | 'error' | 'ready' = status
  const fatalText = error ? `${TODAY_TEXT.bandError} ${error.message}` : undefined
  const degradedFor = (b: Band) => {
    const msgs = errors.filter((e) => e.bands.includes(b)).map((e) => e.message)
    return msgs.length > 0 ? `${TODAY_TEXT.bandError} ${msgs.join(' ')}` : null
  }

  const common = (b: Band) => ({
    band: b,
    state,
    errorText: fatalText,
    degraded: degradedFor(b),
    onRetry: refresh,
  })

  // Truly nothing anywhere (and no source failed): one composed empty state.
  if (state === 'ready' && bands?.empty && errors.length === 0) {
    return (
      <div className="space-y-6">
        <TodayCounters counts={bands.counts} />
        {lane ? (
          <EmptyState
            title={TODAY_TEXT.noMatch}
            description={TODAY_TEXT.noMatchHint}
            action={
              <Button variant="secondary" size="sm" onClick={onClearLane}>
                {TODAY_TEXT.clearFilter}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={TODAY_TEXT.emptyAll}
            description={TODAY_TEXT.emptyAllHint}
            action={
              plansSlug ? (
                <Link
                  to={workspacePath(plansSlug, '/plans')}
                  className={`inline-flex min-h-9 items-center rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-gray-200 hover:bg-white/[0.08] ${focusRing}`}
                >
                  {TODAY_TEXT.plans}
                </Link>
              ) : undefined
            }
          />
        )}
      </div>
    )
  }

  const names = data ? linkNames(data) : undefined

  const laneGroups = <T,>(groups: LaneGroup<T>[], render: (entry: T) => ReactNode) =>
    groups.map((g) => (
      <div key={g.slug} data-lane={g.slug} className="min-w-0">
        {!lane && <h3 className="pt-2 text-[11px] font-medium text-gray-500">{g.name}</h3>}
        <ThreadRowList label={g.name}>{g.items.map(render)}</ThreadRowList>
      </div>
    ))

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <TodayCounters counts={bands ? bands.counts : null} />
        {status === 'ready' && error && (
          <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-300">
            <span>{TODAY_TEXT.staleRefresh}</span>
            <Button variant="secondary" size="sm" onClick={refresh}>
              {TODAY_TEXT.retry}
            </Button>
          </div>
        )}
      </div>

      {/* DOM order = visual order = tab order. */}
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <BandFrame
          {...common('waiting')}
          count={bands ? bands.counts.waiting : null}
          skeleton={
            <div className="space-y-3">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          }
          empty={!bands || bands.waiting.length === 0}
        >
          <ul aria-label="Demandes en attente" className="space-y-3">
            {bands?.waiting.map(({ request, thread, unattached }) => {
              const session =
                thread?.sessions.find((s) => s.id === request.session_id) ??
                (unattached ? { title: unattached.title, state: unattached.state } : null)
              return (
                <li key={request.request_id}>
                  <AttentionCard
                    request={request}
                    lane={laneName(request.workspace)}
                    threadTitle={thread?.title ?? null}
                    session={session}
                    links={thread ? (thread.sessions.find((s) => s.id === request.session_id)?.links ?? null) : null}
                    names={names}
                    notice={source.notices[request.request_id]}
                    onPermission={(r, allow): Promise<AnswerResult> => source.answerPermission(r, allow)}
                    onReply={(r, content): Promise<AnswerResult> => source.sendReply(r, content)}
                    draft={source.drafts[request.request_id]}
                    onDraftChange={(t) => source.setDraft(request.request_id, t)}
                  />
                </li>
              )
            })}
          </ul>
        </BandFrame>

        <BandFrame
          {...common('running')}
          count={bands ? bands.counts.running : null}
          skeleton={<ThreadRowsSkeleton />}
          empty={!bands || bands.running.length === 0}
        >
          {bands &&
            laneGroups(bands.running, (e) =>
              e.kind === 'running' ? (
                <ThreadRow key={e.thread.id} variant="running" thread={e.thread} laneName={laneName(e.thread.workspace)} />
              ) : (
                <ThreadRow
                  key={e.session.id}
                  variant="unattached"
                  session={e.session}
                  laneName={laneName(e.session.workspace_slug)}
                  onSendMessage={source.sendMessage}
                />
              ),
            )}
        </BandFrame>

        <BandFrame
          {...common('stuck')}
          className="lg:col-span-2"
          count={bands ? bands.counts.stuck : null}
          skeleton={<ThreadRowsSkeleton />}
          empty={!bands || bands.stuck.length === 0}
        >
          {bands &&
            data &&
            laneGroups(bands.stuck, (e) => {
              if (e.kind === 'stuck') {
                return (
                  <ThreadRow
                    key={e.thread.id}
                    variant="stuck"
                    thread={e.thread}
                    runner={data.runner}
                    laneName={laneName(e.thread.workspace)}
                    onResume={async (t) => {
                      if (!(await source.resumeRun(t))) throw new Error('Reprise impossible')
                    }}
                  />
                )
              }
              if (e.kind === 'orphan') {
                return (
                  <ThreadRow
                    key={`${e.thread.id}:${e.orphan.request_id}`}
                    variant="orphan"
                    thread={e.thread}
                    orphan={e.orphan}
                    laneName={laneName(e.thread.workspace)}
                    onSendMessage={source.sendMessage}
                  />
                )
              }
              return (
                <ThreadRow
                  key={e.session.id}
                  variant="unattached"
                  session={e.session}
                  laneName={laneName(e.session.workspace_slug)}
                  onSendMessage={source.sendMessage}
                />
              )
            })}
        </BandFrame>

        {state === 'ready' && bands && bands.thinking.length > 0 ? (
          <div className="min-w-0 lg:col-span-2">
            {degradedFor('thinking') && <ErrorLine onRetry={refresh}>{degradedFor('thinking')}</ErrorLine>}
            <ThinkingList items={bands.thinking} onChanged={refresh} title={BAND_TEXT.thinking.title} className="" />
          </div>
        ) : (
          <BandFrame
            {...common('thinking')}
            className="lg:col-span-2"
            count={bands ? bands.counts.thinking : null}
            skeleton={<EntityListSkeleton rows={2} />}
            empty={!bands || bands.thinking.length === 0}
          >
            {null}
          </BandFrame>
        )}
      </div>
    </div>
  )
}

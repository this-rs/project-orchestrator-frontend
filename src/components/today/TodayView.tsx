import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton, SkeletonLine, EntityListSkeleton, EmptyState, Button, focusRing, surface } from '@/components/ui'
import { pressFeedback } from '@/components/ui/classes'
import type {
  AttentionResponse,
  AttentionThread,
  Band,
  WaitingRequest,
} from '@/types/attention'
import { workspacePath } from '@/utils/paths'
import { AttentionCard, type AnswerResult } from './AttentionCard'
import { MiniGraphLegend } from './MiniThreadGraph'
import { PlanRunRow } from './PlanRunRow'
import { ThinkingList, useThinkingCollapsed } from './ThinkingList'
import { ThreadRow, ThreadRowList } from './ThreadRow'
import {
  BAND_TEXT,
  SECTION_ORDER,
  TODAY_TEXT,
  buildBands,
  linkNames,
  type StuckEntry,
  type WaitingEntry,
} from './bands'
import { recommendStart, type StartHere } from './startHere'

/**
 * The day's view, assembled. Presentation only: data and actions come from a
 * `TodaySource` (the live `useAttention`).
 *
 * Structure: a header (title above, one summary line of clickable counters, the
 * workspace chips), "Commence par ça" (ONE recommendation, see `startHere.ts`), then
 * four sections: À traiter, En cours (grouped by plan), À reprendre, À suivre (folded).
 *
 * Rules kept here (DESIGN.md §8):
 * - fixed section order: DOM order = tab order = phone order (À traiter, À reprendre,
 *   En cours, À suivre); from 1024 px "En cours" sits on the right of the first two;
 * - an empty section shrinks to ONE soft line, it is never hidden;
 * - first load: skeletons with the final shape of each section, no centred spinner;
 * - a failed source degrades ITS section only; the others stay usable;
 * - no entrance animation on sections or rows.
 */

export interface TodaySource {
  status: 'loading' | 'ready' | 'error'
  data: AttentionResponse | null
  /** Why the page could not load, or why the last refresh failed. */
  error: Error | null
  refresh: () => void
  /** The data on screen is the previous lane's: dim it and make it inert until the new one arrives. */
  switching?: boolean
  notices: Record<string, string>
  drafts: Record<string, string>
  setDraft: (id: string, text: string) => void
  answerPermission: (req: WaitingRequest, allow: boolean) => Promise<boolean | 'orphaned'>
  sendReply: (req: WaitingRequest, content: string) => Promise<boolean>
  resumeRun: (thread: AttentionThread) => Promise<boolean>
  /** A `user_message` to a session (resumes a dead one). Throws on failure. */
  sendMessage: (sessionId: string, text: string) => Promise<void>
}

// ---------------------------------------------------------------------------
// Section frame
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
  /** Whole-section load state. */
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
  const showEmptyLine = state === 'ready' && empty && !degraded
  return (
    <section aria-label={title} id={`today-${band}`} data-band={band} data-state={state} className={`min-w-0 scroll-mt-4 ${className}`}>
      {/* An empty section is ONE line: its title, its count and "nothing" side by side. */}
      <div className={`flex flex-wrap items-baseline gap-x-3 ${showEmptyLine ? 'py-1' : 'mb-1'}`}>
        <h2 className="flex items-baseline gap-2 text-sm font-semibold text-gray-200">
          <span>{title}</span>
          {count !== null && <span className="text-xs font-normal tabular-nums text-gray-400">{count}</span>}
        </h2>
        {showEmptyLine && <p className="text-sm text-gray-400">{emptyText}</p>}
      </div>
      {state === 'loading' ? (
        skeleton
      ) : state === 'error' ? (
        <ErrorLine onRetry={onRetry}>{errorText ?? TODAY_TEXT.bandError}</ErrorLine>
      ) : (
        <>
          {degraded && <ErrorLine onRetry={onRetry}>{degraded}</ErrorLine>}
          {empty ? (degraded ? <p className="py-1 text-sm text-gray-400">{emptyText}</p> : null) : children}
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
// Header: the one-line summary
// ---------------------------------------------------------------------------

/** Scrolls to a section without animation (the page has none), moving focus to it for keyboard users. */
function goToSection(band: Band) {
  const el = document.getElementById(`today-${band}`)
  if (!el) return
  el.scrollIntoView?.({ block: 'start' })
}

/**
 * « 2 à traiter · 3 en cours · 2 à reprendre · 4 à suivre »: each count is a button that
 * brings its section into view (and opens "À suivre", which is folded by default).
 */
export function TodaySummary({
  counts,
  onGo = goToSection,
}: {
  counts: Record<Band, number> | null
  onGo?: (band: Band) => void
}) {
  return (
    <ul aria-label={TODAY_TEXT.summaryLabel} className="flex flex-wrap items-center gap-x-1 text-sm text-gray-400">
      {SECTION_ORDER.map((b, i) => (
        <li key={b} className="flex items-center gap-x-1" data-counter={b}>
          {i > 0 && (
            <span aria-hidden="true" className="text-gray-500">
              ·
            </span>
          )}
          <button
            type="button"
            onClick={() => onGo(b)}
            className={`inline-flex min-h-9 items-baseline gap-1.5 rounded-lg px-2 hover:bg-white/[0.06] hover:text-gray-200 ${pressFeedback} ${focusRing}`}
          >
            {counts ? (
              <span className="tabular-nums font-medium text-gray-100">{counts[b]}</span>
            ) : (
              <Skeleton className="h-3 w-4 self-center" />
            )}{' '}
            <span>{BAND_TEXT[b].summary}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export const START_TEXT = {
  title: 'Commence par ça',
  why: 'Pourquoi',
  noThread: 'Sans fil',
  go: (section: string) => `Voir en haut de « ${section} »`,
} as const

/**
 * The recommendation is a POINTER, not a second copy of the card: the item itself lives, once, at
 * the top of its section (both sections are ordered oldest first, and so is the recommendation).
 */
function StartPointer({
  start,
  laneName,
  onGo,
}: {
  start: Extract<StartHere, { kind: 'waiting' | 'stuck' }>
  laneName: (slug: string) => string
  onGo: (band: Band) => void
}) {
  const band: Band = start.kind === 'waiting' ? 'waiting' : 'stuck'
  let what: string
  if (start.kind === 'waiting') {
    const { request, thread } = start.entry
    what = `${laneName(request.workspace)} · ${thread?.title ?? START_TEXT.noThread}`
  } else {
    const e = start.entry
    what = e.kind === 'unattached' ? e.session.title : e.thread.title
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p data-testid="start-what" className="min-w-0 break-words text-sm text-gray-100">
        {what}
      </p>
      <button
        type="button"
        onClick={() => onGo(band)}
        className={`inline-flex min-h-9 items-center rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 text-sm text-gray-100 hover:bg-white/[0.1] ${pressFeedback} ${focusRing}`}
      >
        {START_TEXT.go(BAND_TEXT[band].title)}
      </button>
    </div>
  )
}

export interface TodayViewProps {
  source: TodaySource
  /** Active workspace slug (filter) or null for all. */
  lane: string | null
  /** Where "plans" leads: any workspace slug the user can reach. */
  plansSlug: string | null
  onClearLane: () => void
  /** The workspace chips, placed under the summary. */
  lanePicker?: ReactNode
  /** Note under the chips when a workspace is selected. */
  laneNote?: string | null
  /**
   * Slot for the discussions of a plan's thread ("En cours"). The "Discussions" button of a
   * row exists only when this is provided.
   */
  renderDiscussions?: (thread: AttentionThread) => ReactNode
  /**
   * Slot of "Rattacher à…" for a session WITHOUT a thread ("sans fil") in À traiter and À reprendre
   * (and the loose live sessions of En cours). No slot, no button.
   */
  renderAttach?: (target: { sessionId: string; workspace: string }) => ReactNode
}

export function TodayView({ source, lane, plansSlug, onClearLane, lanePicker, laneNote, renderDiscussions, renderAttach }: TodayViewProps) {
  const { status, data, error, refresh } = source
  const bands = data ? buildBands(data) : null
  const errors = data?.source_errors ?? []
  const laneName = (slug: string) => data?.lanes.find((l) => l.slug === slug)?.name ?? slug
  const thinkingFold = useThinkingCollapsed()

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

  const go = (b: Band) => {
    if (b === 'thinking') thinkingFold.setCollapsed(false)
    goToSection(b)
  }

  const summary = (
    <div className="space-y-2">
      <TodaySummary counts={bands ? bands.counts : null} onGo={go} />
      {lanePicker}
      {laneNote && <p className="text-xs text-gray-400">{laneNote}</p>}
      {status === 'ready' && error && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-300">
          <span>{TODAY_TEXT.staleRefresh}</span>
          <Button variant="secondary" size="sm" onClick={refresh}>
            {TODAY_TEXT.retry}
          </Button>
        </div>
      )}
    </div>
  )

  // Truly nothing anywhere (and no source failed): one composed empty state.
  if (state === 'ready' && bands?.empty && errors.length === 0) {
    return (
      <div className="space-y-6">
        {summary}
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
              // No workspace to open plans in (first launch): the way to create one.
              <Link
                to={plansSlug ? workspacePath(plansSlug, '/plans') : '/workspace-selector'}
                className={`inline-flex min-h-9 items-center rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-gray-200 hover:bg-white/[0.08] ${focusRing}`}
              >
                {plansSlug ? TODAY_TEXT.plans : TODAY_TEXT.createWorkspace}
              </Link>
            }
          />
        )}
      </div>
    )
  }

  const names = data ? linkNames(data) : undefined

  // The same card for a request wherever it is shown (recommendation or section).
  const renderWaiting = ({ request, thread, unattached }: WaitingEntry) => {
    const session =
      thread?.sessions.find((s) => s.id === request.session_id) ??
      (unattached ? { title: unattached.title, state: unattached.state } : null)
    return (
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
        attachSlot={renderAttach?.({ sessionId: request.session_id, workspace: request.workspace })}
      />
    )
  }

  const renderStuck = (e: StuckEntry) => {
    if (!data) return null
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
          attachSlot={renderAttach?.({ sessionId: e.orphan.session_id, workspace: e.thread.workspace })}
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
        attachSlot={renderAttach?.({ sessionId: e.session.id, workspace: e.session.workspace_slug })}
      />
    )
  }

  const incomplete = errors.flatMap((e) => e.bands)
  const start = bands && state === 'ready' ? recommendStart(bands, incomplete) : null

  return (
    <div className="space-y-6">
      {summary}

      <div aria-busy={source.switching || undefined} className={`space-y-6 ${source.switching ? 'pointer-events-none opacity-60' : ''}`}>
      {/* "Commence par ça": one recommendation, and why. Plain section, the item keeps its own card. */}
      {(state === 'loading' || start) && (
        <section aria-label={START_TEXT.title} data-start={start?.kind ?? 'loading'} className="min-w-0 space-y-2">
          <h2 className="text-sm font-semibold text-gray-200">{START_TEXT.title}</h2>
          {!start ? (
            <div role="status" aria-label="Chargement" className="space-y-2">
              <SkeletonLine width="60%" className="h-4" />
              <SkeletonLine width="80%" className="h-3" />
            </div>
          ) : (
            <>
              {(start.kind === 'calm' || start.kind === 'incomplete' || start.kind === 'empty') && (
                <p data-testid="start-title" className="text-sm text-gray-100">
                  {start.title}
                </p>
              )}
              <p data-testid="start-why" className="text-xs text-gray-300">
                {START_TEXT.why} : {start.why}
              </p>
              {(start.kind === 'waiting' || start.kind === 'stuck') && (
                <StartPointer start={start} laneName={laneName} onGo={go} />
              )}
            </>
          )}
        </section>
      )}

      {/* DOM order = visual order = tab order. Phone: one column in this order. */}
      <div data-testid="sections" className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <BandFrame
          {...common('waiting')}
          className="lg:col-start-1 lg:row-start-1"
          count={bands ? bands.counts.waiting : null}
          skeleton={
            <div className="space-y-3">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          }
          empty={!bands || bands.waiting.length === 0}
        >
          <ul aria-label="Demandes à traiter" className="space-y-3">
            {bands?.waiting.map((entry) => (
              <li key={entry.request.request_id}>{renderWaiting(entry)}</li>
            ))}
          </ul>
        </BandFrame>

        <BandFrame
          {...common('stuck')}
          className="lg:col-start-1 lg:row-start-2"
          count={bands ? bands.counts.stuck : null}
          skeleton={<ThreadRowsSkeleton />}
          empty={!bands || bands.stuck.length === 0}
        >
          {bands && (
            <>
              <ThreadRowList label="Fils à reprendre">{bands.stuck.map(renderStuck)}</ThreadRowList>
              {bands.stuck.some((e) => e.kind !== 'unattached') && <MiniGraphLegend />}
            </>
          )}
        </BandFrame>

        <BandFrame
          {...common('running')}
          className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
          count={bands ? bands.counts.running : null}
          skeleton={<ThreadRowsSkeleton />}
          empty={!bands || bands.running.length === 0}
        >
          {bands && (
            <>
            <ThreadRowList label="Plans en cours">
              {bands.running.map((e) =>
                e.kind === 'plan' ? (
                  <PlanRunRow
                    key={e.key}
                    thread={e.thread}
                    others={e.others.length}
                    laneName={laneName(e.thread.workspace)}
                    renderDiscussions={renderDiscussions}
                  />
                ) : (
                  <ThreadRow
                    key={e.session.id}
                    variant="unattached"
                    session={e.session}
                    laneName={laneName(e.session.workspace_slug)}
                    onSendMessage={source.sendMessage}
                    attachSlot={renderAttach?.({ sessionId: e.session.id, workspace: e.session.workspace_slug })}
                  />
                ),
              )}
            </ThreadRowList>
            {bands.running.some((e) => e.kind === 'plan') && <MiniGraphLegend />}
            </>
          )}
        </BandFrame>

        {state === 'ready' && bands && bands.thinking.length > 0 ? (
          <div className="min-w-0 lg:col-span-2 lg:row-start-3">
            {degradedFor('thinking') && <ErrorLine onRetry={refresh}>{degradedFor('thinking')}</ErrorLine>}
            <ThinkingList
              items={bands.thinking}
              onChanged={refresh}
              title={BAND_TEXT.thinking.title}
              collapsed={thinkingFold.collapsed}
              onCollapsedChange={thinkingFold.setCollapsed}
              className=""
            />
          </div>
        ) : (
          <BandFrame
            {...common('thinking')}
            className="lg:col-span-2 lg:row-start-3"
            count={bands ? bands.counts.thinking : null}
            skeleton={<EntityListSkeleton rows={2} />}
            empty={!bands || bands.thinking.length === 0}
          >
            {null}
          </BandFrame>
        )}
      </div>
      </div>
    </div>
  )
}

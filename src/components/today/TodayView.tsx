import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton, SkeletonLine, EntityListSkeleton, EmptyState, Button, focusRing, focusRingInset, surface } from '@/components/ui'
import { pressFeedback } from '@/components/ui/classes'
import type {
  AttentionResponse,
  AttentionThread,
  Band,
  WaitingRequest,
} from '@/types/attention'
import { workspacePath } from '@/utils/paths'
import { AttentionCard, type AnswerResult } from './AttentionCard'
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
import { headline, recommendStart } from './startHere'
import { MiniBars, Ring, StackedBar } from './charts'
import { STATE_META } from './MiniThreadGraph'
import { countPlanStates, type StateCounts } from './PlanStateBar'
import { TONE_CLASSES } from '@/components/ui/statusMeta'
import { THINKING_KINDS } from '@/types/attention'

/**
 * The day's view, assembled. Presentation only: data and actions come from a
 * `TodaySource` (the live `useAttention`).
 *
 * Structure:
 * - a HEADER that says the day in one sentence, in large type (`headline`, from the same rule
 *   that used to feed "Commence par ça"), with the workspace filter and four counters that are
 *   also the anchors of the sections;
 * - "what depends on you" on the left: À traiter (request cards), À reprendre (rows), then the
 *   user's own tasks (`daySlot`);
 * - "what advances without you" on the right: the plans that run, the assistants (`liveSlot`),
 *   and À lire (folded). From a wide container the right column stays in view while the left scrolls.
 *
 * Rules kept here (DESIGN.md §8):
 * - fixed section order: DOM order = tab order = phone order (À traiter, À reprendre, the day,
 *   En cours, the assistants, À lire);
 * - the two columns follow the width of the CONTAINER, not of the window: the chat panel, once
 *   open, takes its width from the content;
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

/** A panel of the dashboard: one surface per section, never nested. */
export const PANEL = 'rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5'

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
  /** Draw the section as a panel of the dashboard (a surface with its own padding). */
  panel?: boolean
  className?: string
  children: ReactNode
}

function BandFrame({ band, count, state, errorText, degraded, onRetry, skeleton, empty, panel, className = '', children }: BandFrameProps) {
  const { title, empty: emptyText } = BAND_TEXT[band]
  const showEmptyLine = state === 'ready' && empty && !degraded
  return (
    <section aria-label={title} id={`today-${band}`} data-band={band} data-state={state} className={`min-w-0 scroll-mt-4 ${panel ? PANEL : ''} ${className}`}>
      {/* An empty section is ONE line: its title, its count and "nothing" side by side. */}
      <div className={`flex flex-wrap items-baseline gap-x-3 ${showEmptyLine ? '' : 'mb-2'}`}>
        <h2 className="flex items-baseline gap-2 text-base font-semibold tracking-tight text-gray-100">
          <span>{title}</span>
          {count !== null && count > 0 && <span className="text-sm font-normal tabular-nums text-gray-400">{count}</span>}
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
            <Skeleton className="mt-1.5 h-2 w-2 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonLine width="55%" className="h-3.5" />
              <SkeletonLine width="35%" className="h-2.5" />
            </div>
          </div>
          <Skeleton className="ml-4 h-1.5 w-full rounded-full" />
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

/** Ring segments of a set of tasks, in reading order: finished, moving, waiting on the user, stopped. */
function ringSegments(c: StateCounts) {
  return (['done', 'running', 'waiting', 'blocked', 'failed'] as const).map((st) => ({ value: c[st], className: TONE_CLASSES[STATE_META[st].tone].text }))
}
/** States named next to the header's ring ("faites" is its headline number). */
const OVERVIEW_ORDER = ['running', 'waiting', 'blocked', 'failed', 'pending'] as const
/** One tone per kind of thing to read (RFC, decision, note, alert), same order as `THINKING_KINDS`. */
const KIND_TONES = ['text-violet-400', 'text-sky-400', 'text-gray-400', 'text-amber-400']

/** What each counter says when it is not zero: the colour of its number. Zero is always quiet. */
const COUNT_TONE: Record<Band, string> = {
  waiting: 'text-sky-300',
  stuck: 'text-amber-300',
  running: 'text-indigo-300',
  thinking: 'text-gray-100',
}

/**
 * The four counters of the day, as the bottom edge of the header: a number in large type, what
 * it counts, and one line of what that means. Each is a button that brings its section into view
 * (and opens "À lire", folded by default).
 */
export function TodaySummary({
  counts,
  onGo = goToSection,
  visuals,
}: {
  counts: Record<Band, number> | null
  onGo?: (band: Band) => void
  /** A small chart per counter (decorative: the number and the words say the same). */
  visuals?: Partial<Record<Band, ReactNode>>
}) {
  return (
    <ul aria-label={TODAY_TEXT.summaryLabel} className="grid grid-cols-2 @2xl/today:grid-cols-4">
      {SECTION_ORDER.map((b) => {
        const n = counts ? counts[b] : null
        return (
          <li key={b} data-counter={b} className="min-w-0 border-white/[0.07] odd:border-r @2xl/today:border-r @2xl/today:last:border-r-0 [&:nth-child(-n+2)]:border-b @2xl/today:[&:nth-child(-n+2)]:border-b-0">
            <button
              type="button"
              onClick={() => onGo(b)}
              className={`flex h-full w-full min-w-0 items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.04] ${pressFeedback} ${focusRingInset}`}
            >
              <span className="flex min-w-0 flex-col items-start gap-0.5">
              <span className="flex items-baseline gap-2">
                {n !== null ? (
                  <span className={`text-3xl font-semibold leading-8 tabular-nums tracking-tight ${n > 0 ? COUNT_TONE[b] : 'text-gray-500'}`}>{n}</span>
                ) : (
                  <Skeleton className="h-7 w-6" />
                )}{' '}
                <span className="text-sm font-medium text-gray-200">{BAND_TEXT[b].summary}</span>
              </span>
              <span className="hidden text-xs leading-4 text-gray-400 @md/today:block">{BAND_TEXT[b].hint}</span>
              </span>
              {n !== null && n > 0 && visuals?.[b] && <span className={`shrink-0 ${COUNT_TONE[b]}`}>{visuals[b]}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

/** Today's date in words: "dimanche 4 octobre". */
function todayLabel(now = new Date()): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)
}

export interface TodayViewProps {
  source: TodaySource
  /** Active workspace slug (filter) or null for all. */
  lane: string | null
  /** Where "plans" leads: any workspace slug the user can reach. */
  plansSlug: string | null
  onClearLane: () => void
  /** The workspace filter, placed at the right of the headline. */
  lanePicker?: ReactNode
  /** Note under the headline when a workspace is selected. */
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
  /**
   * The user's own work for the day (day plan, tasks). Placed right under the queue,
   * never above it; shown in every state of the page, the empty one included.
   */
  daySlot?: ReactNode
  /**
   * Slot for the assistants running now (components/today/live). It sits in the right column,
   * under the plans that run, and on a phone comes after the queue and the day: it says who is
   * running, which is not what the user is asked to do, so it never sits above the queue.
   */
  liveSlot?: ReactNode
}

export function TodayView({ source, lane, plansSlug, onClearLane, lanePicker, laneNote, renderDiscussions, renderAttach, daySlot, liveSlot }: TodayViewProps) {
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

  const incomplete = errors.flatMap((e) => e.bands)
  const start = bands && state === 'ready' ? recommendStart(bands, incomplete, data?.runner ?? null) : null
  const head = start && bands ? headline(start, bands) : null

  // Every task of every plan on the page, by state: the ring of the header.
  const all = data ? countPlanStates(data.threads.flatMap((t) => t.waves)) : null
  const planCount = data ? new Set(data.threads.filter((t) => t.plan).map((t) => t.plan!.id)).size : 0
  const pct = all && all.total > 0 ? Math.round((all.done / all.total) * 100) : 0

  const runningWaves = bands ? bands.running.flatMap((e) => (e.kind === 'plan' ? [e.thread, ...e.others].flatMap((t) => t.waves) : [])) : []
  const runningStates = countPlanStates(runningWaves)
  const kinds = bands ? THINKING_KINDS.map((k) => bands.thinking.filter((i) => i.kind === k).length) : []
  const visuals: Partial<Record<Band, ReactNode>> = bands
    ? {
        // how long each request has waited: one bar per request, the tallest is the oldest
        waiting: <MiniBars values={bands.waiting.map((e) => e.request.age_secs)} />,
        stuck: <MiniBars values={bands.stuck.map((e) => (e.kind === 'unattached' ? e.session.age_secs : e.kind === 'orphan' ? e.orphan.age_secs : e.thread.age_secs))} />,
        running: runningStates.total > 0 ? <Ring size={30} stroke={4} total={runningStates.total} segments={ringSegments(runningStates)} /> : undefined,
        thinking: (
          <span className="block w-14">
            <StackedBar segments={kinds.map((v, i) => ({ value: v, className: KIND_TONES[i] }))} />
          </span>
        ),
      }
    : {}

  // The header: the day in one sentence, the filter, the state of every plan, the four counters. It is the page's title.
  const header = (
    <header
      data-testid="today-header"
      data-start={start?.kind ?? (state === 'loading' ? 'loading' : 'error')}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[radial-gradient(80%_160%_at_0%_0%,rgba(99,102,241,0.18),transparent_60%),radial-gradient(60%_120%_at_100%_0%,rgba(56,189,248,0.07),transparent_60%)] bg-white/[0.02]"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pt-4 @2xl/today:px-5">
        <h1 className="text-xs font-medium text-gray-400">
          {TODAY_TEXT.title} <span className="font-normal text-gray-500">· {todayLabel()}</span>
        </h1>
        {lanePicker && <div className="min-w-0 max-w-full">{lanePicker}</div>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-4 pb-5 pt-2 @2xl/today:px-5">
        <div className="min-w-0 flex-[1_1_20rem]">
          {head ? (
            <>
              <p data-testid="start-title" className="text-2xl font-semibold leading-8 tracking-tight text-gray-50 text-balance @2xl/today:text-[2rem] @2xl/today:leading-10">
                {head.title}
              </p>
              <p data-testid="start-why" className="mt-1 text-sm text-gray-300">
                {head.why}
              </p>
            </>
          ) : state === 'loading' ? (
            <div role="status" aria-label="Chargement" className="space-y-2">
              <SkeletonLine width="60%" className="h-8" />
              <SkeletonLine width="40%" className="h-4" />
            </div>
          ) : (
            <p className="text-2xl font-semibold leading-8 tracking-tight text-gray-50">{TODAY_TEXT.title}</p>
          )}
          {laneNote && <p className="mt-2 text-xs text-gray-400">{laneNote}</p>}
          {status === 'ready' && error && (
            <div role="alert" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-300">
              <span>{TODAY_TEXT.staleRefresh}</span>
              <Button variant="secondary" size="sm" onClick={refresh}>
                {TODAY_TEXT.retry}
              </Button>
            </div>
          )}
        </div>

        {all && all.total > 0 && (
          <div data-testid="today-overview" className="flex shrink-0 items-center gap-4">
            <Ring size={92} stroke={9} total={all.total} segments={ringSegments(all)}>
              <span className="text-xl font-semibold leading-6 tabular-nums text-gray-50">{pct} %</span>
            </Ring>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-100">
                <span className="tabular-nums">
                  {all.done}/{all.total}
                </span>{' '}
                tâches faites
              </p>
              <p className="text-xs text-gray-400">
                sur {planCount} {planCount === 1 ? 'plan' : 'plans'} suivis ici
              </p>
              <ul className="mt-1.5 flex max-w-[16rem] flex-wrap gap-x-3 gap-y-0.5 text-xs leading-4">
                {OVERVIEW_ORDER.filter((st) => all[st] > 0).map((st) => (
                  <li key={st} className={`inline-flex items-center gap-1.5 ${TONE_CLASSES[STATE_META[st].tone].text}`}>
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONE_CLASSES[STATE_META[st].tone].dot}`} />
                    {all[st]} {all[st] === 1 ? STATE_META[st].one : STATE_META[st].many}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-white/[0.07]">
        <TodaySummary counts={bands ? bands.counts : null} onGo={go} visuals={visuals} />
      </div>
    </header>
  )

  // Truly nothing anywhere (and no source failed): one composed empty state.
  if (state === 'ready' && bands?.empty && errors.length === 0) {
    return (
      <div className="@container/today space-y-5">
        {header}
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
        {daySlot}
      </div>
    )
  }

  const names = data ? linkNames(data) : undefined

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

  return (
    <div className="@container/today space-y-5">
      {header}

      <div aria-busy={source.switching || undefined} className={source.switching ? 'pointer-events-none opacity-60' : ''}>
        {/* DOM order = visual order = tab order. Narrow container: one column in this order. */}
        <div data-testid="sections" className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-5 @4xl/today:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @4xl/today:items-start">
          <div data-testid="sections-main" className="min-w-0 space-y-5">
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
              <ul aria-label="Demandes à traiter" className="space-y-3">
                {bands?.waiting.map((entry) => (
                  <li key={entry.request.request_id}>{renderWaiting(entry)}</li>
                ))}
              </ul>
            </BandFrame>

            <BandFrame
              {...common('stuck')}
              panel
              count={bands ? bands.counts.stuck : null}
              skeleton={<ThreadRowsSkeleton />}
              empty={!bands || bands.stuck.length === 0}
            >
              {bands && <ThreadRowList label="Travaux à reprendre">{bands.stuck.map(renderStuck)}</ThreadRowList>}
            </BandFrame>

            {daySlot}
          </div>

          <div data-testid="sections-side" className="min-w-0 space-y-5 @4xl/today:sticky @4xl/today:top-4">
            <BandFrame
              {...common('running')}
              panel
              count={bands ? bands.counts.running : null}
              skeleton={<ThreadRowsSkeleton />}
              empty={!bands || bands.running.length === 0}
            >
              {bands && (
                <ThreadRowList label="Plans en cours">
                  {bands.running.map((e) =>
                    e.kind === 'plan' ? (
                      <PlanRunRow
                        key={e.key}
                        thread={e.thread}
                        others={e.others}
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
              )}
            </BandFrame>

            {liveSlot}

            {state === 'ready' && bands && bands.thinking.length > 0 ? (
              <div className={`min-w-0 ${PANEL} py-1.5!`}>
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
                panel
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
    </div>
  )
}

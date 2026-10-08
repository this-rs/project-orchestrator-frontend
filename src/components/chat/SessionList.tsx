import { useReferenceSource } from '@/refs/source'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { chatSessionRefreshAtom, providersAtom, showSpawnedSessionsAtom } from '@/atoms'
import { isClaudeCodeProvider, type ProviderInstance } from '@/types/provider'
import { describeSessionProvider, shouldShowProviderBadge } from '@/constants/providers'
import { ProviderBadge } from './ProviderBadge'
import { CostDisplay } from '@/components/ui/CostDisplay'
import { costReport, formatUsd2 } from '@/utils/cost'
import { chatApi, getEventBus, workspacesApi } from '@/services'
import { useActiveRunTracker, useDetachedRuns, useWorkspaceSlug } from '@/hooks'
import type {
  ChatSession,
  ChatLinkedPlan,
  ChatLinkedRfc,
  ChatLinkedTask,
  CrudEvent,
  MessageSearchResult,
  Project,
  SessionActivity,
} from '@/types'
import type { ActivityStatus } from './sessionActivity'
import {
  anyLive,
  applySnapshot,
  applyStreamingEvent,
  applyWindow,
  describeActivity,
} from './sessionActivity'
import { Button, Select, PulseIndicator, StatusDot, Switch } from '@/components/ui'
import { glassFlat, iconButton } from '@/components/ui/classes'
import { workspacePath } from '@/utils/paths'
import {
  Box,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Folder,
  GitBranch,
  Hexagon,
  ListChecks,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Play,
  ScrollText,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import {
  countActiveFilters,
  formatAbsolute,
  formatDuration,
  formatMessageCount,
  formatRelativeShort,
  groupSessionsByDate,
  permissionModeMeta,
  pluralize,
  sessionDisplayTitle,
  sessionPreview,
  sessionScope,
  shortModelName,
  shortenPath,
  spawnLabel,
} from './sessionListUtils'

interface SessionListProps {
  activeSessionId?: string | null
  onSelect: (sessionId: string, targetMessageTurnIndex?: number, title?: string, searchHit?: { snippet: string; createdAt: number; role: 'user' | 'assistant' }) => void
  onClose: () => void
  /** When true, hides the header + "New conversation" button (parent provides them) */
  embedded?: boolean
}

const SESSION_PAGE_SIZE = 30

/**
 * How often the list re-reads live activity from the server — and only while
 * it believes something is running. When every conversation is quiet, no
 * request is sent at all.
 *
 * It exists because CRUD events are not a reliable channel for this: a list
 * mounted mid-turn never receives the "started" event, and a dropped "stopped"
 * event would otherwise leave a "Working…" that nothing can clear. Polling the
 * in-memory snapshot is what makes both impossible.
 */
const ACTIVITY_POLL_MS = 5_000

/**
 * How a fetch is allowed to disturb what the user is looking at.
 *
 * `reconcile` is the one that matters. Every `chat_session` CRUD event used to
 * run the `initial` path: it raised the global spinner, which *unmounts* the
 * whole list — collapsing every expanded row and re-firing one
 * `useDetachedRuns` request per row — and reset the paging offset, so the list
 * silently shrank back to one page and the scroll position jumped. A
 * conversation merely changing state repainted everything.
 *
 * `reconcile` re-reads exactly the window already on screen, shows no spinner,
 * and hands React the same rows so only what changed re-renders.
 */
type FetchMode = 'initial' | 'more' | 'reconcile'

/** Shared typography for every secondary line — one size, one muted colour. */
const META = 'text-[11px] leading-4 text-gray-500'

/** Middle-dot separator between metadata items (decorative). */
function Sep() {
  return <span aria-hidden="true" className="text-gray-700 px-1">·</span>
}

// ============================================================================
// Linked entities (plan / task / RFC) — plain links with a coloured icon
// ============================================================================

const COMPACT_THRESHOLD = 3 // total linked entities to trigger compact mode

type LinkedKind = 'plan' | 'rfc' | 'task'

const LINK_META: Record<LinkedKind, { icon: typeof ClipboardList; color: string; label: string; path: string }> = {
  plan: { icon: ClipboardList, color: 'text-blue-400', label: 'Plan', path: 'plans' },
  rfc: { icon: ScrollText, color: 'text-purple-400', label: 'RFC', path: 'notes' },
  task: { icon: ListChecks, color: 'text-amber-400/80', label: 'Task', path: 'tasks' },
}

/* po-ref: plan rfc task */
function EntityLink({ kind, id, title, source, wsSlug }: { kind: LinkedKind; id: string; title: string; source?: string; wsSlug: string }) {
  const meta = LINK_META[kind]
  // The chip is a native <a>: draggable already; declared so the drag carries the entity, not the URL. Keyboard: Alt+Shift+A on focus.
  const refSource = useReferenceSource({ kind, id, label: title })
  const Icon = meta.icon
  return (
    <a
      {...refSource}
      href={workspacePath(wsSlug, `/${meta.path}/${id}`)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      title={`${meta.label}: ${title}${source ? ` (${source})` : ''}`}
      aria-label={`${meta.label}: ${title}`}
      className="inline-flex items-center gap-1 min-w-0 max-w-[14rem] rounded text-gray-400 hover:text-gray-200 hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60"
    >
      <Icon className={`w-3 h-3 shrink-0 ${meta.color}`} aria-hidden="true" />
      <span className="truncate">{title}</span>
    </a>
  )
}

function CountChip({ kind, count }: { kind: LinkedKind; count: number }) {
  const meta = LINK_META[kind]
  const Icon = meta.icon
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums text-gray-400" aria-label={pluralize(count, meta.label)}>
      <Icon className={`w-3 h-3 ${meta.color}`} aria-hidden="true" />
      {count}
    </span>
  )
}

/**
 * Context line: working directory + linked plans/RFCs/tasks.
 * Few entities → inline links. Many → per-kind counters + "more" toggle
 * revealing the full, grouped list.
 */
function ContextLine({
  plans, rfcs, tasks, wsSlug, cwd,
}: {
  plans?: ChatLinkedPlan[]
  rfcs?: ChatLinkedRfc[]
  tasks?: ChatLinkedTask[]
  wsSlug: string | null
  cwd?: string | null
}) {
  const [expanded, setExpanded] = useState(false)

  // Without an active workspace we cannot build entity URLs (same as before).
  const planList = wsSlug ? plans ?? [] : []
  const rfcList = wsSlug ? rfcs ?? [] : []
  const taskList = wsSlug ? tasks ?? [] : []
  const total = planList.length + rfcList.length + taskList.length

  if (!cwd && total === 0) return null

  const cwdEl = cwd ? (
    <span className="inline-flex items-center gap-1 min-w-0 shrink text-gray-600" title={cwd}>
      <Folder className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{shortenPath(cwd)}</span>
    </span>
  ) : null

  const compact = total > COMPACT_THRESHOLD

  return (
    <div className={`${META} mt-1 min-w-0`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
        {cwdEl}
        {!compact && (
          <>
            {planList.map((p) => <EntityLink key={p.id} kind="plan" id={p.id} title={p.title} source={p.source} wsSlug={wsSlug!} />)}
            {rfcList.map((r) => <EntityLink key={r.id} kind="rfc" id={r.id} title={r.title} wsSlug={wsSlug!} />)}
            {taskList.map((t) => <EntityLink key={t.id} kind="task" id={t.id} title={t.title} source={t.source} wsSlug={wsSlug!} />)}
          </>
        )}
        {compact && (
          <span className="inline-flex items-center gap-2 shrink-0">
            {planList.length > 0 && <CountChip kind="plan" count={planList.length} />}
            {rfcList.length > 0 && <CountChip kind="rfc" count={rfcList.length} />}
            {taskList.length > 0 && <CountChip kind="task" count={taskList.length} />}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
              onKeyDown={(e) => e.stopPropagation()}
              aria-expanded={expanded}
              className="px-1 -mx-1 rounded text-indigo-400/80 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60"
            >
              {expanded ? 'less' : 'more'}
            </button>
          </span>
        )}
      </div>

      {compact && expanded && (
        <div className="mt-1.5 pl-2 border-l border-white/[0.06] space-y-1">
          {(['plan', 'rfc', 'task'] as const).map((kind) => {
            const items: { id: string; title: string; source?: string }[] =
              kind === 'plan' ? planList : kind === 'rfc' ? rfcList : taskList
            if (items.length === 0) return null
            return (
              <div key={kind} className="flex flex-col gap-0.5 min-w-0">
                {items.map((it) => (
                  <EntityLink key={it.id} kind={kind} id={it.id} title={it.title} source={it.source} wsSlug={wsSlug!} />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Expandable children (detached runs spawned by this session)
// ============================================================================

function ChildrenIndicator({ sessionId, onSelect }: { sessionId: string; onSelect: (id: string, turnIndex?: number, title?: string) => void }) {
  const { runs, isLoading } = useDetachedRuns(sessionId)
  const [expanded, setExpanded] = useState(false)

  if (isLoading || runs.length === 0) return null
  const anyStreaming = runs.some((r) => r.isStreaming)

  return (
    <div className={`${META} mt-1`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1 rounded text-amber-400/80 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? '' : '-rotate-90'}`} aria-hidden="true" />
        {anyStreaming ? <PulseIndicator variant="pending" size={6} /> : <GitBranch className="w-3 h-3" aria-hidden="true" />}
        <span>{runs.length} child{runs.length > 1 ? 'ren' : ''}</span>
      </button>

      {expanded && (
        <ul className="mt-1 ml-1.5 border-l border-white/[0.06] pl-2">
          {runs.map((run) => (
            <li key={run.sessionId}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelect(run.sessionId, undefined, run.title) }}
                onKeyDown={(e) => e.stopPropagation()}
                className="w-full text-left flex items-center gap-1.5 py-1 px-1 rounded hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60"
              >
                {run.isStreaming ? <PulseIndicator variant="active" size={6} /> : <StatusDot tone="muted" />}
                <span className="text-gray-400 truncate flex-1">{run.title}</span>
                <span className="text-gray-600 tabular-nums shrink-0">{formatDuration(run.startedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ============================================================================
// One row
// ============================================================================

/** Colour per activity tone — `blocked` is the one the user must act on. */
const ACTIVITY_TONE: Record<ActivityStatus['tone'], string> = {
  blocked: 'text-amber-300',
  working: 'text-emerald-400/80',
  watching: 'text-sky-400/80',
}

/**
 * The rename field, owning its own draft.
 *
 * Keeping the draft here rather than in `SessionList` is not tidiness: the
 * draft used to live in the list's state, so every keystroke re-rendered
 * every row of the list.
 */
function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string
  onCommit: (title: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Select after React has painted the input, as the old inline field did.
    const id = requestAnimationFrame(() => ref.current?.select())
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        // Stop ALL key events from bubbling to the row's onKeyDown, which
        // intercepts Space (navigate) and Enter (navigate).
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(draft)
        } else if (e.key === 'Escape') {
          onCancel()
        }
      }}
      onClick={(e) => e.stopPropagation()}
      aria-label="Conversation title"
      className="text-sm bg-white/[0.06] border border-indigo-500/40 rounded px-1.5 py-0.5 text-gray-200 focus:outline-none w-full min-w-0"
      autoFocus
    />
  )
}

const stopKeys = (e: React.KeyboardEvent) => e.stopPropagation()

interface SessionRowProps {
  session: ChatSession
  isActive: boolean
  /** What this conversation is doing now, or `null` when it is quiet. */
  status: ActivityStatus | null
  isEditing: boolean
  isMenuOpen: boolean
  isConfirmingDelete: boolean
  wsSlug: string | null
  /** Loaded provider instances, or `null` while unknown (then no instance is ever "missing"). */
  providers?: readonly ProviderInstance[] | null
  onSelect: (sessionId: string, turnIndex?: number, title?: string) => void
  onClose: () => void
  onStartRename: (sessionId: string) => void
  onCommitRename: (sessionId: string, title: string) => void
  onCancelRename: () => void
  onOpenMenu: (sessionId: string) => void
  onCloseMenu: () => void
  onRequestDelete: (sessionId: string) => void
  onDelete: (sessionId: string) => void
}

/**
 * A conversation row, memoised.
 *
 * This is what makes "only the state changes" true rather than merely
 * intended: when one conversation starts or stops working, every other row
 * gets identical props and React skips it entirely. All the callbacks below
 * are therefore kept referentially stable in `SessionList` — a fresh lambda
 * per render would silently defeat this.
 */
export const SessionRow = memo(function SessionRow({
  session,
  isActive,
  status,
  isEditing,
  isMenuOpen,
  isConfirmingDelete,
  wsSlug,
  providers = null,
  onSelect,
  onClose,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onOpenMenu,
  onCloseMenu,
  onRequestDelete,
  onDelete,
}: SessionRowProps) {
  const title = sessionDisplayTitle(session)
  const preview = sessionPreview(session)
  const scope = sessionScope(session)
  const mode = permissionModeMeta(session.permission_mode, {
    isClaudeCode: isClaudeCodeProvider(session.provider_id, session.provider_kind),
  })
  const cost = costReport(session.total_cost_usd, session.cost_basis)
  const provider = describeSessionProvider({ id: session.provider_id, kind: session.provider_kind }, providers)
  const showProvider = shouldShowProviderBadge(provider, providers)
  const spawn = session.spawned_by ? spawnLabel(session.spawned_by) : null
  const activate = () => { onCloseMenu(); if (isActive) { onClose() } else { onSelect(session.id, undefined, title) } }

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-current={isActive ? 'true' : undefined}
        aria-label={title}
        onClick={activate}
        onKeyDown={(e) => {
          // Only react to keys aimed at the row itself, not at nested controls
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() }
          else if (e.key === 'F2') { e.preventDefault(); onStartRename(session.id) }
        }}
        className={`relative flex items-start gap-1 pl-3 pr-1.5 py-2.5 cursor-pointer transition-colors outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-500/60 ${
          isActive
            ? 'bg-indigo-500/[0.08] shadow-[inset_2px_0_0_var(--color-indigo-500)]'
            : 'hover:bg-white/[0.03]'
        }`}
      >
        <div className="flex-1 min-w-0">
          {/* Line 1 — title (primary) + live dot + date (right, tabular) */}
          <div className="flex items-center gap-2 min-h-5">
            {status?.pulse && (
              <PulseIndicator variant={status.tone === 'blocked' ? 'pending' : 'active'} size={7} />
            )}
            {isEditing ? (
              <RenameInput
                initial={title}
                onCommit={(next) => onCommitRename(session.id, next)}
                onCancel={onCancelRename}
              />
            ) : (
              <span
                className={`flex-1 min-w-0 text-sm truncate ${isActive ? 'text-gray-100 font-medium' : 'text-gray-200'}`}
                onDoubleClick={(e) => { e.stopPropagation(); onStartRename(session.id) }}
              >
                {title}
              </span>
            )}
            {!isEditing && (
              <time
                dateTime={session.updated_at}
                title={formatAbsolute(session.updated_at)}
                className="shrink-0 text-[11px] tabular-nums text-gray-500"
              >
                {formatRelativeShort(session.updated_at)}
              </time>
            )}
          </div>

          {/* Line 2 — what it is doing now, else the preview.
              A running conversation always has a line here: before this, a
              session whose turn produced nothing (watching a log, waiting on
              a background command) showed only its stale preview, which reads
              exactly like a conversation that has stopped. */}
          {status ? (
            <div
              className={`text-xs leading-4 mt-0.5 flex items-center gap-1.5 min-w-0 ${ACTIVITY_TONE[status.tone]}`}
              title={status.detail}
            >
              {status.pulse && (
                <PulseIndicator variant={status.tone === 'blocked' ? 'pending' : 'active'} size={6} />
              )}
              <span className="truncate">{status.label}</span>
            </div>
          ) : preview ? (
            <div className="text-xs leading-4 text-gray-500 truncate mt-0.5">{preview}</div>
          ) : null}

          {/* Line 3 — metadata: scope · msgs · mode+model · cost · origin */}
          <div className={`${META} mt-1 flex flex-wrap items-center min-w-0`}>
            {scope && (
              <span
                className={`inline-flex items-center gap-1 min-w-0 max-w-[45%] ${scope.kind === 'workspace' ? 'text-purple-400/80' : 'text-indigo-400/80'}`}
                aria-label={`${scope.kind === 'workspace' ? 'Workspace' : 'Project'} ${scope.slug}`}
              >
                {scope.kind === 'workspace'
                  ? <Hexagon className="w-3 h-3 shrink-0" aria-hidden="true" />
                  : <Box className="w-3 h-3 shrink-0" aria-hidden="true" />}
                <span className="truncate">{scope.slug}</span>
              </span>
            )}
            {scope && <Sep />}
            <span className="tabular-nums whitespace-nowrap">{formatMessageCount(session.message_count)}</span>
            {showProvider && (
              <>
                <Sep />
                {/* The model has its own slot right after: the badge names the provider only. */}
                <ProviderBadge description={provider} />
              </>
            )}
            {session.model && (
              <>
                <Sep />
                <span className="inline-flex items-center gap-1 min-w-0" title={session.model}>
                  {mode && (
                    <span
                      role="img"
                      aria-label={mode.label}
                      title={mode.label}
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${mode.dot}`}
                    />
                  )}
                  <span className="truncate max-w-[9rem]">{shortModelName(session.model)}</span>
                </span>
              </>
            )}
            {!session.model && mode && (
              <>
                <Sep />
                <span role="img" aria-label={mode.label} title={mode.label} className={`w-1.5 h-1.5 rounded-full shrink-0 ${mode.dot}`} />
              </>
            )}
            <CostDisplay cost={cost} before={<Sep />} format={formatUsd2} hideZero className="tabular-nums whitespace-nowrap" />
            {spawn && (
              <>
                <Sep />
                <span className={`inline-flex items-center gap-0.5 whitespace-nowrap ${spawn.text}`}>
                  <GitBranch className="w-3 h-3" aria-hidden="true" />
                  {spawn.label}
                </span>
              </>
            )}
          </div>

          {/* Line 4 (optional) — cwd + linked plans / RFCs / tasks */}
          <ContextLine
            plans={session.linked_plans}
            rfcs={session.linked_rfcs}
            tasks={session.linked_tasks}
            wsSlug={wsSlug}
            cwd={session.cwd}
          />

          {/* Child sessions (detached runs) */}
          <ChildrenIndicator sessionId={session.id} onSelect={onSelect} />

          {/* Inline actions — revealed by the ⋯ button, touch friendly */}
          {isMenuOpen && (
            <div
              className="mt-2 flex flex-wrap items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onCloseMenu() }}
            >
              {isConfirmingDelete ? (
                <>
                  <span className="text-xs text-gray-400 mr-auto">Delete this conversation?</span>
                  <Button size="sm" variant="ghost" flat onClick={onCloseMenu} className="text-xs">
                    Cancel
                  </Button>
                  <Button size="sm" variant="danger" flat onClick={() => onDelete(session.id)} autoFocus className="text-xs">
                    Delete
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="secondary" flat onClick={() => onStartRename(session.id)} className="gap-1.5 text-xs">
                    <Pencil className="w-3 h-3" aria-hidden="true" />
                    Rename
                  </Button>
                  <Button size="sm" variant="ghost" flat onClick={() => onRequestDelete(session.id)} className="gap-1.5 text-xs text-red-300">
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                    Delete
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Row actions trigger — always visible (touch), muted until hovered/focused */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (isMenuOpen) onCloseMenu()
            else onOpenMenu(session.id)
          }}
          onKeyDown={stopKeys}
          aria-label={`Actions for ${title}`}
          aria-expanded={isMenuOpen}
          className={`shrink-0 -my-1.5 ${iconButton('ghost', 'size-9 md:size-8')} ${glassFlat} ${isMenuOpen ? '' : 'text-gray-600'}`}
        >
          <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
})

// ============================================================================
// SessionList component
// ============================================================================

export const SessionList = memo(function SessionList({ activeSessionId, onSelect, onClose, embedded }: SessionListProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMoreSessions, setHasMoreSessions] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  /** Exactly how many sessions are loaded — the offset of the next page. */
  const offsetRef = useRef(0)
  /** How many a reconcile must re-read; claimed optimistically by a page load. */
  const windowRef = useRef(SESSION_PAGE_SIZE)
  /** Monotonic request id: only the newest response may touch the list. */
  const fetchSeqRef = useRef(0)

  // Sentinel ref for IntersectionObserver (infinite scroll)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Live refresh via WebSocket CRUD events
  const chatSessionRefresh = useAtomValue(chatSessionRefreshAtom)
  // Stable reference between loads, so the memoised rows are not re-rendered for nothing.
  const providerInstances = useAtomValue(providersAtom)?.providers ?? null

  // Track active detached runs per parent session
  const activeRuns = useActiveRunTracker()

  /**
   * What each conversation is doing right now, keyed by session id.
   *
   * Fed from three places, in order of authority:
   *  1. `GET /api/chat/live-activity` — the server's in-memory truth, which
   *     replaces this map wholesale (so a stuck indicator cannot survive);
   *  2. every session listing, which stamps the sessions it returns;
   *  3. `chat_session` CRUD events, which only make the dot appear sooner.
   *
   * It used to be a `Set` of streaming ids fed by (3) alone. That could only
   * ever be right for a list that had been mounted since before the turn
   * started: after a reload, every working conversation looked idle.
   */
  const [activityById, setActivityById] = useState<Map<string, SessionActivity>>(
    () => new Map(),
  )

  // CRUD events — an accelerator on top of the snapshot, not the source.
  useEffect(() => {
    const bus = getEventBus()
    const off = bus.on((event: CrudEvent) => {
      if (event.entity_type !== 'chat_session') return

      if (
        event.action === 'updated' &&
        event.payload &&
        typeof event.payload.is_streaming === 'boolean'
      ) {
        const streaming = event.payload.is_streaming as boolean
        setActivityById((prev) => applyStreamingEvent(prev, event.entity_id, streaming))
      }
    })
    return () => { off() }
  }, [])

  // Active workspace from URL
  const activeWsSlug = useWorkspaceSlug()

  // Show/hide spawned sessions toggle
  const [showSpawned, setShowSpawned] = useAtom(showSpawnedSessionsAtom)

  // Filter state
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [selectedPlanOrRfc, setSelectedPlanOrRfc] = useState<string>('')

  // Inline rename state — which row is being renamed. The draft itself lives
  // inside <RenameInput> so typing does not re-render the list.
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MessageSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const isSearchActive = debouncedQuery.trim().length > 0

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load workspace projects on mount / workspace change (for project filter dropdown)
  useEffect(() => {
    if (!activeWsSlug) {
      setProjects([])
      return
    }
    workspacesApi.listProjects(activeWsSlug).then((data) => {
      const items = Array.isArray(data) ? data : []
      setProjects(items)
    })
  }, [activeWsSlug])

  const fetchSessions = useCallback(
    async (mode: FetchMode = 'initial') => {
      // Only the newest request may touch the list. Without this, a reconcile
      // and a page load that overlap apply in arrival order, and the loser
      // overwrites the winner — the truncation bug again, by another route.
      const seq = ++fetchSeqRef.current

      if (mode === 'more') {
        setIsLoadingMore(true)
        // Claim the page being fetched straight away, so a reconcile starting
        // mid-flight already covers it instead of cutting the list back.
        windowRef.current = offsetRef.current + SESSION_PAGE_SIZE
      } else if (mode === 'initial') {
        setLoading(true)
        offsetRef.current = 0
        windowRef.current = SESSION_PAGE_SIZE
      }

      try {
        const params: { limit: number; offset: number; project_slug?: string; workspace_slug?: string } = {
          // A reconcile covers the whole window the user scrolled through,
          // not just the first page.
          limit: mode === 'reconcile' ? windowRef.current : SESSION_PAGE_SIZE,
          offset: mode === 'more' ? offsetRef.current : 0,
        }
        // When a plan/RFC filter is active, always fetch workspace-level
        // so we get all sessions with links (they're workspace-scoped).
        // The project filter is then applied client-side in filteredSessions.
        if (selectedProject && !selectedPlanOrRfc) {
          params.project_slug = selectedProject
        } else if (activeWsSlug) {
          params.workspace_slug = activeWsSlug
        }
        const data = await chatApi.listSessions(params)
        if (seq !== fetchSeqRef.current) return // a newer request owns the list
        const newItems = data.items || []

        if (mode === 'more') {
          setSessions((prev) => [...prev, ...newItems])
          offsetRef.current += newItems.length
        } else {
          setSessions(newItems)
          offsetRef.current = newItems.length
        }
        windowRef.current = Math.max(offsetRef.current, SESSION_PAGE_SIZE)
        // The listing is authoritative for the sessions it returned, and
        // silent about the rest. `applyWindow` encodes exactly that.
        setActivityById((prev) => applyWindow(prev, newItems))
        setHasMoreSessions(!!data.has_more)
      } catch {
        // ignore
      } finally {
        if (mode === 'more') {
          setIsLoadingMore(false)
        } else if (mode === 'initial') {
          setLoading(false)
        }
      }
    },
    [selectedProject, selectedPlanOrRfc, activeWsSlug],
  )

  // First load, and whenever the filters change: this one may show a spinner,
  // because there is genuinely nothing to look at yet.
  useEffect(() => {
    fetchSessions('initial')
  }, [fetchSessions])

  // A CRUD event means "something moved", never "throw the list away".
  //
  // Keyed on the counter's own value rather than on the effect firing:
  // `fetchSessions` is rebuilt whenever a filter changes, and reacting to that
  // would fire a reconcile straight after the initial load it belongs to.
  const seenRefreshRef = useRef(chatSessionRefresh)
  useEffect(() => {
    if (seenRefreshRef.current === chatSessionRefresh) return
    seenRefreshRef.current = chatSessionRefresh
    fetchSessions('reconcile')
  }, [chatSessionRefresh, fetchSessions])

  /**
   * Re-read live activity while anything is running.
   *
   * Deliberately independent of the CRUD stream: this is the only mechanism
   * that can clear a working indicator whose "stopped" event never arrived,
   * and the only one that can light one up for a turn that started before
   * this list was mounted. It stops by itself once every session is quiet,
   * and pauses while the tab is hidden.
   */
  const hasLiveSession = useMemo(() => anyLive(activityById.values()), [activityById])

  useEffect(() => {
    if (!hasLiveSession) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      if (cancelled) return
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        try {
          const data = await chatApi.getLiveActivity()
          if (!cancelled) setActivityById(applySnapshot(data?.sessions ?? {}))
        } catch {
          // A failed poll leaves the previous map in place and tries again.
        }
      }
      if (!cancelled) timer = setTimeout(tick, ACTIVITY_POLL_MS)
    }

    timer = setTimeout(tick, ACTIVITY_POLL_MS)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [hasLiveSession])

  // IntersectionObserver for infinite scroll sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreSessions && !isLoadingMore && !loading) {
          fetchSessions('more')
        }
      },
      { threshold: 0.1 },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMoreSessions, isLoadingMore, loading, fetchSessions])

  // Execute search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSearchResults([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)

    chatApi
      .searchMessages({
        q: debouncedQuery,
        project_slug: selectedProject || undefined,
        limit: 15,
      })
      .then((results) => {
        if (!cancelled) {
          setSearchResults(results)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSearchResults([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSearching(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, selectedProject])

  // Load plan/RFC options once from workspace-level sessions (not project-filtered)
  // so they're always visible regardless of which project is selected
  const [planRfcOptions, setPlanRfcOptions] = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
    if (!activeWsSlug) {
      setPlanRfcOptions([])
      return
    }
    chatApi.listSessions({ workspace_slug: activeWsSlug, limit: 100 }).then((data) => {
      const seen = new Map<string, { label: string; type: 'plan' | 'rfc' }>()
      for (const s of (data.items || [])) {
        for (const p of s.linked_plans ?? []) {
          if (!seen.has(`plan:${p.id}`)) seen.set(`plan:${p.id}`, { label: p.title, type: 'plan' })
        }
        for (const r of s.linked_rfcs ?? []) {
          if (!seen.has(`rfc:${r.id}`)) seen.set(`rfc:${r.id}`, { label: r.title, type: 'rfc' })
        }
      }
      setPlanRfcOptions(
        Array.from(seen.entries()).map(([value, { label, type }]) => ({
          value,
          label: `${type === 'rfc' ? '📜 ' : '📋 '}${label}`,
        }))
      )
    }).catch(() => setPlanRfcOptions([]))
  }, [activeWsSlug, chatSessionRefresh])

  // Filter out spawned sessions when toggle is off + plan/RFC filter + client-side project filter
  const filteredSessions = useMemo(() => {
    let result = sessions
    if (!showSpawned) result = result.filter((s) => !s.spawned_by)
    if (selectedPlanOrRfc) {
      const [type, id] = selectedPlanOrRfc.split(':')
      result = result.filter((s) => {
        if (type === 'plan') return s.linked_plans?.some((p) => p.id === id)
        if (type === 'rfc') return s.linked_rfcs?.some((r) => r.id === id)
        return true
      })
      // When plan/RFC filter is active, the fetch is workspace-level,
      // so apply project filter client-side if also set
      if (selectedProject) {
        result = result.filter((s) => s.project_slug === selectedProject)
      }
    }
    return result
  }, [sessions, showSpawned, selectedPlanOrRfc, selectedProject])

  const groupedSessions = useMemo(() => groupSessionsByDate(filteredSessions), [filteredSessions])

  // Filters panel (collapsed by default unless a filter is already active)
  const activeFilterCount = countActiveFilters({ project: selectedProject, planOrRfc: selectedPlanOrRfc, showSpawned })
  const [filtersOpen, setFiltersOpen] = useState(() => activeFilterCount > 0)

  // Per-row inline actions menu (rename / delete) — always reachable by tap, no hover needed
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Every callback handed to a row is referentially stable: a new lambda per
  // render would re-render all 30+ rows on any state change and undo the
  // memoisation above.
  const closeMenu = useCallback(() => {
    setMenuSessionId(null)
    setConfirmDeleteId(null)
  }, [])

  const openMenu = useCallback((sessionId: string) => {
    setConfirmDeleteId(null)
    setMenuSessionId(sessionId)
  }, [])

  const handleDelete = useCallback(async (sessionId: string) => {
    setMenuSessionId(null)
    setConfirmDeleteId(null)
    await chatApi.deleteSession(sessionId)
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
  }, [])

  const handleStartRename = useCallback((sessionId: string) => {
    setMenuSessionId(null)
    setConfirmDeleteId(null)
    setEditingSessionId(sessionId)
  }, [])

  const handleCancelRename = useCallback(() => setEditingSessionId(null), [])

  const handleCommitRename = useCallback(async (sessionId: string, title: string) => {
    setEditingSessionId(null)
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      await chatApi.renameSession(sessionId, trimmed)
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed } : s)))
    } catch {
      // Revert silently
    }
  }, [])

  const handleRequestDelete = useCallback((sessionId: string) => setConfirmDeleteId(sessionId), [])

  // `onSelect` / `onClose` come from the parent and may be fresh lambdas on
  // every parent render. Routing them through refs keeps the rows memoised
  // whatever the parent does.
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const stableSelect = useCallback(
    (sessionId: string, turnIndex?: number, title?: string) =>
      selectRef.current(sessionId, turnIndex, title),
    [],
  )
  const stableClose = useCallback(() => closeRef.current(), [])

  const handleClearSearch = () => {
    setSearchQuery('')
    setDebouncedQuery('')
    setSearchResults([])
    searchInputRef.current?.focus()
  }

  const handleClearFilters = () => {
    setSelectedProject('')
    setSelectedPlanOrRfc('')
    setShowSpawned(true)
  }

  const activeFilterLabels: string[] = []
  if (selectedProject) activeFilterLabels.push(projects.find((p) => p.slug === selectedProject)?.name ?? selectedProject)
  if (selectedPlanOrRfc) activeFilterLabels.push(planRfcOptions.find((o) => o.value === selectedPlanOrRfc)?.label ?? selectedPlanOrRfc)
  if (!showSpawned) activeFilterLabels.push('spawned hidden')

  // Render a single session row

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header — hidden when embedded (parent provides it) */}
      {!embedded && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <span className="text-xs font-medium text-gray-400">
            Sessions
          </span>
          <Button size="sm" variant="ghost" flat onClick={onClose} className="-mr-2 text-xs text-gray-400">
            Back
          </Button>
        </div>
      )}

      {/* Search + filters */}
      <div className="px-3 py-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              aria-label="Search conversations"
              className="w-full pl-8 pr-8 py-2 text-sm bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40 focus:bg-white/[0.05] transition-colors [&::-webkit-search-cancel-button]:hidden"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-label={activeFilterCount > 0 ? `Filters (${activeFilterCount} active)` : 'Filters'}
            className={`relative shrink-0 ${iconButton('ghost', 'size-9 md:size-8')} ${glassFlat} ${activeFilterCount > 0 ? 'text-indigo-300' : 'text-gray-400'}`}
          >
            <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
            {activeFilterCount > 0 && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-indigo-500 text-[10px] leading-4 font-semibold text-white tabular-nums text-center"
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {filtersOpen && (
          <div className="mt-2 space-y-1.5">
            {/* Project filter (scoped to active workspace) */}
            {projects.length > 0 && (
              <Select
                value={selectedProject}
                onChange={setSelectedProject}
                options={[
                  { value: '', label: 'All projects' },
                  ...projects.map((p) => ({ value: p.slug, label: p.name })),
                ]}
                placeholder="All projects"
                icon={<Folder className="w-3 h-3" />}
              />
            )}

            {/* Plan / RFC filter (populated from workspace-level sessions) */}
            {planRfcOptions.length > 0 && (
              <Select
                value={selectedPlanOrRfc}
                onChange={setSelectedPlanOrRfc}
                options={[
                  { value: '', label: 'All plans & RFCs' },
                  ...planRfcOptions,
                ]}
                placeholder="All plans & RFCs"
                icon={<ClipboardList className="w-3 h-3" />}
              />
            )}

            {/* Show spawned sessions toggle */}
            <div className="flex items-center justify-between gap-2 py-1">
              <span id="session-list-show-spawned" className="text-xs text-gray-400 flex items-center gap-1.5">
                <GitBranch className="w-3 h-3" aria-hidden="true" />
                Show spawned sessions
              </span>
              <Switch checked={showSpawned} onChange={setShowSpawned} ariaLabel="Show spawned sessions" />
            </div>
          </div>
        )}

        {/* Active filters summary — visible even when the panel is collapsed */}
        {activeFilterLabels.length > 0 && (
          <div className={`${META} mt-1.5 flex items-center gap-2 min-w-0`}>
            <span className="truncate min-w-0">
              {activeFilterLabels.map((label, i) => (
                <span key={label}>
                  {i > 0 && <Sep />}
                  <span className="text-gray-400">{label}</span>
                </span>
              ))}
            </span>
            <button
              type="button"
              onClick={handleClearFilters}
              className="ml-auto shrink-0 rounded px-1 text-indigo-400/80 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Content area: session list or search results */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {isSearchActive ? (
          // Search results mode
          searching ? (
            <div className="flex items-center justify-center py-8 text-gray-600 text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Searching...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-600 text-sm">
              <Search className="w-6 h-6 mb-2 text-gray-700" />
              No results for &ldquo;{debouncedQuery}&rdquo;
            </div>
          ) : (
            <div className="pb-2">
              <h3 className="px-3 pt-3 pb-1 text-[11px] font-medium text-gray-500">
                {pluralize(searchResults.length, 'session')} found
              </h3>
              <ul>
                {searchResults.map((result) => {
                  const resultTitle = result.session_title || `Session ${result.session_id.slice(0, 8)}`
                  const resultScope = sessionScope(result)
                  return (
                    <li key={result.session_id || result.conversation_id} className="py-1">
                      {/* Session header */}
                      <button
                        type="button"
                        onClick={() => onSelect(result.session_id, undefined, result.session_title)}
                        className="w-full text-left px-3 py-1.5 hover:bg-white/[0.03] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-500/60"
                      >
                        <div className="text-sm text-gray-200 truncate">{resultTitle}</div>
                        <div className={`${META} mt-0.5 flex items-center min-w-0`}>
                          <span className="tabular-nums whitespace-nowrap">{pluralize(result.hits.length, 'match', 'matches')}</span>
                          {resultScope && (
                            <>
                              <Sep />
                              <span className={`inline-flex items-center gap-1 min-w-0 ${resultScope.kind === 'workspace' ? 'text-purple-400/80' : 'text-indigo-400/80'}`}>
                                {resultScope.kind === 'workspace'
                                  ? <Hexagon className="w-3 h-3 shrink-0" aria-hidden="true" />
                                  : <Box className="w-3 h-3 shrink-0" aria-hidden="true" />}
                                <span className="truncate">{resultScope.slug}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </button>

                      {/* Message hits */}
                      {result.hits.slice(0, 3).map((hit) => (
                        <button
                          type="button"
                          key={hit.message_id}
                          onClick={() => onSelect(result.session_id, hit.turn_index, result.session_title, { snippet: hit.content_snippet, createdAt: hit.created_at, role: hit.role })}
                          className="w-full text-left pl-6 pr-3 py-1.5 hover:bg-indigo-500/[0.05] transition-colors group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-500/60"
                        >
                          <div className="flex items-start gap-2 border-l border-white/[0.06] pl-2.5">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gray-400 line-clamp-2">{hit.content_snippet}</div>
                              <div className={`${META} mt-0.5`}>
                                <span className={hit.role === 'user' ? 'text-blue-400/80' : 'text-emerald-400/80'}>
                                  {hit.role === 'user' ? 'You' : 'Assistant'}
                                </span>
                                <Sep />
                                <time className="tabular-nums" title={formatAbsolute(hit.created_at * 1000)}>
                                  {formatRelativeShort(hit.created_at * 1000)}
                                </time>
                              </div>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-gray-700 group-hover:text-indigo-400 shrink-0 mt-0.5 transition-colors" aria-hidden="true" />
                          </div>
                        </button>
                      ))}
                      {result.hits.length > 3 && (
                        <button
                          type="button"
                          onClick={() => onSelect(result.session_id, undefined, result.session_title)}
                          className={`${META} w-full text-left pl-6 pr-3 py-1 hover:text-gray-300 transition-colors`}
                        >
                          <span className="pl-2.5">+{pluralize(result.hits.length - 3, 'more match', 'more matches')}…</span>
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        ) : // Normal session list mode
        loading ? (
          <div className="flex items-center justify-center py-8 text-gray-600 text-sm">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-600 text-sm">
            <MessageCircle className="w-6 h-6 mb-2 text-gray-700" />
            No conversations yet
          </div>
        ) : (
          <div className="pb-2">
            {/* Active runs section — shown when detached runs exist */}
            {activeRuns.size > 0 && (
              <section aria-label="Active runs" className="pb-1 border-b border-white/[0.06]">
                <h3 className="px-3 pt-3 pb-1 flex items-center gap-2 text-[11px] font-medium text-amber-400/90">
                  <PulseIndicator variant="pending" size={6} />
                  Active runs
                  <span className="ml-auto tabular-nums text-amber-400/60 font-normal">
                    {Array.from(activeRuns.values()).reduce((sum, info) => sum + info.runCount, 0)}
                  </span>
                </h3>
                <ul>
                  {Array.from(activeRuns.entries()).map(([parentId, info]) => {
                    const parentSession = sessions.find(s => s.id === parentId)
                    const parentTitle = parentSession?.title || `Session ${parentId.slice(0, 8)}`
                    return (
                      <li key={parentId}>
                        <button
                          type="button"
                          onClick={() => onSelect(parentId, undefined, parentTitle)}
                          className="w-full text-left px-3 py-2 hover:bg-amber-500/[0.05] transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-500/60"
                        >
                          <Play className="w-3 h-3 text-amber-400/70 shrink-0" aria-hidden="true" />
                          <span className="flex-1 min-w-0 text-sm text-gray-200 truncate">{parentTitle}</span>
                          <span className="shrink-0 text-[11px] tabular-nums text-amber-400/70">
                            {pluralize(info.runCount, 'run')} in progress
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {groupedSessions.map(({ group, sessions: groupSessions }) => (
              <section key={group} aria-label={group}>
                {/* Date group header */}
                <h3 className="px-3 pt-4 pb-1 flex items-baseline text-[11px] font-medium text-gray-500">
                  {group}
                  <span className="ml-auto tabular-nums font-normal text-gray-600">{groupSessions.length}</span>
                </h3>
                <ul>
                  {groupSessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isActive={session.id === activeSessionId}
                      status={describeActivity(activityById.get(session.id))}
                      isEditing={editingSessionId === session.id}
                      isMenuOpen={menuSessionId === session.id}
                      isConfirmingDelete={confirmDeleteId === session.id}
                      wsSlug={activeWsSlug ?? null}
                      providers={providerInstances}
                      onSelect={stableSelect}
                      onClose={stableClose}
                      onStartRename={handleStartRename}
                      onCommitRename={handleCommitRename}
                      onCancelRename={handleCancelRename}
                      onOpenMenu={openMenu}
                      onCloseMenu={closeMenu}
                      onRequestDelete={handleRequestDelete}
                      onDelete={handleDelete}
                    />
                  ))}
                </ul>
              </section>
            ))}

            {/* Infinite scroll sentinel + loading indicator */}
            {hasMoreSessions && (
              <div ref={sentinelRef} className="flex items-center justify-center py-3">
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />
                    <span className="ml-1.5 text-[11px] text-gray-600">Loading more...</span>
                  </>
                ) : (
                  <span className="text-[11px] text-gray-700">Scroll for more</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

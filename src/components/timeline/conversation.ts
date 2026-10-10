/**
 * A whole conversation as one trace: every session it went through, as data.
 *
 * Pure. A conversation is more than the session on screen:
 *   - the threads it was RELAYED from or to when the provider changed
 *     (`conversation_relayed`), which carry its earlier or later turns;
 *   - the CHILD sessions it spawned (delegations, runner tasks), each with its
 *     own turns and calls.
 * Each becomes its own lane; a child lane hangs below its parent's lane and
 * carries one span for the whole session, so a delegation reads as a subtree.
 *
 * Also here, the paging rule used to load a history in full (`loadTailFirst`,
 * `loadNewer`): the reader sees the latest turns first, and the earlier ones
 * arrive page by page — never a silent cut.
 */
import type { ChatMessage } from '@/types'
import type { RoutingDecision } from '@/types/routing'
import { buildTimeline, type Timeline, type TimelineItem, type TimelineLane, type TimelineLaneContext, type TimelineWork } from './model'

export interface TraceSession {
  id: string
  title: string
  /** `root`: the session the reader opened. `relay`: a thread before or after a provider switch. `child`: spawned by `parentId`. */
  relation: 'root' | 'child' | 'relay'
  parentId?: string
  provider?: string
  model?: string
  /** ISO date the session was created. */
  createdAt?: string
  isStreaming: boolean
  messages: ReadonlyArray<ChatMessage>
}

export interface ConversationTraceInput {
  sessions: ReadonlyArray<TraceSession>
  rootId: string
  /** How the root session was opened. */
  session?: TimelineLaneContext
  decisions?: ReadonlyArray<RoutingDecision>
  work?: TimelineWork
  now?: number
}

function sessionSpan(s: TraceSession, lane: TimelineLane, now: number): TimelineItem {
  const created = s.createdAt ? Date.parse(s.createdAt) : NaN
  const starts = lane.items.map((i) => i.startedAt).filter((t) => t > 0)
  const ends = lane.items.map((i) => i.endedAt ?? i.startedAt).filter((t) => t > 0)
  const startedAt = Math.min(Number.isFinite(created) ? created : Infinity, ...starts)
  const start = Number.isFinite(startedAt) ? startedAt : now
  const last = ends.length > 0 ? Math.max(...ends) : start
  const failed = lane.items.some((i) => i.kind === 'error')
  return {
    id: `session:${s.id}`,
    kind: 'run',
    status: s.isStreaming ? 'running' : failed ? 'error' : 'done',
    label: s.title,
    startedAt: start,
    ...(s.isStreaming ? {} : { endedAt: Math.max(last, start), durationMs: Math.max(last, start) - start }),
    laneId: s.id,
    sessionId: s.id,
    ...(s.provider && { provider: s.provider }),
    ...(s.model && { model: s.model }),
  }
}

/** Every session of the conversation as lanes, the root's work lane first. */
export function buildConversationTimeline(input: ConversationTraceInput): Timeline {
  const now = input.now ?? Date.now()
  const lanes: TimelineLane[] = []
  const known = new Set(input.sessions.map((s) => s.id))
  for (const s of input.sessions) {
    const isRoot = s.id === input.rootId
    const built = buildTimeline({
      messages: s.messages,
      sessionId: s.id,
      title: s.title,
      isStreaming: s.isStreaming,
      session: isRoot ? input.session : { provider: s.provider, model: s.model },
      decisions: input.decisions,
      work: isRoot ? input.work : undefined,
      now,
    })
    for (const lane of built.lanes) {
      if (lane.id !== s.id) {
        lanes.push({ ...lane, relation: 'work' })
        continue
      }
      const relation = isRoot ? 'root' : s.relation
      const parentLaneId = relation === 'child' && s.parentId && known.has(s.parentId) ? s.parentId : undefined
      lanes.push({ ...lane, relation, ...(parentLaneId && { parentLaneId }), ...(isRoot ? {} : { span: sessionSpan(s, lane, now) }) })
    }
  }
  // The work lane, then the threads of the conversation in time order (a relay before the root when it came first).
  const firstOf = (l: TimelineLane) => l.span?.startedAt ?? l.items.find((i) => i.startedAt > 0)?.startedAt ?? Infinity
  const ordered = [...lanes.filter((l) => l.relation === 'work'), ...lanes.filter((l) => l.relation !== 'work').sort((a, b) => firstOf(a) - firstOf(b))]
  const items = ordered.flatMap((l) => (l.span ? [l.span, ...l.items] : l.items)).sort((a, b) => a.startedAt - b.startedAt)
  return { lanes: ordered, items, runningCount: items.filter((i) => i.status === 'running').length }
}

/** The session ids a history points to through `conversation_relayed` events (other than its own). */
export function relayedSessions(sessionId: string, events: ReadonlyArray<Record<string, unknown>>): string[] {
  const out = new Set<string>()
  for (const e of events) {
    if (e.type !== 'conversation_relayed') continue
    for (const id of [e.from_session_id, e.to_session_id]) if (typeof id === 'string' && id && id !== sessionId) out.add(id)
  }
  return [...out]
}

export type RawEvent = Record<string, unknown>
export interface EventPage {
  events: RawEvent[]
  total: number
}
export type FetchPage = (offset: number, limit: number) => Promise<EventPage>

export interface LoadProgress {
  /** The events loaded so far: a contiguous run that ends at the latest event. */
  events: RawEvent[]
  /** Offset of the first loaded event (0 = from the very first message). */
  from: number
  total: number
}

/**
 * Load a whole history, latest page first, then the earlier ones back to the
 * first event. `onProgress` is called after each page with what is loaded so
 * far — always a contiguous tail, so a partial trace is a true one.
 * Stops (and returns what it has) when `cancelled()` turns true.
 */
export async function loadTailFirst(
  fetchPage: FetchPage,
  pageSize: number,
  onProgress: (p: LoadProgress) => void,
  cancelled: () => boolean = () => false,
): Promise<LoadProgress> {
  const probe = await fetchPage(0, pageSize)
  let total = probe.total
  if (total <= probe.events.length) {
    const done = { events: probe.events, from: 0, total: Math.max(total, probe.events.length) }
    onProgress(done)
    return done
  }
  let from = Math.max(0, total - pageSize)
  const tail = await fetchPage(from, total - from)
  total = Math.max(total, tail.total)
  let events = tail.events
  onProgress({ events, from, total })
  while (from > pageSize && !cancelled()) {
    const next = Math.max(pageSize, from - pageSize)
    const page = await fetchPage(next, from - next)
    events = [...page.events, ...events]
    from = next
    onProgress({ events, from, total })
  }
  if (from > 0 && !cancelled()) {
    // The first page is already here (the probe): only what lies between it and the loaded tail is missing.
    const head = probe.events.slice(0, from)
    events = [...head, ...events]
    from = 0
    onProgress({ events, from, total })
  }
  return { events, from, total }
}

/** Events after the first `loaded` ones, page by page until the end. */
export async function loadNewer(fetchPage: FetchPage, loaded: number, pageSize: number): Promise<EventPage> {
  const out: RawEvent[] = []
  let offset = loaded
  let total = loaded
  for (let guard = 0; guard < 1000; guard += 1) {
    const page = await fetchPage(offset, pageSize)
    total = page.total
    out.push(...page.events)
    offset += page.events.length
    if (page.events.length < pageSize || offset >= page.total) break
  }
  return { events: out, total }
}

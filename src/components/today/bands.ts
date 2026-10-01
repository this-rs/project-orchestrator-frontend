import type {
  AttentionResponse,
  AttentionThread,
  Band,
  OrphanRequest,
  SessionState,
  ThinkingItem,
  UnattachedSession,
  WaitingRequest,
  WorkspaceRef,
} from '@/types/attention'
import type { LinkNames } from './AttentionCard'

/**
 * Pure cut of one `/api/attention` payload into what the four bands display.
 * The page never decides band membership: it only routes what the backend already
 * classified (a thread's `band`, a request's liveness) to the right component.
 */

/** Display order of the bands (fixed). */
export const BAND_ORDER: readonly Band[] = ['waiting', 'running', 'stuck', 'thinking']

/** A live agent stopped on the user: a request of a thread, or of a session with no thread. */
export interface WaitingEntry {
  request: WaitingRequest
  thread: AttentionThread | null
  /** Session without a thread (`unattached[]`), when that is where the request comes from. */
  unattached: UnattachedSession | null
}

/** Band 3 items, in display order inside a lane. */
export type StuckEntry =
  | { kind: 'stuck'; thread: AttentionThread }
  | { kind: 'orphan'; thread: AttentionThread; orphan: OrphanRequest }
  | { kind: 'unattached'; session: UnattachedSession }

export type RunningEntry =
  | { kind: 'running'; thread: AttentionThread }
  | { kind: 'unattached'; session: UnattachedSession }

export interface LaneGroup<T> {
  slug: string
  name: string
  items: T[]
}

export interface Bands {
  waiting: WaitingEntry[]
  running: LaneGroup<RunningEntry>[]
  stuck: LaneGroup<StuckEntry>[]
  thinking: ThinkingItem[]
  counts: Record<Band, number>
  /** True when all four bands are empty. */
  empty: boolean
}

const byAgeDesc = <T extends { age_secs: number }>(a: T, b: T) => b.age_secs - a.age_secs

/** An orphan whose thread is unknown still has to be shown: it becomes a thread-less dead session. */
function orphanAsSession(o: OrphanRequest): UnattachedSession {
  return {
    id: o.session_id,
    workspace_slug: o.workspace,
    title: `Session ${o.session_id.slice(0, 8)}`,
    state: 'dead' satisfies SessionState,
    pending: [o],
    since: o.requested_at,
    age_secs: o.age_secs,
  }
}

function groupByLane<T>(
  entries: { lane: string; entry: T }[],
  lanes: WorkspaceRef[],
): LaneGroup<T>[] {
  const order = new Map(lanes.map((l, i) => [l.slug, i]))
  const names = new Map(lanes.map((l) => [l.slug, l.name]))
  const groups = new Map<string, T[]>()
  for (const { lane, entry } of entries) groups.set(lane, [...(groups.get(lane) ?? []), entry])
  return [...groups.entries()]
    .sort(([a], [b]) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || a.localeCompare(b))
    .map(([slug, items]) => ({ slug, name: names.get(slug) ?? slug, items }))
}

export function buildBands(data: AttentionResponse): Bands {
  const threadById = new Map(data.threads.map((t) => [t.id, t]))

  // ---- liveness: a dead session never waits on the user, its request goes to band 3 ----
  // Rule "morte -> bande 3" + one request shown ONCE (dedup by request_id across
  // waiting[], orphans[] and unattached[].pending).
  const sessionState = new Map<string, SessionState>()
  for (const t of data.threads) for (const s of t.sessions) sessionState.set(s.id, s.state)
  for (const u of data.unattached) sessionState.set(u.id, u.state)
  const isDead = (sessionId: string) => sessionState.get(sessionId) === 'dead'

  const orphanIds = new Set(data.orphans.map((o) => o.request_id))
  const deadPendingIds = new Set(
    data.unattached.filter((u) => u.state === 'dead').flatMap((u) => u.pending.map((r) => r.request_id)),
  )
  // A request waiting[] still lists although its session is dead: not lost, shown in band 3
  // (unless an orphan or the dead session's own row already carries it).
  const orphans: OrphanRequest[] = []
  const orphansSeen = new Set<string>()
  const pushOrphan = (o: OrphanRequest) => {
    if (orphansSeen.has(o.request_id)) return
    orphansSeen.add(o.request_id)
    orphans.push(o)
  }
  for (const o of data.orphans) pushOrphan(o)
  for (const r of data.waiting) {
    if (isDead(r.session_id) && !orphanIds.has(r.request_id) && !deadPendingIds.has(r.request_id)) {
      pushOrphan({ ...r, cli_stopped_at: null })
    }
  }

  // ---- band 1: live agents stopped on the user ----
  const live = (r: WaitingRequest) => !isDead(r.session_id) && !orphanIds.has(r.request_id)
  const waiting: WaitingEntry[] = data.waiting.filter(live).map((request) => ({
    request,
    thread: request.thread_id ? (threadById.get(request.thread_id) ?? null) : null,
    unattached: null,
  }))
  // A live thread-less session's pending request lives only in `unattached[].pending`;
  // it is shown here (it waits on someone) unless `waiting[]` already carries it.
  const seen = new Set(waiting.map((e) => e.request.request_id))
  for (const u of data.unattached) {
    if (u.state !== 'live') continue
    for (const request of u.pending) {
      if (seen.has(request.request_id) || !live(request)) continue
      seen.add(request.request_id)
      waiting.push({ request, thread: null, unattached: u })
    }
  }
  waiting.sort((a, b) => byAgeDesc(a.request, b.request))

  // ---- band 2: what runs ----
  const running: { lane: string; entry: RunningEntry }[] = []
  for (const thread of data.threads) {
    if (thread.band === 'running') running.push({ lane: thread.workspace, entry: { kind: 'running', thread } })
  }
  for (const session of data.unattached) {
    if (session.state === 'live' && session.pending.length === 0) {
      running.push({ lane: session.workspace_slug, entry: { kind: 'unattached', session } })
    }
  }

  // ---- band 3: stuck threads, orphan requests, dead thread-less sessions ----
  const stuck: { lane: string; entry: StuckEntry }[] = []
  const orphansOfThread = new Map<string, OrphanRequest[]>()
  const strayOrphans: OrphanRequest[] = []
  for (const o of orphans) {
    const t = o.thread_id ? threadById.get(o.thread_id) : undefined
    if (t) orphansOfThread.set(t.id, [...(orphansOfThread.get(t.id) ?? []), o])
    else strayOrphans.push(o)
  }
  for (const thread of data.threads) {
    const orphans = orphansOfThread.get(thread.id) ?? []
    if (thread.band === 'stuck' && !(thread.stuck_reason === 'orphan_request' && orphans.length > 0)) {
      stuck.push({ lane: thread.workspace, entry: { kind: 'stuck', thread } })
    }
    for (const orphan of orphans) stuck.push({ lane: thread.workspace, entry: { kind: 'orphan', thread, orphan } })
  }
  for (const o of strayOrphans) {
    if (deadPendingIds.has(o.request_id)) continue // the dead session's own row shows it
    stuck.push({ lane: o.workspace, entry: { kind: 'unattached', session: orphanAsSession(o) } })
  }
  const threadOrphanIds = new Set(
    orphans.filter((o) => o.thread_id && threadById.has(o.thread_id)).map((o) => o.request_id),
  )
  for (const u of data.unattached) {
    if (u.state !== 'dead') continue
    // A request already shown under its thread is not repeated on the thread-less row.
    const pending = u.pending.filter((r) => !threadOrphanIds.has(r.request_id))
    const session = pending.length === u.pending.length ? u : { ...u, pending }
    stuck.push({ lane: u.workspace_slug, entry: { kind: 'unattached', session } })
  }

  const runningGroups = groupByLane(running, data.lanes)
  const stuckGroups = groupByLane(stuck, data.lanes)
  const counts: Record<Band, number> = {
    waiting: waiting.length,
    running: running.length,
    stuck: stuck.length,
    thinking: data.thinking.length,
  }
  return {
    waiting,
    running: runningGroups,
    stuck: stuckGroups,
    thinking: data.thinking,
    counts,
    empty: BAND_ORDER.every((b) => counts[b] === 0),
  }
}

/** Plan / task titles the backend only sends as ids on a link, collected from the payload. */
export function linkNames(data: AttentionResponse): LinkNames {
  const plans: Record<string, string> = {}
  const tasks: Record<string, string> = {}
  for (const t of data.threads) {
    if (t.plan) plans[t.plan.id] = t.plan.title
    for (const b of t.blocked_tasks) tasks[b.id] = b.title
    for (const b of t.resume?.skipped_blocked ?? []) tasks[b.id] = b.title
  }
  return { plans, tasks }
}

// ---------------------------------------------------------------------------
// Texts (French, as the rest of the cockpit)
// ---------------------------------------------------------------------------

export const BAND_TEXT: Record<Band, { title: string; empty: string }> = {
  waiting: { title: "T'attend", empty: "Rien ne t'attend" },
  running: { title: 'Tourne', empty: 'Rien ne tourne' },
  stuck: { title: 'Coincé', empty: "Rien n'est coincé" },
  thinking: { title: 'Pensée', empty: 'Rien à trancher' },
}

export const TODAY_TEXT = {
  pageDescription: 'Ce qui tourne, ce qui est coincé et ce qui t’attend, sur tous tes workspaces.',
  bandError: 'Cette bande n’a pas pu être chargée.',
  retry: 'Réessayer',
  staleRefresh: 'Actualisation impossible : les données affichées peuvent être périmées.',
  emptyAll: "Rien ne t'attend, rien ne tourne",
  emptyAllHint: 'Aucun agent ne demande ta réponse, aucun fil n’est en cours ni coincé.',
  plans: 'Voir les plans',
  noMatch: 'Aucun résultat pour ce couloir',
  noMatchHint: 'Ce couloir n’a rien en attente, en cours ni coincé.',
  clearFilter: 'Effacer le filtre',
} as const


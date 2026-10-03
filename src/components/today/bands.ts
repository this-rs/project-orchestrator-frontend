import type {
  AttentionResponse,
  AttentionThread,
  Band,
  OrphanRequest,
  SessionState,
  StuckReason,
  ThinkingItem,
  UnattachedSession,
  WaitingRequest,
} from '@/types/attention'
import type { LinkNames } from './AttentionCard'

/**
 * Pure cut of one `/api/attention` payload into what the four bands display.
 * The page never decides band membership: it only routes what the backend already
 * classified (a thread's `band`, a request's liveness) to the right component.
 */

/** Order of the bands in the summary line and in the counts (fixed). */
export const BAND_ORDER: readonly Band[] = ['waiting', 'running', 'stuck', 'thinking']

/**
 * Order of the sections in the page (DOM order = tab order = phone order): what asks
 * for the user first, then what to take back up, then what advances alone, then what
 * to follow. From 1024 px the first two (and the user's own day under them) stack on the
 * left, "En cours" and "À suivre" on the right.
 */
export const SECTION_ORDER: readonly Band[] = ['waiting', 'stuck', 'running', 'thinking']

/** What a stuck thread says about itself, in plain words. */
export const STUCK_LABEL: Record<StuckReason, string> = {
  failed: 'Run échoué',
  budget_exceeded: 'Budget dépassé',
  task_blocked: 'Tâche bloquée',
  session_error: 'Erreur de session',
  orphan_request: 'Demande restée sans réponse',
}

/** A live agent stopped on the user: a request of a thread, or of a session with no thread. */
export interface WaitingEntry {
  request: WaitingRequest
  thread: AttentionThread | null
  /** Session without a thread (`unattached[]`), when that is where the request comes from. */
  unattached: UnattachedSession | null
}

/** Band 3 items ("À reprendre"). */
export type StuckEntry =
  | { kind: 'stuck'; thread: AttentionThread }
  | { kind: 'orphan'; thread: AttentionThread; orphan: OrphanRequest }
  | { kind: 'unattached'; session: UnattachedSession }

/**
 * "En cours" is grouped BY PLAN: one row per plan. `thread` is the thread the row
 * speaks for (the one whose run is running, else the first); `others` are further
 * threads of the same plan, which the row only mentions.
 */
export type RunningEntry =
  | { kind: 'plan'; key: string; thread: AttentionThread; others: AttentionThread[] }
  | { kind: 'unattached'; session: UnattachedSession }

export interface Bands {
  waiting: WaitingEntry[]
  /** One entry per plan (or per thread-less live session). */
  running: RunningEntry[]
  /** Oldest first (ties: by id), whatever the lane. */
  stuck: StuckEntry[]
  thinking: ThinkingItem[]
  counts: Record<Band, number>
  /** True when all four bands are empty. */
  empty: boolean
}

/** The waiting entries, oldest first, ties by request id (one rule for the list AND the recommendation). */
export function compareWaiting(a: WaitingEntry, b: WaitingEntry): number {
  return b.request.age_secs - a.request.age_secs || a.request.request_id.localeCompare(b.request.request_id)
}

/** Age (seconds) and identity of a stuck entry: what orders band "À reprendre". */
export function stuckAge(e: StuckEntry): number {
  return e.kind === 'stuck' ? e.thread.age_secs : e.kind === 'orphan' ? e.orphan.age_secs : e.session.age_secs
}
export function stuckId(e: StuckEntry): string {
  return e.kind === 'stuck' ? e.thread.id : e.kind === 'orphan' ? e.orphan.request_id : e.session.id
}
/** Oldest first; equal ages are ordered by id so the result never depends on the payload order. */
export function compareStuck(a: StuckEntry, b: StuckEntry): number {
  return stuckAge(b) - stuckAge(a) || stuckId(a).localeCompare(stuckId(b))
}

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

export function buildBands(data: AttentionResponse): Bands {
  const threadById = new Map(data.threads.map((t) => [t.id, t]))

  // ---- liveness: a dead session never waits on the user, its request goes to band 3 ----
  // Rule "morte -> bande 3" + one request shown ONCE (dedup by request_id across
  // waiting[], orphans[] and unattached[].pending).
  const sessionState = new Map<string, SessionState>()
  for (const t of data.threads) for (const s of t.sessions) sessionState.set(s.id, s.state)
  for (const u of data.unattached) sessionState.set(u.id, u.state)
  // Only a session KNOWN to be live can be answered: an unknown state is treated like a dead
  // one (resume it), never "Autoriser" on a session whose state we do not know.
  const isLive = (sessionId: string) => sessionState.get(sessionId) === 'live'
  const isDead = (sessionId: string) => !isLive(sessionId)

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
  waiting.sort(compareWaiting)

  // ---- band 2: what runs, one entry per plan ----
  const running: RunningEntry[] = []
  const byPlan = new Map<string, AttentionThread[]>()
  for (const thread of data.threads) {
    if (thread.band !== 'running') continue
    const key = thread.plan?.id ?? `thread:${thread.id}`
    byPlan.set(key, [...(byPlan.get(key) ?? []), thread])
  }
  for (const [key, threads] of byPlan) {
    const primary = threads.find((t) => t.run?.status === 'running') ?? threads[0]
    running.push({ kind: 'plan', key, thread: primary, others: threads.filter((t) => t !== primary) })
  }
  for (const session of data.unattached) {
    if (session.state === 'live' && session.pending.length === 0) running.push({ kind: 'unattached', session })
  }

  // ---- band 3: stuck threads, orphan requests, dead thread-less sessions ----
  const stuck: StuckEntry[] = []
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
      stuck.push({ kind: 'stuck', thread })
    }
    for (const orphan of orphans) stuck.push({ kind: 'orphan', thread, orphan })
  }
  for (const o of strayOrphans) {
    if (deadPendingIds.has(o.request_id)) continue // the dead session's own row shows it
    stuck.push({ kind: 'unattached', session: orphanAsSession(o) })
  }
  const threadOrphanIds = new Set(
    orphans.filter((o) => o.thread_id && threadById.has(o.thread_id)).map((o) => o.request_id),
  )
  for (const u of data.unattached) {
    if (u.state !== 'dead') continue
    // A request already shown under its thread is not repeated on the thread-less row.
    const pending = u.pending.filter((r) => !threadOrphanIds.has(r.request_id))
    const session = pending.length === u.pending.length ? u : { ...u, pending }
    stuck.push({ kind: 'unattached', session })
  }

  stuck.sort(compareStuck)
  const counts: Record<Band, number> = {
    waiting: waiting.length,
    running: running.length,
    stuck: stuck.length,
    thinking: data.thinking.length,
  }
  return {
    waiting,
    running,
    stuck,
    thinking: data.thinking,
    counts,
    empty: BAND_ORDER.every((b) => counts[b] === 0),
  }
}

/**
 * Plans the queue already shows: one that runs, one whose agent waits on the user, one to
 * resume. The page hands them to the work dashboard so a plan appears ONCE on the page.
 */
export function shownPlanIds(bands: Bands): Set<string> {
  const ids = new Set<string>()
  const add = (t: AttentionThread | null) => {
    if (t?.plan) ids.add(t.plan.id)
  }
  for (const e of bands.waiting) add(e.thread)
  for (const e of bands.running) {
    if (e.kind !== 'plan') continue
    add(e.thread)
    e.others.forEach(add)
  }
  for (const e of bands.stuck) if (e.kind !== 'unattached') add(e.thread)
  return ids
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
// Texts (plain French: no jargon, no internal band names)
// ---------------------------------------------------------------------------

export const BAND_TEXT: Record<Band, { title: string; empty: string; summary: string }> = {
  waiting: { title: 'À traiter', empty: 'Rien à traiter', summary: 'à traiter' },
  running: { title: 'En cours', empty: 'Rien en cours', summary: 'en cours' },
  stuck: { title: 'À reprendre', empty: 'Rien à reprendre', summary: 'à reprendre' },
  thinking: { title: 'À suivre', empty: 'Rien à suivre', summary: 'à suivre' },
}

export const TODAY_TEXT = {
  title: "Aujourd'hui",
  summaryLabel: 'Résumé du jour',
  laneFilterLabel: 'Filtrer par workspace',
  allLanes: 'Tous',
  laneNote: (name: string) => `Filtré sur ${name}. La pastille de la barre compte tous les workspaces.`,
  bandError: 'Cette section n’a pas pu être chargée.',
  retry: 'Réessayer',
  staleRefresh: 'Actualisation impossible : les données affichées peuvent être périmées.',
  emptyAll: 'Rien à traiter, rien en cours',
  emptyAllHint: 'Aucun agent ne demande ta réponse, aucun fil n’est en cours ni à reprendre.',
  plans: 'Voir les plans',
  createWorkspace: 'Choisir ou créer un workspace',
  noMatch: 'Aucun résultat pour ce workspace',
  noMatchHint: 'Ce workspace n’a rien à traiter, rien en cours, rien à reprendre.',
  clearFilter: 'Effacer le filtre',
} as const

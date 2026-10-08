import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { attentionRefreshRequestAtom } from '@/atoms/attentionDigest'
import { ApiError } from '@/services/api'
import { attentionApi, type Verdict } from '@/services/attention'
import type { AttentionResponse, AttentionThread, OrphanRequest, ThinkingItem, WaitingRequest } from '@/types/attention'
import type { CrudEvent } from '@/types'
import { useEventBus } from './useEventBus'
import { useToast } from './useToast'
import { TEXT } from '@/components/today/text'

/** Coalesces a burst of `attention_changed` into one refetch. */
export const ATTENTION_DEBOUNCE_MS = 500

/** What a toast says the answer was about: the tool and the start of the command, so a card that leaves is still named. */
export function describeRequest(req: WaitingRequest): string {
  const text = req.text.replace(/\s+/g, ' ').trim()
  const short = text.length > 60 ? `${text.slice(0, 57)}…` : text
  return req.tool_name ? `${req.tool_name} ${short}`.trim() : short
}

/** Shown on the request card when a 410 reveals a dead conversation: Today's own wording (one registry). */
export const ORPHAN_NOTICE = TEXT.card.orphanNotice

/** The relay of `attention_changed` on `/ws/events` (tolerates the CRUD-envelope variants). */
export function isAttentionChanged(e: CrudEvent): boolean {
  const x = e as unknown as { type?: string; entity_type?: string; action?: string }
  return (
    x.type === 'attention_changed' ||
    x.entity_type === 'attention' ||
    x.entity_type === 'attention_changed' ||
    x.action === 'attention_changed'
  )
}

// ---------------------------------------------------------------------------
// Optimistic overlay (pure)
// ---------------------------------------------------------------------------

/** A not-yet-confirmed local change. Entries are dropped on failure, or once a refetch started after the settle lands. */
export type Op =
  | { kind: 'drop_request'; id: string }
  | { kind: 'orphan_request'; id: string }
  | { kind: 'resume_thread'; id: string }
  | { kind: 'drop_thinking'; id: string }

interface Entry {
  op: Op
  /** Number of fetches already started when the mutation settled; null while in flight. */
  settledAfter: number | null
}

const opKey = (op: Op) => `${op.kind}:${op.id}`

export function applyOverlay(data: AttentionResponse, ops: Op[]): AttentionResponse {
  if (ops.length === 0) return data
  const ids = (kind: Op['kind']) => new Set(ops.filter((o) => o.kind === kind).map((o) => o.id))
  const dropped = ids('drop_request')
  const orphaned = ids('orphan_request')
  const resumed = ids('resume_thread')
  const thinkingDropped = ids('drop_thinking')

  const moved: OrphanRequest[] = data.waiting
    .filter((r) => orphaned.has(r.request_id) && !dropped.has(r.request_id))
    .map((r) => ({ ...r, cli_stopped_at: null }))
  const waiting = data.waiting.filter((r) => !dropped.has(r.request_id) && !orphaned.has(r.request_id))
  const orphans = [...data.orphans.filter((r) => !dropped.has(r.request_id)), ...moved].sort((a, b) => b.age_secs - a.age_secs)

  const threads = data.threads.map(
    (t): AttentionThread => (resumed.has(t.id) && t.band === 'stuck' ? { ...t, band: 'running', stuck_reason: null } : t),
  )
  const unattached = data.unattached.map((u) =>
    u.pending.some((r) => dropped.has(r.request_id))
      ? { ...u, pending: u.pending.filter((r) => !dropped.has(r.request_id)) }
      : u,
  )
  return {
    ...data,
    waiting,
    orphans,
    threads,
    unattached,
    thinking: data.thinking.filter((t) => !thinkingDropped.has(t.id)),
  }
}

// ---------------------------------------------------------------------------
// Structural sharing: a refetch keeps the identity of everything unchanged
// ---------------------------------------------------------------------------

export function share<T>(prev: T, next: T): T {
  if (prev === next) return prev
  if (Array.isArray(prev) && Array.isArray(next)) {
    const merged = next.map((n, i) => (i < prev.length ? share(prev[i], n) : n))
    return (merged.length === prev.length && merged.every((m, i) => m === prev[i]) ? prev : merged) as T
  }
  if (prev && next && typeof prev === 'object' && typeof next === 'object' && !Array.isArray(prev) && !Array.isArray(next)) {
    const p = prev as Record<string, unknown>
    const n = next as Record<string, unknown>
    const keys = Object.keys(n)
    const out: Record<string, unknown> = {}
    let same = keys.length === Object.keys(p).length
    for (const k of keys) {
      out[k] = k in p ? share(p[k], n[k]) : n[k]
      if (out[k] !== p[k]) same = false
    }
    return (same ? prev : out) as T
  }
  return next
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type AttentionStatus = 'loading' | 'ready' | 'error'

export interface UseAttentionOptions {
  /** Lane slug filter; omitted = every lane. */
  workspace?: string | null
}

/**
 * Data layer of the Today view.
 *
 * - One `GET /api/attention`, re-run on `attention_changed` (debounced) — never a
 *   WebSocket per session.
 * - `status === 'loading'` only before the FIRST data: a refetch keeps the page
 *   (`refreshing` is the only signal) and keeps the identity of unchanged items.
 * - Mutations are optimistic (the item leaves its band at once) and roll back with a
 *   toast on failure. A 410 on a permission means the CLI is dead: the request
 *   becomes an orphan with an explicit notice, not a generic error.
 * - Local UI state (drafts, expanded cards) lives here, keyed by id, so no refetch
 *   can lose it.
 */
export function useAttention({ workspace = null }: UseAttentionOptions = {}) {
  const toast = useToast()
  const [raw, setRaw] = useState<AttentionResponse | null>(null)
  /** Lane the CURRENT `raw` was fetched for: lets the page keep the old data (dimmed) while a new lane loads. */
  const [dataWorkspace, setDataWorkspace] = useState<string | null>(workspace)
  const [error, setError] = useState<Error | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [notices, setNotices] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const fetchSeq = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    const n = ++fetchSeq.current
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setRefreshing(true)
    try {
      const next = await attentionApi.fetch(workspace, ctrl.signal)
      if (!alive.current || n !== fetchSeq.current) return
      setRaw((prev) => (prev ? share(prev, next) : next))
      setDataWorkspace(workspace)
      setError(null)
      setEntries((es) => es.filter((e) => e.settledAfter === null || e.settledAfter >= n))
    } catch (err) {
      if (!alive.current || n !== fetchSeq.current || (err instanceof DOMException && err.name === 'AbortError')) return
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      if (alive.current && n === fetchSeq.current) setRefreshing(false)
    }
  }, [workspace])

  // First load, and reload when the lane filter changes.
  useEffect(() => {
    alive.current = true
    void refresh()
    return () => {
      alive.current = false
      abortRef.current?.abort()
      if (timer.current) clearTimeout(timer.current)
    }
  }, [refresh])

  // attention_changed: one refetch per burst.
  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void refresh()
    }, ATTENTION_DEBOUNCE_MS)
  }, [refresh])
  const onEvent = useCallback(
    (e: CrudEvent) => {
      if (isAttentionChanged(e)) scheduleRefresh()
    },
    [scheduleRefresh],
  )
  useEventBus(onEvent)

  // A page that changed something (attach, resume) asks every attention reader to refetch:
  // the same debounce, so a burst of events and a request make ONE fetch.
  const refreshRequest = useAtomValue(attentionRefreshRequestAtom)
  const seenRequest = useRef(refreshRequest)
  useEffect(() => {
    if (refreshRequest === seenRequest.current) return
    seenRequest.current = refreshRequest
    scheduleRefresh()
  }, [refreshRequest, scheduleRefresh])

  // ---- optimistic mutations ----

  const run = useCallback(
    async (op: Op, call: () => Promise<unknown>, messages: { ok?: string; fail: string }, on410?: () => void) => {
      const key = opKey(op)
      setEntries((es) => [...es.filter((e) => opKey(e.op) !== key), { op, settledAfter: null }])
      try {
        await call()
        setEntries((es) => es.map((e) => (opKey(e.op) === key ? { ...e, settledAfter: fetchSeq.current } : e)))
        if (messages.ok) toast.success(messages.ok)
        void refresh()
        return true
      } catch (err) {
        if (on410 && err instanceof ApiError && err.status === 410) {
          on410()
          setEntries((es) =>
            es.map((e) =>
              opKey(e.op) === key ? { op: { kind: 'orphan_request', id: op.id }, settledAfter: fetchSeq.current } : e,
            ),
          )
          void refresh()
          return false
        }
        setEntries((es) => es.filter((e) => opKey(e.op) !== key))
        toast.error(`${messages.fail}${err instanceof Error && err.message ? ` : ${err.message}` : ''}`)
        return false
      }
    },
    [refresh, toast],
  )

  const clearDraft = useCallback(
    (id: string) =>
      setDrafts((d) => {
        const rest = { ...d }
        delete rest[id]
        return rest
      }),
    [],
  )

  /**
   * Allow / deny a permission of a LIVE session. An orphan is refused here too.
   * Resolves `true` (sent), `false` (failed, toasted) or `'orphaned'` (the CLI is
   * dead: 410 or already known dead, noticed on the card — not a failure).
   */
  const answerPermission = useCallback(
    async (req: WaitingRequest, allow: boolean): Promise<boolean | 'orphaned'> => {
      if (raw?.orphans.some((o) => o.request_id === req.request_id) || notices[req.request_id]) return 'orphaned'
      let gone = false
      const ok = await run(
        { kind: 'drop_request', id: req.request_id },
        () => attentionApi.answerPermission(req.session_id, req.request_id, allow),
        { ok: `${allow ? 'Autorisé' : 'Refusé'} : ${describeRequest(req)}`, fail: 'Réponse non envoyée' },
        () => {
          gone = true
          setNotices((n) => ({ ...n, [req.request_id]: ORPHAN_NOTICE }))
        },
      )
      return gone ? 'orphaned' : ok
    },
    [raw, notices, run],
  )

  /** Answer a question (or "continue" an orphan: a message resumes the CLI). */
  const sendReply = useCallback(
    async (req: WaitingRequest, content: string) => {
      const ok = await run(
        { kind: 'drop_request', id: req.request_id },
        () => attentionApi.sendMessage(req.session_id, content),
        { ok: `Réponse envoyée : ${describeRequest(req)}`, fail: 'Réponse non envoyée' },
      )
      if (ok) clearDraft(req.request_id)
      return ok
    },
    [run, clearDraft],
  )

  const resumeRun = useCallback(
    async (thread: AttentionThread) => {
      // Never a 409 after the click: a busy runner is refused up front.
      if (!thread.plan || raw?.runner.status === 'busy') return false
      const planId = thread.plan.id
      return run(
        { kind: 'resume_thread', id: thread.id },
        () => attentionApi.resumeRun(planId),
        { ok: `Run repris : ${thread.plan.title}`, fail: 'Reprise impossible' },
      )
    },
    [raw, run],
  )

  const decide = useCallback(
    async (item: ThinkingItem, verdict: Verdict) => {
      if (item.kind !== 'rfc' && item.kind !== 'decision') return false
      const kind = item.kind
      return run(
        { kind: 'drop_thinking', id: item.id },
        () => attentionApi.decide(kind, item.id, verdict),
        { ok: `${verdict === 'accept' ? 'Accepté' : 'Rejeté'} : ${item.title}`, fail: 'Décision non enregistrée' },
      )
    },
    [run],
  )

  // ---- local UI state ----
  const setDraft = useCallback((id: string, text: string) => setDrafts((d) => ({ ...d, [id]: text })), [])
  const toggleExpanded = useCallback((id: string) => setExpanded((x) => ({ ...x, [id]: !x[id] })), [])

  const data = useMemo(
    () => (raw ? applyOverlay(raw, entries.map((e) => e.op)) : null),
    [raw, entries],
  )
  const status: AttentionStatus = data ? 'ready' : error ? 'error' : 'loading'

  return {
    data,
    status,
    /** Set when a refetch failed; with `status === 'ready'` the stale page stays up. */
    error,
    refreshing,
    /** True while the shown data belongs to another lane than the requested one (a lane chip was just tapped). */
    switchingLane: raw !== null && dataWorkspace !== workspace,
    refresh,
    /** request_id -> notice, for requests found orphaned by a 410. */
    notices,
    drafts,
    setDraft,
    expanded,
    toggleExpanded,
    answerPermission,
    sendReply,
    resumeRun,
    decide,
  }
}

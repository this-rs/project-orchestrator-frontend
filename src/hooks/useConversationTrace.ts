/**
 * Every session of a conversation, loaded in full, for the trace.
 *
 * The transcript only holds a window of the latest events; a trace must show
 * the whole conversation. This hook loads, from the REST history:
 *   - the session on screen, latest page first, then the earlier ones back to
 *     the first message (progress is reported, never a silent cut);
 *   - the threads it was relayed from or to (`conversation_relayed`), found in
 *     the histories themselves;
 *   - its child sessions (`/tree`: delegations, runner tasks), each in full.
 * While something streams it fetches only what is new, at most every
 * `REFRESH_MS`, and when `refreshKey` changes (the chat's messages).
 *
 * Why REST and not the socket: replayed socket frames carry no `created_at`,
 * so every event would be dated "now" — useless on a time axis.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { chatApi } from '@/services/chat'
import { historyEventsToMessages } from '@/utils/chatAssembly'
import { loadNewer, loadTailFirst, relayedSessions, type FetchPage, type RawEvent, type TraceSession } from '@/components/timeline/conversation'
import type { ChatMessage, SessionTreeNode } from '@/types'

/** Events per request. The route has no cap; this keeps one answer small enough to arrive fast. */
export const TRACE_PAGE_SIZE = 500
/** While something streams: how often the new events are fetched. */
const REFRESH_MS = 2000
/** Relays followed from the session on screen, each way. */
const MAX_RELAYS = 8

interface SessionState {
  meta: Omit<TraceSession, 'messages'>
  events: RawEvent[]
  /** Offset of the first loaded event; 0 once the history is complete. */
  from: number
  total: number
  status: 'loading' | 'ready' | 'error'
}

export interface ConversationTraceData {
  sessions: TraceSession[]
  /** Events loaded / known, over every session, while something is still loading. */
  loading: { loaded: number; total: number } | null
  /** A history could not be read (the trace shows what it has). */
  failed: boolean
  retry: () => void
  /** The session on screen or one of its children is streaming. */
  streaming: boolean
}

const fetcher = (sid: string): FetchPage => async (offset, limit) => {
  const page = await chatApi.getMessages(sid, { offset, limit })
  return { events: page.messages as RawEvent[], total: page.total_count }
}

const assembled = new WeakMap<RawEvent[], ChatMessage[]>()
function messagesOf(events: RawEvent[]): ChatMessage[] {
  let out = assembled.get(events)
  if (!out) {
    out = historyEventsToMessages(events)
    assembled.set(events, out)
  }
  return out
}

export function useConversationTrace(rootId: string | null, opts: { isStreaming?: boolean; refreshKey?: unknown; rootTitle?: string } = {}): ConversationTraceData {
  const [state, setState] = useState<ReadonlyMap<string, SessionState>>(new Map())
  const [attempt, setAttempt] = useState(0)
  const stateRef = useRef(state)
  stateRef.current = state
  const busy = useRef(new Set<string>())

  const patch = useCallback((id: string, update: (prev: SessionState | undefined) => SessionState | undefined) => {
    setState((prev) => {
      const next = update(prev.get(id))
      if (!next || next === prev.get(id)) return prev
      const map = new Map(prev)
      map.set(id, next)
      return map
    })
  }, [])

  /** Load one session in full; then follow the relays its history mentions. */
  const loadSession = useCallback(async (meta: SessionState['meta'], cancelled: () => boolean, depth = 0): Promise<void> => {
    if (busy.current.has(meta.id) || stateRef.current.get(meta.id)?.status === 'ready') return
    busy.current.add(meta.id)
    patch(meta.id, (prev) => ({ meta: prev?.meta ?? meta, events: prev?.events ?? [], from: prev?.from ?? 0, total: prev?.total ?? 0, status: 'loading' }))
    try {
      const done = await loadTailFirst(fetcher(meta.id), TRACE_PAGE_SIZE, (p) => {
        if (!cancelled()) patch(meta.id, (prev) => prev && { ...prev, events: p.events, from: p.from, total: p.total })
      }, cancelled)
      if (cancelled()) return
      patch(meta.id, (prev) => prev && { ...prev, status: 'ready' })
      if (depth < MAX_RELAYS && meta.relation !== 'child') {
        for (const other of relayedSessions(meta.id, done.events)) {
          if (stateRef.current.has(other)) continue
          const s = await chatApi.getSession(other).catch(() => null)
          if (cancelled()) return
          await loadSession({
            id: other, relation: 'relay', title: s?.title || `${s?.provider_id ?? ''} ${other.slice(0, 8)}`.trim(),
            provider: s?.provider_id ?? undefined, model: s?.model, createdAt: s?.created_at, isStreaming: false,
          }, cancelled, depth + 1)
        }
      }
    } catch {
      if (!cancelled()) patch(meta.id, (prev) => prev && { ...prev, status: 'error' })
    } finally {
      busy.current.delete(meta.id)
    }
  }, [patch])

  const readTree = useCallback(async (cancelled: () => boolean): Promise<SessionTreeNode[]> => {
    if (!rootId) return []
    const nodes = await chatApi.getSessionTree(rootId).catch(() => [] as SessionTreeNode[])
    if (cancelled()) return []
    // Fresh streaming flags and titles for every node already known.
    setState((prev) => {
      let map: Map<string, SessionState> | null = null
      for (const n of nodes) {
        const cur = prev.get(n.session_id)
        if (cur && (cur.meta.isStreaming !== n.is_streaming)) {
          map ??= new Map(prev)
          map.set(n.session_id, { ...cur, meta: { ...cur.meta, isStreaming: n.is_streaming } })
        }
      }
      return map ?? prev
    })
    return nodes
  }, [rootId])

  // First load: the root, its relays, then its children (two at a time).
  useEffect(() => {
    setState(new Map())
    busy.current.clear()
    if (!rootId) return
    let stop = false
    const cancelled = () => stop
    ;(async () => {
      const [root, nodes] = await Promise.all([chatApi.getSession(rootId).catch(() => null), readTree(cancelled)])
      if (stop) return
      const rootNode = nodes.find((n) => n.session_id === rootId)
      await loadSession({
        id: rootId, relation: 'root', title: opts.rootTitle || root?.title || rootId.slice(0, 8),
        provider: root?.provider_id ?? undefined, model: root?.model, createdAt: root?.created_at, isStreaming: rootNode?.is_streaming ?? false,
      }, cancelled)
      const children = nodes.filter((n) => n.session_id !== rootId)
      const queue = [...children]
      const worker = async () => {
        while (queue.length > 0 && !stop) {
          const n = queue.shift() as SessionTreeNode
          await loadSession({
            id: n.session_id, relation: 'child', parentId: n.parent_session_id ?? rootId,
            title: n.title || n.session_id.slice(0, 8), provider: n.provider_id ?? undefined, model: n.model ?? undefined,
            createdAt: n.created_at ?? undefined, isStreaming: n.is_streaming,
          }, cancelled)
        }
      }
      await Promise.all([worker(), worker()])
    })()
    return () => {
      stop = true
    }
    // `rootTitle` is a label, not a reason to reload everything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootId, attempt, loadSession, readTree])

  const streaming = !!opts.isStreaming || [...state.values()].some((s) => s.meta.isStreaming)

  // While something streams (or the chat's messages change): fetch only what is new.
  const lastRefresh = useRef(0)
  const refresh = useCallback(async () => {
    lastRefresh.current = Date.now()
    let stop = false
    const cancelled = () => stop
    const nodes = await readTree(cancelled)
    for (const n of nodes) {
      if (!stateRef.current.has(n.session_id) && n.session_id !== rootId) {
        void loadSession({
          id: n.session_id, relation: 'child', parentId: n.parent_session_id ?? rootId ?? undefined,
          title: n.title || n.session_id.slice(0, 8), provider: n.provider_id ?? undefined, model: n.model ?? undefined,
          createdAt: n.created_at ?? undefined, isStreaming: n.is_streaming,
        }, cancelled)
      }
    }
    for (const [id, s] of stateRef.current) {
      if (s.status !== 'ready' || busy.current.has(id)) continue
      if (id !== rootId && !s.meta.isStreaming) continue
      busy.current.add(id)
      try {
        const loaded = s.from + s.events.length
        const page = await loadNewer(fetcher(id), loaded, TRACE_PAGE_SIZE)
        if (page.events.length > 0) patch(id, (prev) => prev && { ...prev, events: [...prev.events, ...page.events], total: page.total })
      } catch {
        /* the next refresh tries again */
      } finally {
        busy.current.delete(id)
      }
    }
    stop = true
  }, [loadSession, patch, readTree, rootId])

  useEffect(() => {
    if (!streaming) return
    const id = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [streaming, refresh])

  // The chat's messages changed (a new event on screen): refresh soon, not on every token.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const wait = Math.max(0, REFRESH_MS / 2 - (Date.now() - lastRefresh.current))
    const id = window.setTimeout(() => void refresh(), wait)
    return () => window.clearTimeout(id)
  }, [opts.refreshKey, refresh])

  const sessions = useMemo<TraceSession[]>(() => {
    const out: TraceSession[] = []
    for (const s of state.values()) out.push({ ...s.meta, ...(s.meta.relation === 'root' && opts.isStreaming != null ? { isStreaming: opts.isStreaming || s.meta.isStreaming } : {}), messages: messagesOf(s.events) })
    return out
  }, [state, opts.isStreaming])

  const loading = useMemo(() => {
    let loaded = 0
    let total = 0
    let any = false
    for (const s of state.values()) {
      loaded += s.events.length
      total += Math.max(s.total, s.events.length)
      if (s.status === 'loading') any = true
    }
    if (rootId && state.size === 0) return { loaded: 0, total: 0 }
    return any ? { loaded, total } : null
  }, [state, rootId])

  return {
    sessions,
    loading,
    failed: [...state.values()].some((s) => s.status === 'error'),
    retry: useCallback(() => setAttempt((n) => n + 1), []),
    streaming,
  }
}

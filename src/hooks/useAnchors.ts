/**
 * The anchors of one conversation, and the conversations anchored on one entity.
 *
 * Both read once, then follow `/ws/events` (`chat_session` / `updated` with an
 * `anchors` payload). A server without the routes leaves them `unavailable`:
 * the component that reads them shows that, nothing throws.
 *
 * Mutations send the version of the set as `If-Match`. A 409 replaces what is
 * on screen with the CURRENT set the server returned and says so (`notice`):
 * the change is never re-sent on top of someone else's.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useEventBus } from './useEventBus'
import {
  anchorEventOf,
  anchorsApi,
  AnchorConflictError,
  AnchorRefusedError,
  AnchorsUnavailableError,
  ANCHORED_PAGE_DEFAULT,
  type AddAnchorInput,
  type Anchor,
  type AnchoredSessionItem,
  type AnchorSet,
  type AnchorTargetType,
} from '@/services/anchors'
import type { ChatSession } from '@/types'
import type { CrudEvent } from '@/types'

export type AnchorsStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'

/** What the last mutation ended on, for the live region. */
export type AnchorNotice =
  | { kind: 'conflict' }
  | { kind: 'refused'; code: string | null; message: string }
  | { kind: 'failed' }
  | { kind: 'done'; action: 'added' | 'removed' | 'promoted' | 'demoted'; anchor: Pick<Anchor, 'target_type' | 'target_id' | 'snapshot_name'> }

export interface SessionAnchors {
  status: AnchorsStatus
  set: AnchorSet | null
  notice: AnchorNotice | null
  pending: boolean
  reload: () => void
  add: (input: AddAnchorInput) => Promise<boolean>
  remove: (anchor: Anchor) => Promise<boolean>
  promote: (anchor: Anchor) => Promise<boolean>
  demote: (anchor: Anchor) => Promise<boolean>
  clearNotice: () => void
}

export function useSessionAnchors(sessionId: string | null | undefined): SessionAnchors {
  const [status, setStatus] = useState<AnchorsStatus>('idle')
  const [set, setSet] = useState<AnchorSet | null>(null)
  const [notice, setNotice] = useState<AnchorNotice | null>(null)
  const [pending, setPending] = useState(false)
  const setRef = useRef<AnchorSet | null>(null)
  const sessionRef = useRef(sessionId)
  useEffect(() => {
    sessionRef.current = sessionId
  }, [sessionId])
  const unavailableRef = useRef(false)

  const apply = useCallback((next: AnchorSet | null) => {
    setRef.current = next
    setSet(next)
  }, [])

  const load = useCallback(
    (id: string) => {
      setStatus((s) => (s === 'ready' ? s : 'loading'))
      void Promise.resolve()
        .then(() => anchorsApi.list(id))
        .then((next) => {
          if (sessionRef.current !== id) return
          apply(next)
          setStatus('ready')
        })
        .catch((err: unknown) => {
          if (sessionRef.current !== id) return
          if (err instanceof AnchorsUnavailableError) {
            unavailableRef.current = true
            setStatus('unavailable')
          } else {
            setStatus('error')
          }
        })
    },
    [apply],
  )

  useEffect(() => {
    apply(null)
    setNotice(null)
    if (!sessionId || unavailableRef.current) {
      setStatus(sessionId ? 'unavailable' : 'idle')
      return
    }
    setStatus('loading')
    load(sessionId)
  }, [sessionId, load, apply])

  const onEvent = useCallback(
    (event: CrudEvent) => {
      const id = sessionRef.current
      if (!id || event.entity_type !== 'chat_session' || event.entity_id !== id) return
      const change = anchorEventOf(event.payload)
      if (!change) return
      // Our own change already moved the version: nothing new to read.
      if (setRef.current && change.version > 0 && change.version <= setRef.current.version) return
      load(id)
    },
    [load],
  )
  useEventBus(onEvent)

  const mutate = useCallback(
    async (
      run: (id: string, version: number) => Promise<{ anchor: Anchor; version: number; changed: boolean }>,
      action: Extract<AnchorNotice, { kind: 'done' }>['action'],
    ): Promise<boolean> => {
      const id = sessionRef.current
      const current = setRef.current
      if (!id || !current) return false
      setPending(true)
      try {
        const result = await Promise.resolve().then(() => run(id, current.version))
        if (sessionRef.current !== id) return false
        setNotice({ kind: 'done', action, anchor: result.anchor })
        load(id)
        return true
      } catch (err) {
        if (sessionRef.current !== id) return false
        if (err instanceof AnchorConflictError) {
          // Someone else changed the set: show theirs, never write over it.
          if (err.current) apply(err.current)
          else load(id)
          setNotice({ kind: 'conflict' })
        } else if (err instanceof AnchorRefusedError) {
          setNotice({ kind: 'refused', code: err.code, message: err.message })
        } else if (err instanceof AnchorsUnavailableError) {
          unavailableRef.current = true
          setStatus('unavailable')
        } else {
          setNotice({ kind: 'failed' })
        }
        return false
      } finally {
        setPending(false)
      }
    },
    [apply, load],
  )

  return {
    status,
    set,
    notice,
    pending,
    reload: useCallback(() => {
      if (sessionRef.current) load(sessionRef.current)
    }, [load]),
    add: useCallback((input: AddAnchorInput) => mutate((id, v) => anchorsApi.add(id, input, v), 'added'), [mutate]),
    remove: useCallback((a: Anchor) => mutate((id, v) => anchorsApi.remove(id, a.id, v), 'removed'), [mutate]),
    promote: useCallback((a: Anchor) => mutate((id, v) => anchorsApi.setRole(id, a.id, 'promote', 'focus', v), 'promoted'), [mutate]),
    // An anchor never stays without a role: a focus-only anchor first gains `mention`,
    // then loses `focus`, the second call carrying the version the first one returned.
    demote: useCallback(
      (a: Anchor) =>
        mutate(async (id, v) => {
          let version = v
          if (!a.roles.includes('mention')) version = (await anchorsApi.setRole(id, a.id, 'promote', 'mention', version)).version
          return anchorsApi.setRole(id, a.id, 'demote', 'focus', version)
        }, 'demoted'),
      [mutate],
    ),
    clearNotice: useCallback(() => setNotice(null), []),
  }
}

export interface AnchoredSessions {
  status: AnchorsStatus
  items: AnchoredSessionItem<ChatSession>[]
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
  reload: () => void
}

/** The conversations anchored on one entity (reverse read), page by page, live. */
export function useAnchoredSessions(target: { type: AnchorTargetType; id: string } | null, pageSize = ANCHORED_PAGE_DEFAULT): AnchoredSessions {
  const [status, setStatus] = useState<AnchorsStatus>('idle')
  const [items, setItems] = useState<AnchoredSessionItem<ChatSession>[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [loadingMore, setLoadingMore] = useState(false)
  const key = target ? `${target.type}:${target.id}` : null
  const keyRef = useRef(key)
  const targetRef = useRef(target)
  useEffect(() => {
    keyRef.current = key
    targetRef.current = target
  })

  const loadFirst = useCallback(() => {
    const t = targetRef.current
    const k = keyRef.current
    if (!t || !k) return
    setStatus((s) => (s === 'ready' ? s : 'loading'))
    void Promise.resolve()
      .then(() => anchorsApi.listAnchoredSessions<ChatSession>({ target_type: t.type, target_id: t.id, limit: pageSize }))
      .then((page) => {
        if (keyRef.current !== k) return
        setItems(page.items)
        setCursor(page.next_cursor)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        if (keyRef.current !== k) return
        setStatus(err instanceof AnchorsUnavailableError ? 'unavailable' : 'error')
      })
  }, [pageSize])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on target change, before the read
    setItems([])
    setCursor(undefined)
    if (!key) {
      setStatus('idle')
      return
    }
    setStatus('loading')
    loadFirst()
  }, [key, loadFirst])

  const loadMore = useCallback(() => {
    const t = targetRef.current
    const k = keyRef.current
    if (!t || !k || !cursor || loadingMore) return
    setLoadingMore(true)
    void Promise.resolve()
      .then(() => anchorsApi.listAnchoredSessions<ChatSession>({ target_type: t.type, target_id: t.id, limit: pageSize, cursor }))
      .then((page) => {
        if (keyRef.current !== k) return
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.anchor.id))
          return [...prev, ...page.items.filter((i) => !seen.has(i.anchor.id))]
        })
        setCursor(page.next_cursor)
      })
      .catch(() => {
        /* the list on screen stays; the button stays to try again */
      })
      .finally(() => setLoadingMore(false))
  }, [cursor, loadingMore, pageSize])

  const onEvent = useCallback(
    (event: CrudEvent) => {
      const t = targetRef.current
      if (!t || event.entity_type !== 'chat_session') return
      const change = anchorEventOf(event.payload)
      if (change && change.target_type === t.type && change.target_id === t.id) loadFirst()
    },
    [loadFirst],
  )
  useEventBus(onEvent)

  return { status, items, hasMore: !!cursor, loadingMore, loadMore, reload: loadFirst }
}

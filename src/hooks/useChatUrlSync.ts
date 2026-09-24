import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ChatPanelMode } from '@/types'
import {
  isStartupDefault,
  parseChatUrl,
  writeChatUrl,
  type ChatUrlState,
} from '@/components/chat/chatUrlState'

/**
 * Keep the chat's session and panel mode in the URL, so a reload — or a
 * restart of the desktop app — reopens the conversation exactly as it was.
 *
 * Direction of truth:
 *   - at startup, the URL wins: whatever it names is restored once;
 *   - afterwards, the app wins: the URL mirrors the state and is rewritten with
 *     `replace`, so opening and closing the panel does not pile up history
 *     entries the back button would then have to walk through.
 *
 * Navigating between pages drops the query string (links carry their own), so
 * the mirror effect also depends on the location and puts the parameters back
 * on the new page.
 */
export function useChatUrlSync({
  sessionId,
  mode,
  setMode,
  loadSession,
}: {
  sessionId: string | null
  mode: ChatPanelMode
  setMode: (mode: ChatPanelMode) => void
  loadSession: (sessionId: string) => void
}) {
  const [searchParams, setSearchParams] = useSearchParams()

  // What the URL asked for at startup, until the app has visibly started
  // applying it. `undefined` = not read yet, `null` = nothing (left) pending.
  const pendingRef = useRef<ChatUrlState | null | undefined>(undefined)

  // Restore — once, on mount. The URL wins exactly this one time.
  useEffect(() => {
    if (pendingRef.current !== undefined) return
    const target = parseChatUrl(searchParams)
    const isEmpty = target.sessionId === null && target.mode === 'closed'
    pendingRef.current = isEmpty ? null : target
    if (target.sessionId) loadSession(target.sessionId)
    if (target.mode !== 'closed') setMode(target.mode)
    // Mount-only by design: after startup the URL follows the app, not the
    // other way round (see the hook's doc comment).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mirror — the app state into the URL.
  useEffect(() => {
    const pending = pendingRef.current
    if (pending === undefined) return
    const current: ChatUrlState = { sessionId, mode }
    if (pending !== null) {
      // The restore's state updates land a commit later. Until then the app
      // still shows the startup default, and writing it would erase the very
      // parameters being restored. Anything other than the default means the
      // restore (or the user) has acted, so the URL may follow from here on.
      if (isStartupDefault(current)) return
      pendingRef.current = null
    }
    const next = writeChatUrl(searchParams, current)
    if (next) setSearchParams(next, { replace: true })
  }, [sessionId, mode, searchParams, setSearchParams])
}

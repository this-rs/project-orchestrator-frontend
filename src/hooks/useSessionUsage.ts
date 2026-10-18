import { useEffect, useState } from 'react'
import { chatApi } from '@/services/chat'
import type { SessionUsage } from '@/types'

/**
 * Token usage of a conversation, as the backend sums it from the stored `result`
 * events (`GET /api/chat/sessions/{id}/usage`, CTX0). Read once per session and
 * again each time a turn ends — never on every token.
 *
 * `null` = not known yet (no session, in flight, or the request failed): a
 * caller shows nothing rather than a guess.
 */
export function useSessionUsage(sessionId: string | null, isStreaming: boolean): SessionUsage | null {
  const [usage, setUsage] = useState<{ sessionId: string; usage: SessionUsage } | null>(null)

  useEffect(() => {
    if (!sessionId || isStreaming) return
    let cancelled = false
    // A failure of any kind — a synchronous throw included — leaves the summary out: the
    // figure is a convenience, never a reason to break the trace it sits in.
    Promise.resolve()
      .then(() => chatApi.getSessionUsage(sessionId))
      .then((res) => {
        if (!cancelled && res) setUsage({ sessionId, usage: res })
      })
      .catch(() => {
        if (!cancelled) setUsage(null)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, isStreaming])

  return usage && usage.sessionId === sessionId ? usage.usage : null
}

import { useEffect, useState } from 'react'
import { chatApi } from '@/services/chat'

/**
 * Is the provider process of this conversation alive right now?
 *
 * Only asked when it matters (`enabled`): a provider that cannot RESUME a
 * conversation can only be talked to while its process lives. The answer comes
 * from `GET /chat/live-activity`, the server's in-memory truth — an absent
 * session is quiet, i.e. not live.
 *
 * `null` = not known (not asked, in flight, or the request failed): callers
 * must not block anything on an unknown.
 *
 * D9: This hook now polls periodically (not just on dependency changes) so that
 * if a provider process restarts and becomes live, the session composer is
 * unlocked promptly (not blocked forever).
 */
export function useSessionLive(sessionId: string | null, enabled: boolean, isStreaming: boolean): boolean | null {
  const [answer, setAnswer] = useState<{ sessionId: string; live: boolean } | null>(null)

  useEffect(() => {
    // A streaming turn is proof of life; ask again once it ends.
    if (!enabled || !sessionId || isStreaming) return
    let cancelled = false

    const checkLive = () => {
      chatApi
        .getLiveActivity()
        .then((res) => {
          if (!cancelled) setAnswer({ sessionId, live: res?.sessions?.[sessionId]?.live === true })
        })
        .catch(() => {
          if (!cancelled) setAnswer(null)
        })
    }

    // Check immediately
    checkLive()
    // Then poll every 5 seconds so we detect when a dead provider comes back to life (D9)
    const interval = setInterval(checkLive, 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [sessionId, enabled, isStreaming])

  if (!enabled || !sessionId) return null
  if (isStreaming) return true
  return answer && answer.sessionId === sessionId ? answer.live : null
}

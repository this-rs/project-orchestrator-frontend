import { useCallback, useEffect, useState } from 'react'
import { chatApi } from '@/services/chat'

/** How often a conversation known to be dead is asked about again. */
export const SESSION_LIVE_RECHECK_MS = 5000

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
 * A "dead" answer is not final: the process can come back (restart, another
 * client resuming it) and a closed composer would never notice. So it is asked
 * again when the tab regains focus or becomes visible, and every
 * `SESSION_LIVE_RECHECK_MS` WHILE the answer is "dead". Both stop on their own:
 * the interval is cleared as soon as the answer is anything but "dead", when
 * the session changes, when the hook is disabled, when a turn streams, and on
 * unmount; the listeners go with the effect.
 */
export function useSessionLive(sessionId: string | null, enabled: boolean, isStreaming: boolean): boolean | null {
  const [answer, setAnswer] = useState<{ sessionId: string; live: boolean } | null>(null)
  const active = enabled && !!sessionId && !isStreaming
  // A turn streaming is proof of life; asked again once it ends.
  const dead = active && answer?.sessionId === sessionId && answer.live === false

  const ask = useCallback(
    (isCurrent: () => boolean) => {
      if (!sessionId) return
      chatApi
        .getLiveActivity()
        .then((res) => {
          if (isCurrent()) setAnswer({ sessionId, live: res?.sessions?.[sessionId]?.live === true })
        })
        .catch(() => {
          if (isCurrent()) setAnswer(null)
        })
    },
    [sessionId],
  )

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const isCurrent = () => !cancelled
    ask(isCurrent)
    const onBack = () => {
      if (document.visibilityState !== 'hidden') ask(isCurrent)
    }
    window.addEventListener('focus', onBack)
    document.addEventListener('visibilitychange', onBack)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onBack)
      document.removeEventListener('visibilitychange', onBack)
    }
  }, [active, ask])

  useEffect(() => {
    if (!dead) return
    let cancelled = false
    const id = setInterval(() => ask(() => !cancelled), SESSION_LIVE_RECHECK_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [dead, ask])

  if (!enabled || !sessionId) return null
  if (isStreaming) return true
  return answer && answer.sessionId === sessionId ? answer.live : null
}

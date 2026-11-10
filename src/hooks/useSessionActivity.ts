import { useEffect, useState } from 'react'
import { chatApi } from '@/services/chat'
import { QUIET_ACTIVITY, type SessionActivity } from '@/types'

/**
 * How often the server is re-asked what this conversation is doing while a
 * question card is on screen. Same cadence as the conversation list
 * (`SessionList`'s `ACTIVITY_POLL_MS`): one truth, one rhythm.
 */
export const SESSION_ACTIVITY_POLL_MS = 5_000

/**
 * What the live server says THIS conversation is doing, or `null` = unknown.
 *
 * Why a read of its own, and not a field already on screen: `activity.state`
 * (and the `state_reason` that says which rule decided) is written by
 * `chat::segment_state` server-side and reaches no event stream — it is only
 * served by `GET /chat/live-activity`, and only for sessions that are LIVE
 * (a session absent from that map is quiet: absence is an answer, not missing
 * data). The conversation list polls it for its working indicators, but it
 * lives in that list's local state and unmounts with it (a phone hides the
 * sidebar while the transcript stays open), so the transcript reads it itself.
 *
 * `refreshKey` is the caller's "something changed that could change the
 * answer" signal — here, the set of question cards still awaiting an answer.
 * `null` disables the read entirely: no question on screen, no traffic. It also
 * bounds the cost, which is the reason the gate is not "is the session live?" —
 * an interrupted question stays in the transcript for ever, and polling for it
 * for ever would be a leak.
 *
 * The read STOPS once the server answers "not live": such a session can never
 * grow an open question again, and the caller re-reads when the transcript
 * moves. A FAILED read is different from a negative one: it leaves the last
 * known verdict in place and tries again, because "I could not ask" must never
 * be reported as "no, it is closed" — and an unknown verdict never makes
 * anything actionable downstream (see `questionAwaitsPerson`).
 */
export function useSessionActivity(sessionId: string | null, refreshKey: string | null): SessionActivity | null {
  const [answer, setAnswer] = useState<{ sessionId: string; activity: SessionActivity } | null>(null)

  useEffect(() => {
    if (!sessionId || refreshKey === null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      if (cancelled) return
      // A hidden tab is not asked: nobody is reading that card.
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        try {
          const data = await chatApi.getLiveActivity()
          if (cancelled) return
          // A session the server does not list is quiet — an answer, spelled out.
          const activity = data?.sessions?.[sessionId] ?? QUIET_ACTIVITY
          setAnswer({ sessionId, activity })
          // Not live: no question can be open there any more. Stop asking.
          if (!activity.live) return
        } catch {
          // No answer: keep the last verdict, ask again next tick.
        }
      }
      if (!cancelled) timer = setTimeout(tick, SESSION_ACTIVITY_POLL_MS)
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [sessionId, refreshKey])

  if (!sessionId || refreshKey === null) return null
  return answer && answer.sessionId === sessionId ? answer.activity : null
}

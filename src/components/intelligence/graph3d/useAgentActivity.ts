// ============================================================================
// useAgentActivity — the node an agent works on pulses as the call starts
// ============================================================================
//
// The agents running now are read by a 5 s poll (useLiveAgents): enough to know
// who is working, too slow to show WHAT they touch — a call lasts a second or
// two. This hook asks the socket for the chat events of those sessions
// (`/ws/events?sessions=`), reads each tool call's target (agentTouch) and
// publishes it on the pulse bus: the node under the agent's hand lights up at
// once, through the same renderer path as every other live pulse.
//
// It watches the sessions it is given and nothing else, and gives them back
// when it unmounts or when `enabled` goes false: a screen that shows no agents
// holds no subscription.
// ============================================================================

import { useEffect } from 'react'
import { getEventBus } from '@/services/eventBus'
import { touchedBy } from '../agentTouch'
import { emitEntityPulse } from '../livePulseBus'

/** The bus keeps one list per owner; this hook's list never collides with another screen's. */
const OWNER = 'graph3d-agent-activity'

export function useAgentActivity(sessionIds: readonly string[], enabled = true): void {
  // A string key: the effect re-runs when the SET changes, not on every poll.
  const key = enabled ? [...new Set(sessionIds)].sort().join(',') : ''

  useEffect(() => {
    if (!key) return
    const bus = getEventBus()
    bus.setSessions(OWNER, key.split(','))
    return () => bus.setSessions(OWNER, [])
  }, [key])

  useEffect(() => {
    if (!enabled) return
    const off = getEventBus().onChatFrame((_sessionId, event) => {
      const touch = touchedBy(event)
      if (touch) emitEntityPulse(touch.refs)
    })
    return () => {
      off()
    }
  }, [enabled])
}

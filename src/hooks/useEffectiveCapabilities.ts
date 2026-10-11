import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  chatSessionCapabilitiesSnapshotAtom,
  chatSessionEffectiveCapabilitiesStateAtom,
  chatSessionEngineAtom,
  chatSessionIdAtom,
  chatSessionRoutingAtom,
  chatStreamingAtom,
} from '@/atoms'
import { chatApi } from '@/services/chat'

/**
 * Keeps `ChatSession.effective_capabilities` of the current session up to date (F-R4): what the
 * next turn can really carry follows the candidates PO may route it to, so it is read again
 * whenever that can change — a new `system_init` (the session opened or resumed), a routing
 * change (`PUT .../routing` updates `chatSessionRoutingAtom`), the end of a turn (PO may have
 * moved the conversation or changed its model). A failed read says nothing (the snapshot then
 * decides), never an invented capability.
 */
export function useEffectiveCapabilities(): void {
  const sessionId = useAtomValue(chatSessionIdAtom)
  const routing = useAtomValue(chatSessionRoutingAtom)
  const engine = useAtomValue(chatSessionEngineAtom)
  const snapshot = useAtomValue(chatSessionCapabilitiesSnapshotAtom)
  const streaming = useAtomValue(chatStreamingAtom)
  const setState = useSetAtom(chatSessionEffectiveCapabilitiesStateAtom)

  useEffect(() => {
    if (!sessionId || streaming) return
    let alive = true
    // A sync throw (a service without the route) is a failed read like any other.
    Promise.resolve()
      .then(() => chatApi.getSession(sessionId))
      .then((session) => {
        if (alive) setState({ sessionId, capabilities: session.effective_capabilities ?? null })
      })
      .catch(() => {
        if (alive) setState({ sessionId, capabilities: null })
      })
    return () => {
      alive = false
    }
  }, [sessionId, routing, engine, snapshot, streaming, setState])
}

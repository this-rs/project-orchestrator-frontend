import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { eventBusStatusAtom } from '@/atoms'
import { getEventBus } from '@/services'
import type { CrudEvent } from '@/types'

/**
 * Hook that connects the EventBus singleton and syncs its status to Jotai.
 * Optionally receives an onEvent callback for reacting to specific events.
 */
export function useEventBus(onEvent?: (event: CrudEvent) => void) {
  const setStatus = useSetAtom(eventBusStatusAtom)

  useEffect(() => {
    const bus = getEventBus()

    // Sync status to Jotai atom
    const offStatus = bus.onStatus(setStatus)
    // Set initial status
    setStatus(bus.status)

    // Connect if not already
    bus.connect()

    // Subscribe to events if callback provided
    let offEvent: (() => void) | undefined
    if (onEvent) {
      offEvent = bus.on(onEvent)
    }

    return () => {
      offStatus()
      offEvent?.()
    }
  }, [setStatus, onEvent])
}

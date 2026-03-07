// ============================================================================
// useProtocolRunEvents — Listen to CRUD events for protocol runs and update
// intelligence graph nodes in real-time.
//
// This hook bridges the EventBus (CRUD WebSocket) with the intelligence graph
// Jotai atoms. When a ProtocolRun is created/updated/completed/failed, it
// updates the `runStatus` field on the corresponding ProtocolNode so that the
// pulsing overlay reflects the live state.
// ============================================================================

import { useCallback, useRef, useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { intelligenceNodesAtom } from '@/atoms/intelligence'
import { useEventBus } from '@/hooks/useEventBus'
import type { CrudEvent } from '@/types/events'
import type { RunStatus, ProtocolRunProgress, IntelligenceNode } from '@/types/intelligence'

/**
 * Callback for progress events — consumers can display live progress
 * in the ProtocolRunViewer or ContextCard.
 */
export type ProgressCallback = (progress: ProtocolRunProgress) => void

/**
 * Hook that listens to `protocol_run` CRUD events and:
 * 1. Sets `runStatus` on the matching protocol node (by protocol_id in payload)
 * 2. Forwards progress events to an optional callback
 */
export function useProtocolRunEvents(onProgress?: ProgressCallback) {
  const setNodes = useSetAtom(intelligenceNodesAtom)
  const onProgressRef = useRef(onProgress)
  useEffect(() => {
    onProgressRef.current = onProgress
  }, [onProgress])

  // Build a Map<protocol_id → runStatus> for quick lookup
  // We track active runs to know when to clear runStatus
  const activeRunsRef = useRef<Map<string, { runId: string; status: RunStatus }>>(new Map())

  // Track pending clear timers so we can cancel them on unmount or new events
  const clearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  /** Schedule a delayed clear of the runStatus overlay, cancelling any existing timer for the same protocolId */
  const scheduleClear = useCallback(
    (protocolId: string) => {
      // Cancel any existing timer for this protocol
      const existing = clearTimersRef.current.get(protocolId)
      if (existing) clearTimeout(existing)

      const timerId = setTimeout(() => {
        clearTimersRef.current.delete(protocolId)
        setNodes((prev: IntelligenceNode[]) =>
          prev.map((node) => {
            if (node.data.entityType === 'protocol' && node.data.entityId === protocolId) {
              return {
                ...node,
                data: { ...node.data, runStatus: undefined } as IntelligenceNode['data'],
              }
            }
            return node
          }),
        )
      }, 5000)
      clearTimersRef.current.set(protocolId, timerId)
    },
    [setNodes],
  )

  const updateProtocolNode = useCallback(
    (protocolId: string, runStatus: RunStatus | undefined) => {
      // If we're setting a new active status, cancel any pending clear timer
      if (runStatus) {
        const existing = clearTimersRef.current.get(protocolId)
        if (existing) {
          clearTimeout(existing)
          clearTimersRef.current.delete(protocolId)
        }
      }

      setNodes((prev: IntelligenceNode[]) =>
        prev.map((node) => {
          // Match protocol nodes by entityId === protocolId
          if (node.data.entityType === 'protocol' && node.data.entityId === protocolId) {
            return {
              ...node,
              data: {
                ...node.data,
                runStatus,
                // Flash animation for status changes
                _wsAnimation: runStatus === 'running' ? undefined : 'flash',
                _wsAnimKey: Date.now(),
              } as IntelligenceNode['data'],
            }
          }
          return node
        }),
      )
    },
    [setNodes],
  )

  const handleEvent = useCallback(
    (event: CrudEvent) => {
      if (event.entity_type !== 'protocol_run') return

      const payload = event.payload ?? {}
      const protocolId = payload.protocol_id as string | undefined
      const status = payload.status as RunStatus | undefined
      const runId = event.entity_id

      switch (event.action) {
        case 'created': {
          // A new run started
          if (protocolId) {
            activeRunsRef.current.set(protocolId, { runId, status: 'running' })
            updateProtocolNode(protocolId, 'running')
          }
          break
        }

        case 'updated': {
          // Run status changed (transition fired, completed, failed, cancelled)
          if (protocolId && status) {
            if (status === 'running') {
              activeRunsRef.current.set(protocolId, { runId, status })
              updateProtocolNode(protocolId, 'running')
            } else {
              // Terminal status — show briefly then clear
              activeRunsRef.current.delete(protocolId)
              updateProtocolNode(protocolId, status)
              // Clear the overlay after 5 seconds for completed/failed/cancelled
              scheduleClear(protocolId)
            }
          } else if (!protocolId) {
            // If no protocol_id in payload, find it from activeRuns
            for (const [pid, run] of activeRunsRef.current.entries()) {
              if (run.runId === runId && status) {
                if (status === 'running') {
                  activeRunsRef.current.set(pid, { runId, status })
                  updateProtocolNode(pid, 'running')
                } else {
                  activeRunsRef.current.delete(pid)
                  updateProtocolNode(pid, status)
                  scheduleClear(pid)
                }
                break
              }
            }
          }
          break
        }

        case 'progress': {
          // Forward progress data to callback
          if (onProgressRef.current) {
            try {
              const progress: ProtocolRunProgress = {
                run_id: payload.run_id as string ?? runId,
                state_name: payload.state_name as string ?? '',
                sub_action: payload.sub_action as string ?? '',
                processed: payload.processed as number ?? 0,
                total: payload.total as number ?? 0,
                display: payload.display as string ?? '',
                elapsed_ms: payload.elapsed_ms as number ?? 0,
              }
              onProgressRef.current(progress)
            } catch {
              // Ignore malformed progress events
            }
          }
          break
        }

        case 'deleted': {
          // Run was deleted — clear overlay
          for (const [pid, run] of activeRunsRef.current.entries()) {
            if (run.runId === runId) {
              activeRunsRef.current.delete(pid)
              updateProtocolNode(pid, undefined)
              break
            }
          }
          break
        }
      }
    },
    [updateProtocolNode, scheduleClear],
  )

  useEventBus(handleEvent)

  // Cleanup on unmount: clear all pending timers and active runs
  useEffect(() => {
    const runsMap = activeRunsRef.current
    const timersMap = clearTimersRef.current
    return () => {
      // Clear all pending setTimeout timers
      for (const timerId of timersMap.values()) {
        clearTimeout(timerId)
      }
      timersMap.clear()
      runsMap.clear()
    }
  }, [])
}

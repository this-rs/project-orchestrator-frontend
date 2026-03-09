/**
 * useSessionTree — fetches and polls the session tree for a root session.
 *
 * Returns the flat tree array, loading state, whether any node is streaming,
 * and a manual refresh function.
 * Auto-polls every 3 s while at least one node has is_streaming === true.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { chatApi } from '@/services/chat'
import type { SessionTreeNode } from '@/types'

// ---------------------------------------------------------------------------
// Hook result
// ---------------------------------------------------------------------------

interface UseSessionTreeResult {
  /** Flat list of tree nodes (depth-first order from backend) */
  tree: SessionTreeNode[]
  /** True during the initial fetch (before first data arrives) */
  isLoading: boolean
  /** True when at least one node in the tree is actively streaming */
  hasStreamingNodes: boolean
  /** Manually re-fetch the tree */
  refresh: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 3_000

export function useSessionTree(sessionId: string | undefined): UseSessionTreeResult {
  const [tree, setTree] = useState<SessionTreeNode[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  const fetchTree = useCallback(async () => {
    const sid = sessionIdRef.current
    if (!sid) return

    try {
      setIsLoading((prev) => (tree.length === 0 ? true : prev))
      const data = await chatApi.getSessionTree(sid)
      if (sessionIdRef.current === sid) {
        setTree(data)

        // Stop polling when nothing is streaming
        const anyStreaming = data.some((n) => n.is_streaming)
        if (!anyStreaming && timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }
    } catch {
      // API not available yet — graceful fallback
      if (sessionIdRef.current === sid) {
        setTree([])
      }
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!sessionId) {
      setTree([])
      return
    }

    fetchTree()
    timerRef.current = setInterval(fetchTree, POLL_INTERVAL_MS)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [sessionId, fetchTree])

  const hasStreamingNodes = tree.some((n) => n.is_streaming)

  return { tree, isLoading, hasStreamingNodes, refresh: fetchTree }
}

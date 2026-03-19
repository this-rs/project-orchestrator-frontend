/**
 * useDiscussionTree — fetches and polls the discussion tree for a session.
 *
 * Returns the tree structure, loading state, error, and a manual refresh fn.
 * Auto-polls while any node in the tree has status 'streaming'.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { discussionsApi, type DiscussionNode } from '@/services/discussions'
import type { SessionTreeNode } from '@/services/discussions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively check if any node in the tree is actively streaming. */
function hasStreamingNode(node: DiscussionNode): boolean {
  if (node.status === 'streaming') return true
  return (node.children ?? []).some(hasStreamingNode)
}

/**
 * Build a nested DiscussionNode tree from the flat SessionTreeNode[] list
 * returned by the backend. Each SessionTreeNode has a parent_session_id and
 * depth — we reconstruct the hierarchy here.
 */
function buildTreeFromFlat(flatNodes: SessionTreeNode[]): DiscussionNode | null {
  if (flatNodes.length === 0) return null

  // Build a lookup map of session_id → DiscussionNode
  const nodeMap = new Map<string, DiscussionNode>()
  for (const flat of flatNodes) {
    nodeMap.set(flat.session_id, {
      session_id: flat.session_id,
      title: null,
      status: 'idle',
      cost_usd: 0,
      duration_secs: 0,
      message_count: 0,
      children: [],
      metadata: {
        type: flat.spawn_type ?? (flat.depth === 0 ? 'root' : 'conversation'),
        run_id: flat.run_id ?? undefined,
        task_id: flat.task_id ?? undefined,
      },
    })
  }

  // Wire parent→child relationships
  let root: DiscussionNode | null = null
  for (const flat of flatNodes) {
    const node = nodeMap.get(flat.session_id)!
    if (flat.parent_session_id && nodeMap.has(flat.parent_session_id)) {
      nodeMap.get(flat.parent_session_id)!.children.push(node)
    }
    if (flat.depth === 0) {
      root = node
    }
  }

  return root ?? nodeMap.get(flatNodes[0].session_id) ?? null
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseDiscussionTreeResult {
  tree: DiscussionNode | null
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useDiscussionTree(
  sessionId: string | undefined,
  pollIntervalMs: number = 3000,
): UseDiscussionTreeResult {
  const [tree, setTree] = useState<DiscussionNode | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  const fetchTree = useCallback(async () => {
    const sid = sessionIdRef.current
    if (!sid) return

    try {
      setIsLoading((prev) => (tree === null ? true : prev))
      const flatNodes = await discussionsApi.getTree(sid)
      if (sessionIdRef.current === sid) {
        const builtTree = buildTreeFromFlat(flatNodes)
        setTree(builtTree)
        setError(null)

        // Stop polling when nothing is streaming
        if (builtTree && !hasStreamingNode(builtTree) && timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }
    } catch (err) {
      if (sessionIdRef.current === sid) {
        setError(err instanceof Error ? err.message : 'Failed to fetch discussion tree')
      }
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!sessionId) {
      setTree(null)
      setError(null)
      return
    }

    fetchTree()
    timerRef.current = setInterval(fetchTree, pollIntervalMs)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [sessionId, pollIntervalMs, fetchTree])

  return { tree, isLoading, error, refresh: fetchTree }
}

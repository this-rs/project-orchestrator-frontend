/**
 * Web Worker for client-side community detection (Louvain).
 *
 * Runs the pure `detectCommunities` off the main thread so a 20k-node graph
 * does not freeze the UI while the partition is computed.
 *
 * Protocol:
 *   Main → Worker: CommunityRequest { nodes: string[], edges: {source,target,weight?}[], options? }
 *   Worker → Main: CommunityResult { type: 'result', communities: Record<id, communityId>, count }
 */

import { detectCommunities } from '@/components/intelligence/graph3d/communityDetect'

interface CommunityEdge {
  source: string
  target: string
  weight?: number
}

interface CommunityRequest {
  nodes?: string[]
  edges?: CommunityEdge[]
  options?: { timeBudgetMs?: number; maxIterations?: number }
}

interface CommunityResult {
  type: 'result'
  /** node id → community id. Plain object: structured-clone friendly. */
  communities: Record<string, number>
  /** Number of distinct communities. */
  count: number
}

self.onmessage = (event: MessageEvent<CommunityRequest>) => {
  try {
    const { nodes = [], edges = [], options } = event.data ?? {}
    const partition = detectCommunities(nodes, edges, options)
    const communities: Record<string, number> = {}
    let count = 0
    for (const [id, c] of partition) {
      communities[id] = c
      if (c >= count) count = c + 1
    }
    self.postMessage({ type: 'result', communities, count } satisfies CommunityResult)
  } catch (err) {
    console.error('[communityWorker] Detection failed:', err)
    // Empty result instead of crashing: the caller keeps the fallback grouping.
    self.postMessage({ type: 'result', communities: {}, count: 0 } satisfies CommunityResult)
  }
}

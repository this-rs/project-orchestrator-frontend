/**
 * Web Worker for dagre graph layout computation.
 *
 * Moves the expensive O(V+E) dagre layout off the main thread so the UI
 * stays responsive while computing positions for large graphs (1000+ nodes).
 *
 * Protocol:
 *   Main → Worker: { nodes: SerializedNode[], edges: SerializedEdge[], nodesep?, ranksep? }
 *   Worker → Main: { nodes: { id: string, x: number, y: number }[] }
 */

import dagre from 'dagre'

// ── Types (minimal serializable subset — no React/ReactFlow deps) ───────────

interface SerializedNode {
  id: string
  width: number
  height: number
}

interface SerializedEdge {
  source: string
  target: string
}

interface LayoutRequest {
  nodes: SerializedNode[]
  edges: SerializedEdge[]
  nodesep?: number
  ranksep?: number
}

interface LayoutResult {
  nodes: { id: string; x: number; y: number }[]
}

// ── Worker message handler ──────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const { nodes, edges, nodesep = 40, ranksep = 60 } = event.data

  if (nodes.length === 0) {
    const result: LayoutResult = { nodes: [] }
    self.postMessage(result)
    return
  }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep, ranksep, marginx: 30, marginy: 30 })

  for (const node of nodes) {
    g.setNode(node.id, { width: node.width, height: node.height })
  }

  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target)
    }
  }

  dagre.layout(g)

  const result: LayoutResult = {
    nodes: nodes.map((node) => {
      const pos = g.node(node.id)
      return {
        id: node.id,
        x: pos ? pos.x - node.width / 2 : 0,
        y: pos ? pos.y - node.height / 2 : 0,
      }
    }),
  }

  self.postMessage(result)
}

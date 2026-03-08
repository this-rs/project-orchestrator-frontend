/**
 * Web Worker for dagre graph layout computation.
 *
 * Optimizations over the naive single-pass approach:
 * 1. Splits the graph into connected components (BFS)
 * 2. Layouts each component independently (much faster — dagre is super-linear)
 * 3. Reports progress after each component completes
 * 4. Packs components into a grid with spacing
 *
 * Protocol:
 *   Main → Worker: LayoutRequest { nodes, edges, nodesep?, ranksep? }
 *   Worker → Main: LayoutProgress { type: 'progress', done, total, nodesDone }
 *   Worker → Main: LayoutResult   { type: 'result', nodes }
 */

import dagre from 'dagre'

// ── Types ────────────────────────────────────────────────────────────────────

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

interface PositionedNode {
  id: string
  x: number
  y: number
}

interface LayoutProgress {
  type: 'progress'
  done: number
  total: number
  nodesDone: number
  nodesTotal: number
}

interface LayoutResult {
  type: 'result'
  nodes: PositionedNode[]
  components: number
}

// ── Connected components (BFS) ──────────────────────────────────────────────

interface Component {
  nodes: SerializedNode[]
  edges: SerializedEdge[]
}

function findConnectedComponents(
  nodes: SerializedNode[],
  edges: SerializedEdge[],
): Component[] {
  const nodeMap = new Map<string, SerializedNode>()
  for (const n of nodes) nodeMap.set(n.id, n)

  // Build adjacency list
  const adj = new Map<string, Set<string>>()
  for (const n of nodes) adj.set(n.id, new Set())
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source)!.add(e.target)
      adj.get(e.target)!.add(e.source)
    }
  }

  const visited = new Set<string>()
  const components: Component[] = []

  for (const node of nodes) {
    if (visited.has(node.id)) continue

    // BFS from this node
    const compNodeIds = new Set<string>()
    const queue = [node.id]
    visited.add(node.id)

    while (queue.length > 0) {
      const current = queue.shift()!
      compNodeIds.add(current)
      for (const neighbor of adj.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }

    const compNodes = [...compNodeIds].map((id) => nodeMap.get(id)!)
    const compEdges = edges.filter(
      (e) => compNodeIds.has(e.source) && compNodeIds.has(e.target),
    )
    components.push({ nodes: compNodes, edges: compEdges })
  }

  return components
}

// ── Layout a single component ───────────────────────────────────────────────

interface ComponentResult {
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
}

function layoutComponent(
  comp: Component,
  nodesep: number,
  ranksep: number,
): ComponentResult {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep, ranksep, marginx: 20, marginy: 20 })

  for (const node of comp.nodes) {
    g.setNode(node.id, { width: node.width, height: node.height })
  }
  for (const edge of comp.edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target)
    }
  }

  dagre.layout(g)

  const positions = new Map<string, { x: number; y: number }>()
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const node of comp.nodes) {
    const pos = g.node(node.id)
    if (pos) {
      const x = pos.x - node.width / 2
      const y = pos.y - node.height / 2
      positions.set(node.id, { x, y })
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + node.width)
      maxY = Math.max(maxY, y + node.height)
    }
  }

  // Normalize to origin (0,0)
  if (positions.size > 0) {
    for (const [id, pos] of positions) {
      positions.set(id, { x: pos.x - minX, y: pos.y - minY })
    }
  }

  return {
    positions,
    width: maxX - minX,
    height: maxY - minY,
  }
}

// ── Grid packing ────────────────────────────────────────────────────────────

const COMPONENT_GAP = 120

function packComponents(results: ComponentResult[]): Map<string, { x: number; y: number }> {
  if (results.length === 0) return new Map()
  if (results.length === 1) return results[0].positions

  // Sort by size (largest first) for better packing
  const indexed = results.map((r, i) => ({ r, i }))
  indexed.sort((a, b) => (b.r.width * b.r.height) - (a.r.width * a.r.height))

  // Simple row-based packing: fill rows, wrap when exceeding target width
  // Target: roughly square-ish overall layout
  const totalArea = results.reduce((sum, r) => sum + (r.width + COMPONENT_GAP) * (r.height + COMPONENT_GAP), 0)
  const targetRowWidth = Math.max(Math.sqrt(totalArea) * 1.5, indexed[0].r.width + COMPONENT_GAP)

  const merged = new Map<string, { x: number; y: number }>()
  let curX = 0
  let curY = 0
  let rowMaxHeight = 0

  for (const { r } of indexed) {
    // Wrap to next row if this component would exceed target width
    if (curX > 0 && curX + r.width > targetRowWidth) {
      curX = 0
      curY += rowMaxHeight + COMPONENT_GAP
      rowMaxHeight = 0
    }

    // Place component at (curX, curY)
    for (const [id, pos] of r.positions) {
      merged.set(id, { x: pos.x + curX, y: pos.y + curY })
    }

    curX += r.width + COMPONENT_GAP
    rowMaxHeight = Math.max(rowMaxHeight, r.height)
  }

  return merged
}

// ── Worker message handler ──────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const { nodes, edges, nodesep = 40, ranksep = 60 } = event.data

  if (nodes.length === 0) {
    self.postMessage({ type: 'result', nodes: [], components: 0 } satisfies LayoutResult)
    return
  }

  // 1. Split into connected components
  const components = findConnectedComponents(nodes, edges)

  // Sort: smallest first — small clusters finish instantly and give visible
  // progress while the large clusters (which block the thread) run last.
  components.sort((a, b) => a.nodes.length - b.nodes.length)

  const total = components.length
  let nodesDone = 0
  const nodesTotal = nodes.length

  // Report initial state
  self.postMessage({
    type: 'progress',
    done: 0,
    total,
    nodesDone: 0,
    nodesTotal,
  } satisfies LayoutProgress)

  // 2. Layout each component and report progress
  const compResults: ComponentResult[] = []

  for (let i = 0; i < components.length; i++) {
    const comp = components[i]
    const result = layoutComponent(comp, nodesep, ranksep)
    compResults.push(result)

    nodesDone += comp.nodes.length
    self.postMessage({
      type: 'progress',
      done: i + 1,
      total,
      nodesDone,
      nodesTotal,
    } satisfies LayoutProgress)
  }

  // 3. Pack components into a grid
  const finalPositions = packComponents(compResults)

  // 4. Build result
  const resultNodes: PositionedNode[] = nodes.map((node) => {
    const pos = finalPositions.get(node.id)
    return {
      id: node.id,
      x: pos ? pos.x : 0,
      y: pos ? pos.y : 0,
    }
  })

  self.postMessage({
    type: 'result',
    nodes: resultNodes,
    components: total,
  } satisfies LayoutResult)
}

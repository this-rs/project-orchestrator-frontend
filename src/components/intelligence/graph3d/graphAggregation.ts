// ============================================================================
// graphAggregation — deterministic multi-scale aggregation of a 3D graph
// ============================================================================
//
// A node-link diagram of thousands of nodes and edges is a hairball: no layout
// makes it readable, because every edge is drawn at full detail. The fix the
// user asked for is multi-scale: bucket nodes into a 3D grid at a given
// resolution, draw one SUPER-NODE per occupied cell (sized by count) and one
// SUPER-EDGE per cell pair (weight = how many original edges bundle there).
// Coarser resolution = one step up the scale; the ~5:1 fan-in is a grid where
// each axis doubles (8 cells merge into 1), which reads as "several → one".
//
// Everything here is pure and deterministic (same input → same output), so it
// is unit-tested without WebGL. The renderer picks a resolution per zoom level
// and calls this; drilling in raises the resolution around a super-node.
// ============================================================================

import type { Graph3DNode, Graph3DLink } from './useGraph3DLayout'

export interface SuperNode {
  /** Cell key — stable id of the aggregate. */
  key: string
  /** How many original nodes fall in this cell. */
  count: number
  /** Centroid of the original nodes in the cell. */
  x: number
  y: number
  z: number
}

export interface SuperEdge {
  /** Super-node key of the source cell. */
  source: string
  /** Super-node key of the target cell. */
  target: string
  /** Number of original edges bundled into this one. */
  count: number
  /** Sum of the original edge weights. */
  weight: number
}

export interface AggregatedGraph {
  superNodes: SuperNode[]
  superEdges: SuperEdge[]
  /** Original node index → cell key (for drill-down / inspection). */
  cellOfNode: Map<number, string>
}

/**
 * Aggregate `nodes`/`links` into a cubic grid of at most `res` cells per axis
 * over the graph's bounding box. O(N + E). Returns one super-node per occupied
 * cell and one super-edge per distinct cell pair.
 */
export function aggregateAtResolution(
  nodes: Graph3DNode[],
  links: Graph3DLink[],
  res: number,
): AggregatedGraph {
  const cellOfNode = new Map<number, string>()
  const superNodes: SuperNode[] = []
  if (nodes.length === 0) return { superNodes, superEdges: [], cellOfNode }

  // Bounding box.
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.z < minZ) minZ = n.z
    if (n.x > maxX) maxX = n.x
    if (n.y > maxY) maxY = n.y
    if (n.z > maxZ) maxZ = n.z
  }
  const spanX = Math.max(maxX - minX, 1e-6)
  const spanY = Math.max(maxY - minY, 1e-6)
  const spanZ = Math.max(maxZ - minZ, 1e-6)
  const r = Math.max(1, Math.floor(res))

  // Cell bucket → running centroid.
  type Acc = { count: number; sx: number; sy: number; sz: number }
  const cells = new Map<string, Acc>()
  // Clamp to [0, r-1]: a node sitting exactly on the max face must not spill
  // into an extra (r-th) cell.
  const cellIndex = (v: number, lo: number, span: number) =>
    Math.min(r - 1, Math.floor(((v - lo) / span) * r))
  const keyOf = (x: number, y: number, z: number) =>
    `${cellIndex(x, minX, spanX)},${cellIndex(y, minY, spanY)},${cellIndex(z, minZ, spanZ)}`

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    const k = keyOf(n.x, n.y, n.z)
    cellOfNode.set(i, k)
    const acc = cells.get(k)
    if (acc) { acc.count++; acc.sx += n.x; acc.sy += n.y; acc.sz += n.z }
    else cells.set(k, { count: 1, sx: n.x, sy: n.y, sz: n.z })
  }

  for (const [key, acc] of cells) {
    superNodes.push({ key, count: acc.count, x: acc.sx / acc.count, y: acc.sy / acc.count, z: acc.sz / acc.count })
  }

  // Aggregate edges between distinct cells. Key endpoints sorted so A→B and B→A
  // are the same bundle.
  const idToIndex = new Map<string, number>()
  for (let i = 0; i < nodes.length; i++) idToIndex.set(nodes[i].id, i)

  const edgeAcc = new Map<string, SuperEdge>()
  for (const link of links) {
    const si = idToIndex.get(typeof link.source === 'string' ? link.source : (link.source as Graph3DNode).id)
    const ti = idToIndex.get(typeof link.target === 'string' ? link.target : (link.target as Graph3DNode).id)
    if (si === undefined || ti === undefined) continue
    const c1 = cellOfNode.get(si)
    const c2 = cellOfNode.get(ti)
    if (!c1 || !c2 || c1 === c2) continue // intra-cell edges vanish into the super-node
    const [a, b] = c1 < c2 ? [c1, c2] : [c2, c1]
    const key = a + '\u0001' + b
    const e = edgeAcc.get(key)
    const w = link.weight ?? 0.5
    if (e) { e.count += 1; e.weight += w }
    else edgeAcc.set(key, { source: a, target: b, count: 1, weight: w })
  }

  return { superNodes, superEdges: [...edgeAcc.values()], cellOfNode }
}

/**
 * The resolution ladder for semantic zoom: level 0 = finest (all nodes), each
 * step up roughly halves the grid (≈8 cells → 1, i.e. "several of a scale become
 * one of the scale above"). Returned finest-first.
 */
export function resolutionLadder(nodeCount: number, topRes = 4, maxLevels = 6): number[] {
  const finest = Math.max(topRes, Math.ceil(Math.sqrt(nodeCount)))
  const ladder: number[] = []
  let res = finest
  for (let i = 0; i < maxLevels && res >= topRes; i++) {
    ladder.push(res)
    res = Math.floor(res / 2)
  }
  return ladder
}

/**
 * Turn an aggregated graph into render-ready Graph3DData (positions = cell
 * centroids, so no re-layout). Each super-node carries its dominant entity type
 * (for colour/shape) and a `byType` composition (for a stacked/composition
 * ring later). Super-edges carry `count` (how many links bundled) as their
 * importance, which the renderer maps to opacity/width.
 *
 * Pure and deterministic; the renderer just swaps this in for the raw graph.
 */
export function buildScaledGraph(
  data: { nodes: Graph3DNode[]; links: Graph3DLink[] },
  res: number,
): { nodes: Graph3DNode[]; links: Graph3DLink[] } {
  const { superNodes, superEdges, cellOfNode } = aggregateAtResolution(data.nodes, data.links, res)

  // Per-cell entity-type composition → dominant type + byType map.
  const cells = new Map<string, Map<string, number>>()
  const cellLayer = new Map<string, string>()
  for (let i = 0; i < data.nodes.length; i++) {
    const key = cellOfNode.get(i)
    if (!key) continue
    const t = data.nodes[i].entityType
    let m = cells.get(key)
    if (!m) { m = new Map(); cells.set(key, m) }
    m.set(t, (m.get(t) ?? 0) + 1)
    if (!cellLayer.has(key)) cellLayer.set(key, data.nodes[i].layer)
  }

  const nodes: Graph3DNode[] = superNodes.map((sn) => {
    const m = cells.get(sn.key)
    let dom = 'file'
    let domN = -1
    const byType: Record<string, number> = {}
    if (m) {
      for (const [t, n] of m) {
        byType[t] = n
        if (n > domN) { domN = n; dom = t }
      }
    }
    return {
      id: sn.key,
      label: String(sn.count),
      entityType: dom,
      layer: cellLayer.get(sn.key) ?? 'fabric',
      x: sn.x,
      y: sn.y,
      z: sn.z,
      data: { count: sn.count, byType },
    }
  })

  const links: Graph3DLink[] = superEdges.map((e) => ({
    source: e.source,
    target: e.target,
    relationType: 'AGGREGATE',
    layer: 'fabric',
    // Importance of a bundle = how many links it carries → renderer maps to
    // opacity (LineSegments) / width (cylinders). Saturate at a handful.
    weight: Math.min(1, e.count / 8),
    count: e.count,
    color: 'rgba(148, 163, 184, 0.4)',
    width: Math.min(4, 0.5 + e.count * 0.25),
    particles: 0,
    particleSpeed: 0,
    isInterCommunity: true,
  }))

  return { nodes, links }
}

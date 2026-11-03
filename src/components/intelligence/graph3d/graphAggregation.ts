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
// Two grouping strategies share the same O(N + E) core:
//   • aggregateAtResolution — cubic grid over the bounding box (the default);
//   • aggregateByGroup — one super-node per SEMANTIC group (the node's
//     `groupKey`, e.g. "c7" for community 7, or "dsrc/chat" for a directory).
//     A node without a `groupKey` falls back to the grid, unchanged.
//
// Everything here is pure and deterministic (same input → same output), so it
// is unit-tested without WebGL. The renderer picks a resolution per zoom level
// and calls this; drilling in raises the resolution around a super-node.
// ============================================================================

import type { Graph3DNode, Graph3DLink } from './useGraph3DLayout'

export interface SuperNode {
  /** Aggregate key — stable id (a grid cell or a semantic group). */
  key: string
  /** How many original nodes fall in this aggregate. */
  count: number
  /** Centroid of the original nodes in the aggregate. */
  x: number
  y: number
  z: number
}

export interface SuperEdge {
  /** Super-node key of the source aggregate. */
  source: string
  /** Super-node key of the target aggregate. */
  target: string
  /** Number of original edges bundled into this one. */
  count: number
  /** Sum of the original edge weights. */
  weight: number
}

export interface AggregatedGraph {
  superNodes: SuperNode[]
  superEdges: SuperEdge[]
  /** Original node index → aggregate key (for drill-down / inspection). */
  cellOfNode: Map<number, string>
}

// ── Shared core ─────────────────────────────────────────────────────────────

type Acc = { count: number; sx: number; sy: number; sz: number }

/**
 * O(N + E) core shared by the grid and semantic-group aggregations: bucket
 * nodes by an arbitrary deterministic key, emit one super-node per key (centroid
 * + count) and one super-edge per distinct key pair (count + weight sum).
 * Intra-key edges vanish into their super-node.
 */
function aggregateByKeys(
  nodes: Graph3DNode[],
  links: Graph3DLink[],
  keyOf: (node: Graph3DNode, index: number) => string,
): AggregatedGraph {
  const cellOfNode = new Map<number, string>()
  const superNodes: SuperNode[] = []
  if (nodes.length === 0) return { superNodes, superEdges: [], cellOfNode }

  const cells = new Map<string, Acc>()
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    const k = keyOf(n, i)
    cellOfNode.set(i, k)
    const acc = cells.get(k)
    if (acc) {
      acc.count++
      acc.sx += n.x
      acc.sy += n.y
      acc.sz += n.z
    } else {
      cells.set(k, { count: 1, sx: n.x, sy: n.y, sz: n.z })
    }
  }

  for (const [key, acc] of cells) {
    superNodes.push({
      key,
      count: acc.count,
      x: acc.sx / acc.count,
      y: acc.sy / acc.count,
      z: acc.sz / acc.count,
    })
  }

  const idToIndex = new Map<string, number>()
  for (let i = 0; i < nodes.length; i++) idToIndex.set(nodes[i].id, i)

  // Aggregate edges between distinct keys. Endpoints sorted so A→B and B→A are
  // the same bundle.
  const edgeAcc = new Map<string, SuperEdge>()
  for (const link of links) {
    const si = idToIndex.get(
      typeof link.source === 'string' ? link.source : (link.source as Graph3DNode).id,
    )
    const ti = idToIndex.get(
      typeof link.target === 'string' ? link.target : (link.target as Graph3DNode).id,
    )
    if (si === undefined || ti === undefined) continue
    const c1 = cellOfNode.get(si)
    const c2 = cellOfNode.get(ti)
    if (!c1 || !c2 || c1 === c2) continue // intra-key edges vanish into the super-node
    const [a, b] = c1 < c2 ? [c1, c2] : [c2, c1]
    const key = a + '\u0001' + b
    const e = edgeAcc.get(key)
    const w = link.weight ?? 0.5
    if (e) {
      e.count += 1
      e.weight += w
    } else {
      edgeAcc.set(key, { source: a, target: b, count: 1, weight: w })
    }
  }

  return { superNodes, superEdges: [...edgeAcc.values()], cellOfNode }
}

// ── Grid grouping ───────────────────────────────────────────────────────────

/** Bounding box of the nodes, widened so a zero span still has width 1e-6. */
function boundsOf(nodes: Graph3DNode[]) {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.z < minZ) minZ = n.z
    if (n.x > maxX) maxX = n.x
    if (n.y > maxY) maxY = n.y
    if (n.z > maxZ) maxZ = n.z
  }
  return {
    minX,
    minY,
    minZ,
    spanX: Math.max(maxX - minX, 1e-6),
    spanY: Math.max(maxY - minY, 1e-6),
    spanZ: Math.max(maxZ - minZ, 1e-6),
  }
}

/** Key function assigning each node to a grid cell at the given resolution. */
function makeGridKeyOf(nodes: Graph3DNode[], res: number): (n: Graph3DNode) => string {
  const { minX, minY, minZ, spanX, spanY, spanZ } = boundsOf(nodes)
  const r = Math.max(1, Math.floor(res))
  // Clamp to [0, r-1]: a node sitting exactly on the max face must not spill
  // into an extra (r-th) cell.
  const cellIndex = (v: number, lo: number, span: number) =>
    Math.min(r - 1, Math.floor(((v - lo) / span) * r))
  return (n) =>
    `${cellIndex(n.x, minX, spanX)},${cellIndex(n.y, minY, spanY)},${cellIndex(n.z, minZ, spanZ)}`
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
  return aggregateByKeys(nodes, links, makeGridKeyOf(nodes, res))
}

// ── Semantic grouping ───────────────────────────────────────────────────────

/**
 * Prefix for semantic group keys, keeping them disjoint from grid-cell keys
 * ("ix,iy,iz") when both coexist in the same aggregation.
 */
const GROUP_KEY_PREFIX = 'g:'

/**
 * Fewest super-nodes an aggregated tier shows, whatever the resolution: below
 * it the coarsest tier is a handful of blobs that say nothing.
 */
export const MIN_AGGREGATE_GROUPS = 8

/**
 * Number of super-nodes a tier aims at for a grid resolution: `res³`, the cell
 * budget `resolutionForLevel` derived from the ≈5:1 fan-in (level L targets
 * N / 5^L), floored at MIN_AGGREGATE_GROUPS.
 *
 * It used to be a fixed 24 whatever the level. Every node carries a
 * `groupKey` (community, directory or layer:type), so the resolution was never
 * read and the six levels of the semantic zoom produced the SAME graph —
 * measured on 20 000 nodes: 24 super-nodes / 105 super-edges at every level.
 * Now the budget follows the level: finer levels split the semantic groups,
 * coarser ones merge them.
 */
export function groupBudgetForResolution(res: number): number {
  const r = Math.max(1, Math.floor(res))
  return Math.max(MIN_AGGREGATE_GROUPS, r * r * r)
}

/**
 * A semantic group is split into parts only when it holds at least this many
 * nodes: a split of a 3-node group is noise, not a finer level.
 */
const SPLIT_MIN_SIZE = 8

/** Separator of a group's PART (`g:c7#1,0,2`): a sub-cell of the group's own box. */
const PART_SEP = '#'

/** Prefix of a REGION (`g:~c7`): neighbouring groups merged around the biggest. */
const REGION_PREFIX = GROUP_KEY_PREFIX + '~'

/** Key of the catch-all group that absorbs what has no path parent to merge into. */
const OTHER_GROUP_KEY = GROUP_KEY_PREFIX + 'd(autres)'

const DIR_KEY_PREFIX = GROUP_KEY_PREFIX + 'd'

/**
 * Parent of a group: a part's parent is its group ("g:c7#1,0,0" → "g:c7"); a
 * directory's parent is its path prefix ("g:dsrc/chat/x" → "g:dsrc/chat");
 * anything else has none (null).
 */
function parentGroupKey(key: string): string | null {
  const part = key.indexOf(PART_SEP)
  if (part > 0) return key.slice(0, part)
  if (!key.startsWith(DIR_KEY_PREFIX)) return null
  const path = key.slice(DIR_KEY_PREFIX.length)
  const cut = path.lastIndexOf('/')
  return cut > 0 ? DIR_KEY_PREFIX + path.slice(0, cut) : null
}

/**
 * Cap the number of distinct keys at `max`. Deterministic, O(K log K · passes).
 *  1. Raise a size threshold t = 2, 4, 8, … ; at each pass, groups smaller than
 *     t (smallest first, key as tie-break) are merged into their parent (a
 *     part into its group, a directory into its path prefix), stopping the
 *     moment the count reaches `max`.
 *  2. Whatever has no parent is merged, smallest first, into its REGION when
 *     `regionOf` names one (neighbouring groups in space — see
 *     resolveGroupKeys), so a coarse tier is a few regions, not one blob.
 *  3. Only what is still over the cap is folded into one catch-all group.
 * Returns old key → final key; the sum of counts is preserved by construction.
 */
export function capGroups(
  counts: Map<string, number>,
  max: number,
  regionOf?: (key: string) => string | null,
): Map<string, string> {
  const cur = new Map(counts)
  const redirect = new Map<string, string>() // merged key → where it went
  const move = (from: string, to: string) => {
    while (redirect.has(to)) to = redirect.get(to) as string // parent merged earlier
    const n = cur.get(from) ?? 0
    cur.delete(from)
    cur.set(to, (cur.get(to) ?? 0) + n)
    redirect.set(from, to)
  }
  const bySize = (a: string, b: string) =>
    (cur.get(a) ?? 0) - (cur.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0)
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  const limit = Math.max(1, Math.floor(max))

  for (let t = 2; cur.size > limit && t <= 2 * total; t *= 2) {
    let moved = true
    while (moved && cur.size > limit) {
      moved = false
      const small = [...cur.keys()].filter((k) => (cur.get(k) ?? 0) < t).sort(bySize)
      for (const k of small) {
        if (cur.size <= limit) break
        const parent = cur.has(k) ? parentGroupKey(k) : null
        if (parent === null || (cur.get(k) ?? 0) >= t) continue
        move(k, parent)
        moved = true
      }
    }
  }

  if (cur.size > limit && regionOf) {
    const order = [...cur.keys()].sort(bySize)
    for (const k of order) {
      if (cur.size <= limit) break
      if (!cur.has(k)) continue
      const region = regionOf(k)
      if (region === null || region === k) continue
      move(k, region)
    }
  }

  if (cur.size > limit) {
    const order = [...cur.keys()].filter((k) => k !== OTHER_GROUP_KEY).sort(bySize)
    for (const k of order) {
      if (cur.size <= limit) break
      move(k, OTHER_GROUP_KEY)
    }
  }
  const alias = new Map<string, string>()
  for (const k of counts.keys()) {
    let f = k
    while (redirect.has(f)) f = redirect.get(f) as string
    alias.set(k, f)
  }
  return alias
}

type Box = Acc & {
  minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number
}

/** Count, centroid sums and bounding box of every key, in one pass. */
function boxesOf(nodes: Graph3DNode[], keys: string[]): Map<string, Box> {
  const boxes = new Map<string, Box>()
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    const b = boxes.get(keys[i])
    if (!b) {
      boxes.set(keys[i], {
        count: 1, sx: n.x, sy: n.y, sz: n.z,
        minX: n.x, minY: n.y, minZ: n.z, maxX: n.x, maxY: n.y, maxZ: n.z,
      })
      continue
    }
    b.count++
    b.sx += n.x; b.sy += n.y; b.sz += n.z
    if (n.x < b.minX) b.minX = n.x
    if (n.y < b.minY) b.minY = n.y
    if (n.z < b.minZ) b.minZ = n.z
    if (n.x > b.maxX) b.maxX = n.x
    if (n.y > b.maxY) b.maxY = n.y
    if (n.z > b.maxZ) b.maxZ = n.z
  }
  return boxes
}

/**
 * Final group key of every node at grid resolution `res`.
 *
 * The tier aims at `maxGroups` super-nodes (default groupBudgetForResolution):
 *  • FINER than the semantic groups (fewer groups than the budget): every
 *    group big enough is split into parts — a local grid over ITS OWN box, so
 *    a part never mixes two groups (`g:c7#1,0,2`);
 *  • COARSER (more groups than the budget): parts fold back into their group,
 *    directories into their parent, then groups into their spatial REGION
 *    (`g:~c7`, named after its biggest member: the cell of a coarse grid over
 *    the group centroids) — never all into one catch-all blob.
 */
export function resolveGroupKeys(
  nodes: Graph3DNode[],
  res: number,
  maxGroups: number = groupBudgetForResolution(res),
): string[] {
  const limit = Math.max(1, Math.floor(maxGroups))
  const gridKeyOf = makeGridKeyOf(nodes, res)
  let raw = nodes.map((n) => {
    const g = n.groupKey
    return g != null && g !== '' ? GROUP_KEY_PREFIX + g : gridKeyOf(n)
  })
  let boxes = boxesOf(nodes, raw)

  // ── Finer than the groups: split each big group in its own box ───────────
  if (boxes.size < limit && nodes.length > 0) {
    const perPart = nodes.length / limit
    const localRes = new Map<string, number>()
    for (const [k, b] of boxes) {
      if (!k.startsWith(GROUP_KEY_PREFIX) || b.count < SPLIT_MIN_SIZE) continue
      const parts = Math.floor(b.count / perPart)
      if (parts >= 2) localRes.set(k, Math.max(2, Math.round(Math.cbrt(parts))))
    }
    if (localRes.size > 0) {
      raw = raw.map((k, i) => {
        const r = localRes.get(k)
        const b = boxes.get(k)
        if (r === undefined || !b) return k
        const n = nodes[i]
        const cell = (v: number, lo: number, hi: number) =>
          Math.min(r - 1, Math.floor(((v - lo) / Math.max(hi - lo, 1e-6)) * r))
        return `${k}${PART_SEP}${cell(n.x, b.minX, b.maxX)},${cell(n.y, b.minY, b.maxY)},${cell(n.z, b.minZ, b.maxZ)}`
      })
      boxes = boxesOf(nodes, raw)
    }
  }
  if (boxes.size <= limit) return raw

  // ── Coarser than the groups: regions of neighbouring groups ──────────────
  // A coarse grid over the group centroids, with at most `limit` cells; each
  // cell is named after its biggest group, so the region reads as "c7 and its
  // neighbours". A part's region is its group's region (parts fold first).
  const counts = new Map<string, number>()
  for (const [k, b] of boxes) counts.set(k, b.count)
  const centroids: Graph3DNode[] = []
  const owners: string[] = []
  for (const [k, b] of boxes) {
    if (k.includes(PART_SEP)) continue
    owners.push(k)
    centroids.push({ id: k, label: k, entityType: '', layer: '', x: b.sx / b.count, y: b.sy / b.count, z: b.sz / b.count, data: {} })
  }
  const cellOf = makeGridKeyOf(centroids, Math.max(1, Math.floor(Math.cbrt(limit))))
  const biggestInCell = new Map<string, string>()
  const cellOfOwner = new Map<string, string>()
  owners.forEach((k, i) => {
    const cell = cellOf(centroids[i])
    cellOfOwner.set(k, cell)
    const best = biggestInCell.get(cell)
    const bc = best === undefined ? -1 : counts.get(best) ?? 0
    const kc = counts.get(k) ?? 0
    if (best === undefined || kc > bc || (kc === bc && k < best)) biggestInCell.set(cell, k)
  })
  const regionOf = (key: string): string | null => {
    if (key.startsWith(REGION_PREFIX)) return null
    const cell = cellOfOwner.get(key)
    const head = cell === undefined ? undefined : biggestInCell.get(cell)
    if (head === undefined) return null
    return REGION_PREFIX + (head.startsWith(GROUP_KEY_PREFIX) ? head.slice(GROUP_KEY_PREFIX.length) : head)
  }
  const alias = capGroups(counts, limit, regionOf)
  return raw.map((k) => alias.get(k) ?? k)
}

/** The semantic group of a resolved key: a part's group, else the key itself. */
function semanticKeyOf(key: string): string {
  const part = key.indexOf(PART_SEP)
  return part > 0 ? key.slice(0, part) : key
}

/**
 * Aggregate `nodes`/`links` by SEMANTIC GROUP: every node sharing a `groupKey`
 * (e.g. "c7" for community 7, or "dsrc/chat" for a directory) lands in the same
 * super-node regardless of where it sits in space. A node without a `groupKey`
 * falls back to the grid behaviour of `aggregateAtResolution` at the same
 * resolution. The number of super-nodes is capped at MAX_AGGREGATE_GROUPS by
 * merging the smallest groups into their path-prefix parent (see capGroups).
 * Deterministic.
 */
export function aggregateByGroup(
  nodes: Graph3DNode[],
  links: Graph3DLink[],
  res: number,
): AggregatedGraph {
  const keys = resolveGroupKeys(nodes, res)
  return aggregateByKeys(nodes, links, (_n, i) => keys[i])
}

/**
 * Members of each aggregate, re-labelled as numbered "communities" so the
 * community hull builder can wrap each cluster in a translucent envelope.
 * Index 0 is the biggest group (colour order stays stable as sizes shift).
 */
export function groupHullNodes(nodes: Graph3DNode[], res: number): Graph3DNode[] {
  // A hull wraps a SEMANTIC group: the parts of a fine tier share their
  // group's envelope (one hull per community, not one per part).
  const keys = resolveGroupKeys(nodes, res).map(semanticKeyOf)
  const counts = new Map<string, number>()
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1)
  const order = [...counts.keys()].sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || (a < b ? -1 : a > b ? 1 : 0),
  )
  const idOf = new Map(order.map((k, i) => [k, i]))
  return nodes.map((n, i) => ({
    ...n,
    communityId: idOf.get(keys[i]),
    communityLabel: superNodeName(keys[i], keys[i].startsWith(GROUP_KEY_PREFIX + 'c') ? n.communityLabel : undefined),
  }))
}

/**
 * Human-readable name for an aggregate, shown as the on-screen label at the
 * aggregated tier. Communities keep their API label when there is one, else
 * "Communauté N"; directory groups (the no-GDS fallback) keep their path; grid
 * cells (pure-grid aggregation, unused in the UI) fall back to "Groupe …".
 */
export function superNodeName(key: string, communityLabel?: string): string {
  const label = communityLabel?.trim()
  if (label) return label
  if (key.startsWith(REGION_PREFIX)) {
    return `${superNodeName(GROUP_KEY_PREFIX + key.slice(REGION_PREFIX.length), label)} et voisins`
  }
  const part = key.indexOf(PART_SEP)
  if (part > 0) return `${superNodeName(key.slice(0, part), label)} · partie`
  const gk = key.startsWith(GROUP_KEY_PREFIX) ? key.slice(GROUP_KEY_PREFIX.length) : ''
  if (gk) {
    if (gk.startsWith('c')) return `Communauté ${gk.slice(1)}`
    if (gk.startsWith('d')) return gk.slice(1)
    return gk
  }
  // A grid cell index ("2,7,7") is not a name a human can use. When the group
  // comes from the fallback grid, say so instead of inventing a label.
  return key ? 'Cellule ' + key : 'Cellule'
}

// ── Render-ready scaled graphs ──────────────────────────────────────────────

/**
 * Grid resolution (cells per axis) for an aggregation level.
 * level 0 = detail (caller keeps the raw nodes); level L targets ~nodeCount / 5^L
 * super-nodes, i.e. "about 5 of this scale become 1 of the scale above".
 * Returns 0 for level 0, ≥2 otherwise.
 */
export function resolutionForLevel(nodeCount: number, level: number): number {
  if (level <= 0 || nodeCount <= 0) return 0
  const targetCells = Math.max(8, Math.ceil(nodeCount / Math.pow(5, level)))
  return Math.max(2, Math.round(Math.cbrt(targetCells)))
}

/**
 * Turn an aggregated graph into render-ready Graph3DData (positions = centroids,
 * so no re-layout). Each super-node carries its dominant entity type (for
 * colour/shape) and a `byType` composition (for a stacked/composition ring
 * later). Super-edges carry `count` (how many links bundled) as their
 * importance, which the renderer maps to opacity/width.
 *
 * Pure and deterministic; the renderer just swaps this in for the raw graph.
 */
function buildScaledGraphFrom(
  aggregated: AggregatedGraph,
  sourceNodes: Graph3DNode[],
): { nodes: Graph3DNode[]; links: Graph3DLink[] } {
  const { superNodes, superEdges, cellOfNode } = aggregated

  // Per-aggregate entity-type composition → dominant type + byType map.
  const cells = new Map<string, Map<string, number>>()
  const cellLayer = new Map<string, string>()
  // First non-empty community label per aggregate, used to name the super-node.
  const cellLabel = new Map<string, string>()
  for (let i = 0; i < sourceNodes.length; i++) {
    const key = cellOfNode.get(i)
    if (!key) continue
    const t = sourceNodes[i].entityType
    let m = cells.get(key)
    if (!m) {
      m = new Map()
      cells.set(key, m)
    }
    m.set(t, (m.get(t) ?? 0) + 1)
    if (!cellLayer.has(key)) cellLayer.set(key, sourceNodes[i].layer)
    if (!cellLabel.has(key) && sourceNodes[i].communityLabel) {
      cellLabel.set(key, sourceNodes[i].communityLabel as string)
    }
  }

  const nodes: Graph3DNode[] = superNodes.map((sn) => {
    const m = cells.get(sn.key)
    let dom = 'file'
    let domN = -1
    const byType: Record<string, number> = {}
    if (m) {
      for (const [t, n] of m) {
        byType[t] = n
        if (n > domN) {
          domN = n
          dom = t
        }
      }
    }
    // A region merges several groups: the first label met is not its name.
    const name = superNodeName(sn.key, sn.key.startsWith(REGION_PREFIX) ? undefined : cellLabel.get(sn.key))
    return {
      id: sn.key,
      label: name,
      entityType: dom,
      layer: cellLayer.get(sn.key) ?? 'fabric',
      x: sn.x,
      y: sn.y,
      z: sn.z,
      data: { count: sn.count, byType, name },
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

/**
 * Grid-based scaled graph: super-nodes/super-edges derived from the cubic grid
 * at resolution `res`.
 */
export function buildScaledGraph(
  data: { nodes: Graph3DNode[]; links: Graph3DLink[] },
  res: number,
): { nodes: Graph3DNode[]; links: Graph3DLink[] } {
  return buildScaledGraphFrom(
    aggregateAtResolution(data.nodes, data.links, res),
    data.nodes,
  )
}

/**
 * Semantic-group scaled graph: super-nodes/super-edges derived from the node
 * `groupKey`s (grid fallback for nodes without one), at resolution `res`.
 */
export function buildGroupedGraph(
  data: { nodes: Graph3DNode[]; links: Graph3DLink[] },
  res: number,
): { nodes: Graph3DNode[]; links: Graph3DLink[] } {
  return buildScaledGraphFrom(aggregateByGroup(data.nodes, data.links, res), data.nodes)
}

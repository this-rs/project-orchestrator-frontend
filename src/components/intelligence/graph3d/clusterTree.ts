// ============================================================================
// clusterTree — a continuous hierarchy cut by SCREEN ERROR (HLOD)
// ============================================================================
//
// The semantic zoom used to pick ONE global level (0..6) for the whole graph:
// a region the camera is buried in and a region at the horizon were drawn at
// the same scale. Game engines solved this long ago with hierarchical LOD: a
// tree of ever-coarser proxies, cut per frame where each proxy's PROJECTED size
// crosses a pixel threshold. Near regions open down to single nodes while far
// ones stay one blob, in the same picture, with no level to choose.
//
//   buildClusterTree(nodes, links)       O(N log N + E·depth), once per graph
//   cutForView(tree, view, budget, prev) the frontier for one camera
//   cutTransition(tree, prev, next)      parent ↔ children, for a morph
//
// THE TREE. root → layer → community (backend id, else the node's groupKey:
// directory / layer:type) → recursive spatial parts (median splits along the
// longest axis, 8 parts per level, while a group holds more than GROUP_CAP
// members) → one leaf per graph node. Every tree node carries its members (a
// contiguous range of `order`), centroid, exact bounding radius, node count and
// its LINK AGGREGATES: exact relation counts (and per family) towards the other
// tree nodes of the same depth (or towards a leaf that ends above that depth).
// Counts add up exactly from one level to the next — what the shared link law
// r(n) = 0.03·d0·n^(1/3) needs to stay continuous when a node opens.
//
// One Graph3DLink = one relation. Links with an unknown endpoint and self-loops
// are not counted (`skippedLinks`).
//
// Everything here is pure and deterministic (input order does not matter).
// ============================================================================

import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'
import { linkFamilyOf, type LinkFamily } from './linkFamily'

/** A group holding more members than this is split spatially. */
export const GROUP_CAP = 64
/** Parts per spatial split: three median cuts (2 × 2 × 2). */
const SPLIT_CUTS = 3
/** Projected radius (px) above which a tree node opens. */
export const DEFAULT_OPEN_PX = 24
/** An OPEN node only closes below DEFAULT_OPEN_PX / CUT_HYSTERESIS. */
export const CUT_HYSTERESIS = 1.5

export type ClusterKind = 'root' | 'layer' | 'community' | 'split' | 'leaf'

export interface LinkAggregate {
  /** Exact number of relations. */
  count: number
  byFamily: Record<LinkFamily, number>
}

export interface ClusterNode {
  /** Stable id: same graph ⇒ same id (e.g. `L:code|C:c7|s3|s0`, `n:<node id>`). */
  id: string
  /** Position in `tree.nodes`. */
  index: number
  /** Parent index, -1 for the root. */
  parent: number
  children: number[]
  depth: number
  kind: ClusterKind
  /** Members are `tree.order[memberStart .. memberEnd)` (graph node indices). */
  memberStart: number
  memberEnd: number
  count: number
  /** Centroid of the members. */
  x: number
  y: number
  z: number
  /** Exact bounding radius around the centroid (0 for a leaf). */
  radius: number
  /** Relations with both ends inside this node. */
  internal: LinkAggregate
  /**
   * Relations with exactly one end inside, keyed by the tree node holding the
   * other end at THIS node's depth (or that end's leaf, when it ends above).
   */
  links: Map<number, LinkAggregate>
}

export interface ClusterTree {
  nodes: ClusterNode[]
  root: number
  /** Graph node indices in DFS order: every tree node's members are a slice. */
  order: Int32Array
  /** Graph node index → its leaf. */
  leafOf: Int32Array
  /** Relations counted (resolvable, not self-loops). */
  linkTotal: number
  skippedLinks: number
  groupCap: number
  /** Endpoints (graph node indices) and family of each counted relation. */
  edgeA: Int32Array
  edgeB: Int32Array
  edgeFamily: Uint8Array
  /** Counted relations incident to each tree node (at least one end inside). */
  incident: number[][]
}

const FAMILIES: readonly LinkFamily[] = ['structure', 'knowledge', 'tissue']

/** Placeholder replaced by a lazy getter once the links are indexed. */
const EMPTY_LINKS: Map<number, LinkAggregate> = new Map()

const emptyAggregate = (): LinkAggregate => ({ count: 0, byFamily: { structure: 0, knowledge: 0, tissue: 0 } })

function addTo(agg: LinkAggregate, family: number, n = 1) {
  agg.count += n
  agg.byFamily[FAMILIES[family]] += n
}

/** Graph node indices of a tree node (a fresh array). */
export function membersOf(tree: ClusterTree, index: number): number[] {
  const t = tree.nodes[index]
  return Array.from(tree.order.subarray(t.memberStart, t.memberEnd))
}

const endId = (end: unknown): string =>
  typeof end === 'object' && end !== null ? (end as { id: string }).id : String(end)

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// ── Build ───────────────────────────────────────────────────────────────────

/**
 * Build the hierarchy. Deterministic: members are ordered by node id before any
 * split, splits break ties by id, children are ordered by key.
 */
export function buildClusterTree(
  graphNodes: readonly Graph3DNode[],
  graphLinks: readonly Graph3DLink[],
  groupCap: number = GROUP_CAP,
): ClusterTree {
  const cap = Math.max(1, Math.floor(groupCap))
  const N = graphNodes.length
  const nodes: ClusterNode[] = []
  const order = new Int32Array(N)
  const leafOf = new Int32Array(N).fill(-1)
  let cursor = 0
  const xs = new Float64Array(N)
  const ys = new Float64Array(N)
  const zs = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    xs[i] = graphNodes[i].x
    ys[i] = graphNodes[i].y
    zs[i] = graphNodes[i].z
  }

  const make = (id: string, parent: number, kind: ClusterKind): number => {
    const index = nodes.length
    nodes.push({
      id, index, parent, children: [], depth: parent < 0 ? 0 : nodes[parent].depth + 1, kind,
      memberStart: 0, memberEnd: 0, count: 0, x: 0, y: 0, z: 0, radius: 0,
      internal: emptyAggregate(), links: EMPTY_LINKS,
    })
    if (parent >= 0) nodes[parent].children.push(index)
    return index
  }

  /** Leaves under `parent` for `members` (already in id order). */
  const leaves = (parent: number, members: number[]) => {
    for (const i of members) {
      const leaf = make(`n:${graphNodes[i].id}`, parent, 'leaf')
      nodes[leaf].memberStart = cursor
      order[cursor++] = i
      nodes[leaf].memberEnd = cursor
      leafOf[i] = leaf
    }
  }

  // Rank of every node in id order: the deterministic tie-break of every sort.
  const ids = graphNodes.map((_n, i) => i).sort((a, b) => cmpStr(graphNodes[a].id, graphNodes[b].id))
  const rank = new Int32Array(N)
  ids.forEach((i, k) => { rank[i] = k })
  const byRank = (a: number, b: number) => rank[a] - rank[b]

  /** Median cuts along the longest axis, SPLIT_CUTS times → up to 8 parts. */
  const splitParts = (members: number[]): number[][] => {
    let parts = [members]
    for (let c = 0; c < SPLIT_CUTS; c++) {
      const next: number[][] = []
      for (const p of parts) {
        if (p.length < 2) {
          next.push(p)
          continue
        }
        let minX = Infinity, minY = Infinity, minZ = Infinity
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
        for (const i of p) {
          if (xs[i] < minX) minX = xs[i]
          if (xs[i] > maxX) maxX = xs[i]
          if (ys[i] < minY) minY = ys[i]
          if (ys[i] > maxY) maxY = ys[i]
          if (zs[i] < minZ) minZ = zs[i]
          if (zs[i] > maxZ) maxZ = zs[i]
        }
        const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ
        const axis = sx >= sy && sx >= sz ? xs : sy >= sz ? ys : zs
        const sorted = [...p].sort((a, b) => axis[a] - axis[b] || rank[a] - rank[b])
        const half = Math.ceil(sorted.length / 2)
        next.push(sorted.slice(0, half).sort(byRank))
        next.push(sorted.slice(half).sort(byRank))
      }
      parts = next
    }
    return parts.filter((p) => p.length > 0)
  }

  /** A group: leaves when small, spatial parts (recursively) otherwise. */
  const group = (index: number, members: number[]) => {
    nodes[index].memberStart = cursor
    if (members.length <= cap) {
      leaves(index, members)
    } else {
      splitParts(members).forEach((part, k) => {
        group(make(`${nodes[index].id}|s${k}`, index, 'split'), part)
      })
    }
    nodes[index].memberEnd = cursor
  }

  const root = make('root', -1, 'root')
  // layer → community, both keyed and sorted for determinism
  const byLayer = new Map<string, Map<string, number[]>>()
  for (const i of ids) {
    const n = graphNodes[i]
    const layer = n.layer || 'none'
    const community = n.communityId != null ? `c${n.communityId}` : n.groupKey || 'none'
    let m = byLayer.get(layer)
    if (!m) byLayer.set(layer, (m = new Map()))
    const list = m.get(community)
    if (list) list.push(i)
    else m.set(community, [i])
  }
  nodes[root].memberStart = cursor
  for (const layer of [...byLayer.keys()].sort(cmpStr)) {
    const L = make(`L:${layer}`, root, 'layer')
    nodes[L].memberStart = cursor
    const communities = byLayer.get(layer)!
    for (const key of [...communities.keys()].sort(cmpStr)) {
      group(make(`L:${layer}|C:${key}`, L, 'community'), communities.get(key)!)
    }
    nodes[L].memberEnd = cursor
  }
  nodes[root].memberEnd = cursor

  // centroid, count, exact radius
  for (const t of nodes) {
    t.count = t.memberEnd - t.memberStart
    if (t.count === 0) continue
    let sx = 0, sy = 0, sz = 0
    for (let k = t.memberStart; k < t.memberEnd; k++) {
      const i = order[k]
      sx += xs[i]; sy += ys[i]; sz += zs[i]
    }
    t.x = sx / t.count; t.y = sy / t.count; t.z = sz / t.count
    let r = 0
    for (let k = t.memberStart; k < t.memberEnd; k++) {
      const i = order[k]
      const d = Math.hypot(xs[i] - t.x, ys[i] - t.y, zs[i] - t.z)
      if (d > r) r = d
    }
    t.radius = t.kind === 'leaf' ? 0 : r
  }

  // ── Links: per-depth aggregates + incidence lists ────────────────────────
  const indexById = new Map<string, number>()
  for (let i = 0; i < N; i++) indexById.set(graphNodes[i].id, i)
  // canonical edge order (input order must not matter)
  // packed (rank a, rank b, family): one numeric sort instead of object compares
  const packed: number[] = []
  let skipped = 0
  for (const l of graphLinks) {
    const a = indexById.get(endId(l.source))
    const b = indexById.get(endId(l.target))
    if (a === undefined || b === undefined || a === b) {
      skipped++
      continue
    }
    const fam = FAMILIES.indexOf(linkFamilyOf(l.relationType || ''))
    // canonical orientation and order by id rank, never by input position
    const lo = Math.min(rank[a], rank[b])
    const hi = Math.max(rank[a], rank[b])
    packed.push((lo * N + hi) * 3 + fam)
  }
  const sortedEdges = Float64Array.from(packed).sort()
  const E = sortedEdges.length
  const edgeA = new Int32Array(E)
  const edgeB = new Int32Array(E)
  const edgeFamily = new Uint8Array(E)
  const incident: number[][] = nodes.map(() => [])

  const pathOf = (leaf: number): number[] => {
    const p: number[] = []
    for (let t = leaf; t >= 0; t = nodes[t].parent) p.push(t)
    return p.reverse()
  }
  const pathCache: (number[] | undefined)[] = new Array(nodes.length)
  const cachedPath = (leaf: number) => pathCache[leaf] ?? (pathCache[leaf] = pathOf(leaf))
  for (let e = 0; e < E; e++) {
    const v = sortedEdges[e]
    const fam = v % 3
    const pair = (v - fam) / 3
    const a = ids[Math.floor(pair / N)]
    const b = ids[pair % N]
    edgeA[e] = a
    edgeB[e] = b
    edgeFamily[e] = fam
    const pa = cachedPath(leafOf[a])
    const pb = cachedPath(leafOf[b])
    const deepest = Math.max(pa.length, pb.length)
    for (let d = 0; d < deepest; d++) {
      const A = pa[Math.min(d, pa.length - 1)]
      const B = pb[Math.min(d, pb.length - 1)]
      if (A === B) {
        addTo(nodes[A].internal, fam)
        incident[A].push(e)
        continue
      }
      if (nodes[A].depth === d) incident[A].push(e)
      if (nodes[B].depth === d) incident[B].push(e)
    }
  }

  // Per-node link aggregates are computed on first read, from the incidence
  // list: the cut never needs them, and building ~300 000 map entries up front
  // was half of the build time at 20 000 nodes.
  for (const t of nodes) {
    let cache: Map<number, LinkAggregate> | null = null
    Object.defineProperty(t, 'links', {
      enumerable: true,
      get(): Map<number, LinkAggregate> {
        if (cache) return cache
        const m = new Map<number, LinkAggregate>()
        const d = t.depth
        for (const e of incident[t.index]) {
          const pa = cachedPath(leafOf[edgeA[e]])
          const pb = cachedPath(leafOf[edgeB[e]])
          const A = pa[Math.min(d, pa.length - 1)]
          const B = pb[Math.min(d, pb.length - 1)]
          if (A === B) continue
          const other = A === t.index ? B : A
          let agg = m.get(other)
          if (!agg) m.set(other, (agg = emptyAggregate()))
          addTo(agg, edgeFamily[e])
        }
        return (cache = m)
      },
    })
  }

  return {
    nodes, root, order, leafOf, linkTotal: E, skippedLinks: skipped, groupCap: cap,
    edgeA, edgeB, edgeFamily, incident,
  }
}

// ── Cut ─────────────────────────────────────────────────────────────────────

export interface CutView {
  /** Camera position, world units. */
  position: readonly [number, number, number]
  /** Vertical field of view, degrees. */
  fovDeg: number
  /** Viewport height, CSS px. */
  viewportHeightPx: number
}

export interface CutBudget {
  /** Most frontier elements drawn. */
  maxNodes: number
  /** Most aggregated links drawn between frontier elements. */
  maxLinks: number
  /** Opening threshold, px (default DEFAULT_OPEN_PX). */
  openPx?: number
}

export interface CutLink {
  /** Frontier elements (tree indices), a < b. */
  a: number
  b: number
  count: number
  byFamily: Record<LinkFamily, number>
}

export interface ClusterCut {
  /** Visible tree nodes, sorted by index. They partition the graph nodes. */
  frontier: number[]
  /** Opened tree nodes (strict ancestors of the frontier). */
  open: Set<number>
  /** Links between two frontier elements, aggregated at the frontier. */
  links: CutLink[]
  /** Links collapsed inside one frontier element (element → aggregate). */
  internal: Map<number, LinkAggregate>
}

/**
 * Projected radius in px of a sphere of `radius` seen from `distance`:
 * radius / (distance · tan(fov/2)) × height/2. Infinite when the camera is inside.
 */
export function projectedRadiusPx(radius: number, distance: number, fovDeg: number, heightPx: number): number {
  if (!(radius > 0)) return 0
  if (!(distance > radius)) return Number.POSITIVE_INFINITY
  const t = Math.tan(((fovDeg * Math.PI) / 180) / 2)
  return (radius / (distance * t)) * (heightPx / 2)
}

/** Max-heap on (px desc, index asc). */
class Heap {
  private a: { px: number; i: number }[] = []
  get size() { return this.a.length }
  private above(x: { px: number; i: number }, y: { px: number; i: number }) {
    return x.px > y.px || (x.px === y.px && x.i < y.i)
  }
  push(v: { px: number; i: number }) {
    const a = this.a
    a.push(v)
    let k = a.length - 1
    while (k > 0) {
      const p = (k - 1) >> 1
      if (!this.above(a[k], a[p])) break
      ;[a[k], a[p]] = [a[p], a[k]]
      k = p
    }
  }
  pop(): { px: number; i: number } | undefined {
    const a = this.a
    if (a.length === 0) return undefined
    const top = a[0]
    const last = a.pop()!
    if (a.length > 0) {
      a[0] = last
      let k = 0
      for (;;) {
        const l = 2 * k + 1, r = l + 1
        let m = k
        if (l < a.length && this.above(a[l], a[m])) m = l
        if (r < a.length && this.above(a[r], a[m])) m = r
        if (m === k) break
        ;[a[k], a[m]] = [a[m], a[k]]
        k = m
      }
    }
    return top
  }
}

/**
 * The frontier for one camera.
 *
 * Starting from the root, the frontier element with the LARGEST projected
 * radius is opened first (priority queue) as long as its radius is above the
 * threshold — τ, or τ / CUT_HYSTERESIS if it was open in `previous` — and the
 * opening keeps the frontier within `budget`. Links are maintained exactly and
 * incrementally: each relation is attributed to the frontier elements holding
 * its two ends, so a relation is never lost nor counted twice.
 */
export function cutForView(
  tree: ClusterTree,
  view: CutView,
  budget: CutBudget,
  previous?: ClusterCut,
): ClusterCut {
  const tau = budget.openPx ?? DEFAULT_OPEN_PX
  const maxNodes = Math.max(1, Math.floor(budget.maxNodes))
  const maxLinks = Math.max(0, Math.floor(budget.maxLinks))
  const { nodes, order, edgeA, edgeB, edgeFamily, incident } = tree
  const M = nodes.length
  const [cx, cy, cz] = view.position
  const pxOf = (i: number) => {
    const t = nodes[i]
    return projectedRadiusPx(t.radius, Math.hypot(t.x - cx, t.y - cy, t.z - cz), view.fovDeg, view.viewportHeightPx)
  }

  // rep[graph node] = frontier element holding it
  const rep = new Int32Array(order.length).fill(tree.root)
  // pair → [count, s, k, t]; key = a·M + b with a < b
  const pairs = new Map<number, Float64Array>()
  const inner = new Map<number, Float64Array>()
  const apply = (e: number, sign: 1 | -1) => {
    const a = rep[edgeA[e]]
    const b = rep[edgeB[e]]
    let m: Map<number, Float64Array>
    let key: number
    if (a === b) {
      m = inner
      key = a
    } else {
      m = pairs
      key = a < b ? a * M + b : b * M + a
    }
    let v = m.get(key)
    if (!v) m.set(key, (v = new Float64Array(4)))
    v[0] += sign
    v[1 + edgeFamily[e]] += sign
    if (v[0] === 0) m.delete(key)
  }
  const setRep = (parent: number, toChildren: boolean) => {
    const p = nodes[parent]
    if (!toChildren) {
      for (let k = p.memberStart; k < p.memberEnd; k++) rep[order[k]] = parent
      return
    }
    for (const c of p.children) {
      const t = nodes[c]
      for (let k = t.memberStart; k < t.memberEnd; k++) rep[order[k]] = c
    }
  }
  // the root holds every relation inside
  for (let e = 0; e < edgeA.length; e++) apply(e, 1)

  const open = new Set<number>()
  let frontierSize = 1
  const heap = new Heap()
  const consider = (i: number) => {
    if (nodes[i].children.length === 0) return
    const px = pxOf(i)
    const threshold = previous?.open.has(i) ? tau / CUT_HYSTERESIS : tau
    if (px >= threshold) heap.push({ px, i })
  }
  consider(tree.root)

  while (heap.size > 0) {
    const { i } = heap.pop()!
    const kids = nodes[i].children
    if (frontierSize - 1 + kids.length > maxNodes) continue
    for (const e of incident[i]) apply(e, -1)
    setRep(i, true)
    for (const e of incident[i]) apply(e, 1)
    if (pairs.size > maxLinks) {
      // Over the link budget: undo and STOP. Everything still queued has a
      // smaller screen error, and retrying each would cost two passes over its
      // relations for, at best, a smaller gain.
      for (const e of incident[i]) apply(e, -1)
      setRep(i, false)
      for (const e of incident[i]) apply(e, 1)
      break
    }
    open.add(i)
    frontierSize += kids.length - 1
    for (const c of kids) consider(c)
  }

  const frontier: number[] = []
  const collect = (i: number) => {
    if (open.has(i)) for (const c of nodes[i].children) collect(c)
    else frontier.push(i)
  }
  collect(tree.root)
  frontier.sort((a, b) => a - b)

  const toAgg = (v: Float64Array): LinkAggregate => ({
    count: v[0], byFamily: { structure: v[1], knowledge: v[2], tissue: v[3] },
  })
  const links: CutLink[] = [...pairs.entries()]
    .sort((p, q) => p[0] - q[0])
    .map(([key, v]) => ({ a: Math.floor(key / M), b: key % M, ...toAgg(v) }))
  const internal = new Map<number, LinkAggregate>()
  for (const k of [...inner.keys()].sort((a, b) => a - b)) internal.set(k, toAgg(inner.get(k)!))
  return { frontier, open, links, internal }
}

// ── Transition ──────────────────────────────────────────────────────────────

export interface CutTransition {
  /** A previous element that opened, and the new elements that replace it. */
  splits: { parent: number; children: number[] }[]
  /** A new element that closed over previous elements. */
  merges: { parent: number; children: number[] }[]
  /** Elements present in both cuts. */
  kept: number[]
  /**
   * New element → the previous element it comes FROM (itself when kept, its
   * ancestor when it was split out of one, itself when it is a merge parent).
   * A split link (a, b) starts on the previous conduit (prevOf a, prevOf b).
   */
  prevOf: Map<number, number>
  /** Previous element → the new element it goes TO (itself, its merge parent, or itself when split). */
  nextOf: Map<number, number>
}

/**
 * Parent ↔ children correspondence between two cuts of the same tree, for a
 * morph: children leave the parent centroid, merged elements fly into it, and
 * links split from (or join into) the parent conduit.
 */
export function cutTransition(tree: ClusterTree, prev: ClusterCut, next: ClusterCut): CutTransition {
  const prevSet = new Set(prev.frontier)
  const nextSet = new Set(next.frontier)
  const ancestorIn = (i: number, set: Set<number>): number => {
    for (let t = i; t >= 0; t = tree.nodes[t].parent) if (set.has(t)) return t
    return -1
  }
  const prevOf = new Map<number, number>()
  const nextOf = new Map<number, number>()
  const splitMap = new Map<number, number[]>()
  const mergeMap = new Map<number, number[]>()
  const kept: number[] = []

  for (const q of next.frontier) {
    const p = ancestorIn(q, prevSet)
    if (p === q) {
      kept.push(q)
      prevOf.set(q, q)
    } else if (p >= 0) {
      prevOf.set(q, p)
      const list = splitMap.get(p) ?? []
      list.push(q)
      splitMap.set(p, list)
    } else {
      prevOf.set(q, q) // merge parent: previous elements fly into it
    }
  }
  for (const p of prev.frontier) {
    const q = ancestorIn(p, nextSet)
    if (q === p) nextOf.set(p, p)
    else if (q >= 0) {
      nextOf.set(p, q)
      const list = mergeMap.get(q) ?? []
      list.push(p)
      mergeMap.set(q, list)
    } else {
      nextOf.set(p, p) // split parent: new elements leave from it
    }
  }
  const asList = (m: Map<number, number[]>) =>
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([parent, children]) => ({ parent, children: children.sort((a, b) => a - b) }))
  return { splits: asList(splitMap), merges: asList(mergeMap), kept, prevOf, nextOf }
}

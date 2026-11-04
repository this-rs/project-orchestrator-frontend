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
/** Projected radius (px) below which nothing opens, whatever its children. */
export const DEFAULT_OPEN_PX = 24
/**
 * An OPEN node stays open down to its opening threshold / CUT_HYSTERESIS, and
 * that threshold is taken at the BEST focus (centre of the view) — so turning
 * the camera does not close what is already open. The audit measured, without
 * it, a frontier changing on 9 of 9 rotation steps of 10° (the focus weight
 * moves the threshold by √3, more than the old hysteresis of 1.5): every one
 * rebuilt the whole link layer — « les liens qui changent ».
 */
export const CUT_HYSTERESIS = 1.5
/**
 * Most children a tree node may have. A layer used to hold ALL its communities
 * as children (225 on a real graph): opening it overflowed the link budget at
 * once, and the cut stopped there — at 20 000 nodes on a phone no real node
 * could ever be reached, not even by zooming into a community. Above this, the
 * communities are grouped into spatial REGIONS (median cuts on their centres).
 */
export const MAX_CHILDREN = 16
/** Pairs kept while cutting, per drawn link (memory bound, not a drawing rule). */
export const LINK_PAIR_HEADROOM = 8
/** Priority bonus of an already-open group when the node budget is short. */
export const STICKY_BONUS = 3
/**
 * Opening a group shows its CHILDREN: it is only worth it when they will be
 * told apart on screen. k children spread over a projected radius R sit about
 * R/√k apart, so a group opens once R ≥ CHILD_SPACING_PX·√k (and ≥ τ). Measured
 * in a real browser on the real import graph (2 851 files): with τ alone a
 * 100-file group opened at 24 px into a clump of dots tied by thousands of
 * one-pixel threads — the structure (groups, the trunks between them) was lost.
 */
export const CHILD_SPACING_PX = 12

/**
 * The spacing a group needs is this much smaller when ALL its children are real
 * nodes. Groups apart must read as groups (the rule above), but real nodes are
 * small points (4 px at the floor): 6 px between them is legible. Measured on
 * the real graph (04/11/2026, desktop): every group still closed in view held
 * real nodes and sat at 27–38 px — 64 files need 96 px at full spacing, so the
 * front never burst into its nodes (« je devrais pouvoir voir tout en éclaté
 * en face de moi »).
 */
export const LEAF_SPACING_FACTOR = 0.5

/** Projected radius, px, above which a node with `childCount` children opens. */
export function openThresholdPx(tau: number, childCount: number, spacingPx = CHILD_SPACING_PX): number {
  return Math.max(tau, spacingPx * Math.sqrt(Math.max(1, childCount)))
}

export type ClusterKind = 'root' | 'layer' | 'region' | 'community' | 'split' | 'leaf'

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
    // centre of each community, for the spatial regions
    const centre = new Map<string, [number, number, number]>()
    for (const [key, members] of communities) {
      let cx = 0, cy = 0, cz = 0
      for (const i of members) { cx += xs[i]; cy += ys[i]; cz += zs[i] }
      centre.set(key, [cx / members.length, cy / members.length, cz / members.length])
    }
    /** Communities under `parent`; above MAX_CHILDREN, spatial regions first. */
    const place = (parent: number, keys: string[]) => {
      if (keys.length <= MAX_CHILDREN) {
        for (const key of keys) group(make(`L:${layer}|C:${key}`, parent, 'community'), communities.get(key)!)
        return
      }
      let parts = [keys]
      for (let c = 0; c < SPLIT_CUTS; c++) {
        const next: string[][] = []
        for (const part of parts) {
          if (part.length < 2) { next.push(part); continue }
          const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
          for (const k of part) {
            const q = centre.get(k)!
            for (let d = 0; d < 3; d++) { if (q[d] < lo[d]) lo[d] = q[d]; if (q[d] > hi[d]) hi[d] = q[d] }
          }
          const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]
          const axis = ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : ext[1] >= ext[2] ? 1 : 2
          const sorted = [...part].sort((a, b) => centre.get(a)![axis] - centre.get(b)![axis] || cmpStr(a, b))
          const half = Math.ceil(sorted.length / 2)
          next.push(sorted.slice(0, half).sort(cmpStr))
          next.push(sorted.slice(half).sort(cmpStr))
        }
        parts = next
      }
      parts.filter((p) => p.length > 0).forEach((part, k) => {
        const R = make(`${nodes[parent].id}|r${k}`, parent, 'region')
        nodes[R].memberStart = cursor
        place(R, part)
        nodes[R].memberEnd = cursor
      })
    }
    place(L, [...communities.keys()].sort(cmpStr))
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
  /**
   * Where the camera LOOKS (unit vector). Without it the budget was spent as
   * much behind the camera and off screen as in front of it. With it the cut
   * is foveated: what is out of view does not open, what is near the centre
   * of the screen opens earlier and first (see FOCUS_GAIN).
   */
  forward?: readonly [number, number, number]
  /** Viewport width / height (the horizontal angle of view). */
  aspect?: number
  /**
   * The SCREEN's up (unit vector, the camera's local +Y in world space). With
   * `forward` it gives the view its real rectangle: without it the view is a
   * circular cone of the half-diagonal, which on a portrait phone (±10.9°
   * across, ±22.5° up and down) counted everything to the sides as in view.
   */
  up?: readonly [number, number, number]
}

/**
 * How much the centre of the screen is favoured (asked: « ma zone qui dégrossit
 * plus grande autour de moi »). An element on the line of sight weighs
 * 1 + FOCUS_GAIN: it is opened first, and at a threshold √(1 + FOCUS_GAIN)
 * times lower; the weight falls linearly to 1 at the edge of the view.
 */
export const FOCUS_GAIN = 6

/**
 * Share of the half-view (from its centre) that gets the FULL focus weight;
 * beyond it the weight falls linearly to 1 at the edge. Asked twice (« ma zone
 * qui dégrossit plus grande autour de moi », « pas satisfait de la zone où ça
 * dégrossit »): with a pure linear falloff only the very centre got the full
 * bonus — the detail opened in a spot, not in the view.
 */
export const FOCUS_PLATEAU = 0.9

/**
 * Focus centrality of an element `x` half-views from the centre (0 = centre,
 * 1 = edge), in [0, 1]. It sets the OPENING threshold only: the budget PRIORITY
 * keeps the linear falloff, so when nodes run short the centre is still served
 * first (a plateau for both took the phone budget off the line of sight).
 */
export function focusCentrality(x: number): number {
  const v = Math.max(0, x)
  if (v <= FOCUS_PLATEAU) return 1
  return Math.max(0, Math.min(1, 1 - (v - FOCUS_PLATEAU) / (1 - FOCUS_PLATEAU)))
}

/** Weight of an element for the view (0 = out of view: never opened). */
export function focusWeight(
  dx: number, dy: number, dz: number, radius: number,
  forward: readonly [number, number, number] | undefined, halfDiagRad: number,
): number {
  if (!forward) return 1
  const dist = Math.hypot(dx, dy, dz)
  if (dist <= radius || dist === 0) return 1 + FOCUS_GAIN // the camera is inside it
  const cos = (dx * forward[0] + dy * forward[1] + dz * forward[2]) / dist
  const angle = Math.acos(Math.max(-1, Math.min(1, cos)))
  const angular = Math.asin(Math.min(1, radius / dist))
  // out of view (with a small margin so an element half on screen still opens)
  if (angle - angular > halfDiagRad * 1.1) return 0
  const centrality = Math.max(0, Math.min(1, 1 - Math.max(0, angle - angular) / halfDiagRad))
  return 1 + FOCUS_GAIN * centrality
}

/**
 * `focusWeight` against the view's RECTANGLE: the horizontal and the vertical
 * angles are each held to their own half-opening (`hHalfRad`, `vHalfRad`), with
 * the same 10 % margin and the element's angular radius. Measured on a phone
 * (390×844, real graph, 04/11/2026): with the circular cone the out-of-view
 * leaves grew from 184 to 877 while zooming in, taking the node budget from what
 * is in front.
 */
export function focusWeightRect(
  dx: number, dy: number, dz: number, radius: number,
  forward: readonly [number, number, number], up: readonly [number, number, number],
  vHalfRad: number, hHalfRad: number,
): number {
  const dist = Math.hypot(dx, dy, dz)
  if (dist <= radius || dist === 0) return 1 + FOCUS_GAIN // the camera is inside it
  // camera frame: depth along forward, x along right = forward × up, y along up
  const rx = forward[1] * up[2] - forward[2] * up[1]
  const ry = forward[2] * up[0] - forward[0] * up[2]
  const rz = forward[0] * up[1] - forward[1] * up[0]
  const depth = dx * forward[0] + dy * forward[1] + dz * forward[2]
  const x = dx * rx + dy * ry + dz * rz
  const y = dx * up[0] + dy * up[1] + dz * up[2]
  const angular = Math.asin(Math.min(1, radius / dist))
  const ax = Math.max(0, Math.atan2(Math.abs(x), depth) - angular)
  const ay = Math.max(0, Math.atan2(Math.abs(y), depth) - angular)
  if (ax > hHalfRad * 1.1 || ay > vHalfRad * 1.1) return 0
  const centrality = Math.max(0, Math.min(1, 1 - Math.max(ax / hHalfRad, ay / vHalfRad)))
  return 1 + FOCUS_GAIN * centrality
}

export interface CutBudget {
  /** Most frontier elements drawn. */
  maxNodes: number
  /**
   * Links DRAWN between frontier elements (the heaviest first, see
   * graphFromCut). It no longer limits what OPENS: measured on the audit's
   * graph (20 000 nodes), 69 % of the pairs carried one relation and filled
   * this budget long before the node budget — 200 to 400 elements on screen,
   * the detail could not open. Opening is bounded by maxNodes; pairs only by
   * maxLinks × LINK_PAIR_HEADROOM, for memory.
   */
  maxLinks: number
  /** Opening threshold, px (default DEFAULT_OPEN_PX). */
  openPx?: number
  /** Screen gap between the children of an opened group, px (default CHILD_SPACING_PX). */
  childSpacingPx?: number
  /** Leaves (tree indices) that must be drawn as themselves: their ancestors open first. */
  keepVisible?: readonly number[]
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
  // The ancestors of the leaves that must stay visible (the selected node):
  // opened whatever their size, so a selection never melts into a group.
  const mustOpen = new Set<number>()
  for (const leaf of budget.keepVisible ?? []) {
    for (let p = nodes[leaf]?.parent ?? -1; p >= 0; p = nodes[p].parent) mustOpen.add(p)
  }
  const [cx, cy, cz] = view.position
  const vHalf = (view.fovDeg * Math.PI) / 360
  const halfDiag = Math.atan(Math.tan(vHalf) * Math.sqrt(1 + (view.aspect ?? 1) ** 2))
  const hHalf = Math.atan(Math.tan(vHalf) * (view.aspect ?? 1))
  const rect = view.forward && view.up ? { f: view.forward, u: view.up } : null
  const weightOf = (i: number) => {
    const t = nodes[i]
    return rect
      ? focusWeightRect(t.x - cx, t.y - cy, t.z - cz, t.radius, rect.f, rect.u, vHalf, hHalf)
      : focusWeight(t.x - cx, t.y - cy, t.z - cz, t.radius, view.forward, halfDiag)
  }
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
    const kids = nodes[i].children
    const leafKids = kids.every((c) => nodes[c].kind === 'leaf')
    const spacing = (budget.childSpacingPx ?? CHILD_SPACING_PX) * (leafKids ? LEAF_SPACING_FACTOR : 1)
    const base = openThresholdPx(tau, kids.length, spacing)
    const wasOpen = previous?.open.has(i) ?? false
    const forced = mustOpen.has(i)
    const w = weightOf(i)
    // the opening threshold reads the PLATEAU weight (a wider detailed zone);
    // the heap below keeps the linear one (the centre first when short)
    const wOpen = w > 0 ? 1 + FOCUS_GAIN * focusCentrality(1 - (w - 1) / FOCUS_GAIN) : 0
    // Out of view: never opened — but what is already open stays open (a
    // rotation must not close it) as long as it is still big enough.
    if (w <= 0 && !wasOpen && !forced) return
    const focused = wasOpen
      ? base / Math.sqrt(1 + FOCUS_GAIN) / CUT_HYSTERESIS // sticky: best focus + hysteresis
      : base / Math.sqrt(Math.max(1, wOpen))
    if (!forced && px < focused) return
    // Heap order: forced (the selection) first; then by weighted screen size,
    // with a BONUS (not a rank) for what was already open. An absolute rank
    // for the open groups was tried: once the node budget was full, zooming
    // onto a group could no longer open it — the budget stayed with what was
    // open elsewhere. What you look at must win when the budget is short.
    //
    // Out of view, an open group keeps its place only with what the view
    // leaves: it is served AFTER everything in view (a negative priority, still
    // ordered by size among themselves). Measured on a phone (04/11/2026): near
    // the camera the groups to the side are as close, so as big, as the one
    // looked at — with the bonus they kept the whole budget (out-of-view leaves
    // 220 → 854 while zooming) and a 418 px group in front stayed closed.
    if (w <= 0 && !forced) {
      heap.push({ px: -1 / (1 + px), i })
      return
    }
    const stick = wasOpen ? STICKY_BONUS : 1
    heap.push({ px: (forced ? 1e12 : 0) + px * Math.max(1, w) * stick, i })
  }
  consider(tree.root)

  while (heap.size > 0) {
    const { i } = heap.pop()!
    const kids = nodes[i].children
    if (frontierSize - 1 + kids.length > maxNodes) continue
    for (const e of incident[i]) apply(e, -1)
    setRep(i, true)
    for (const e of incident[i]) apply(e, 1)
    if (pairs.size > maxLinks * LINK_PAIR_HEADROOM) {
      // Over the link budget: undo this opening.
      for (const e of incident[i]) apply(e, -1)
      setRep(i, false)
      for (const e of incident[i]) apply(e, 1)
      // Skip THIS one and go on: with MAX_CHILDREN an opening is small, and a
      // single refused group must not freeze the rest of the cut (it used to
      // `break`: one oversized layer and nothing else could ever open).
      continue
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

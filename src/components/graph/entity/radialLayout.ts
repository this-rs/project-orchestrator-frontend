/**
 * Deterministic radial layout for the entity ego-graph.
 *
 * - The center entity sits in the middle.
 * - One concentric ring per depth (hops from the center).
 * - On a ring, nodes are grouped by type (fixed TYPE_ORDER, one empty slot
 *   between groups), then sorted by weight (strongest first), then by id —
 *   same input ⇒ same picture, no force simulation, no jitter.
 * - "Relief": node radius and opacity scale with node weight, edge width and
 *   opacity with edge weight.
 *
 * Pure function, O(n log n + e): cheap enough to recompute on every data
 * change even on a phone. Pan/zoom never re-runs it (transform on a <g>).
 */
import type {
  NeighborhoodEdge,
  NeighborhoodNode,
  NeighborhoodResponse,
} from '@/services/neighborhood'
import { TYPE_ORDER } from './entityVisuals'

export interface LaidOutNode extends NeighborhoodNode {
  x: number
  y: number
  /** Circle radius, in viewBox units. */
  r: number
  opacity: number
  /** Angle on its ring (radians, 0 = east). Center: 0. */
  angle: number
  /** Ring index (0 = center). */
  ring: number
  isCenter: boolean
  /** Whether the label is drawn by default (dense rings hide most labels). */
  showLabel: boolean
  labelAnchor: 'start' | 'middle' | 'end'
  labelX: number
  labelY: number
}

export interface LaidOutEdge extends NeighborhoodEdge {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
  strokeWidth: number
  opacity: number
}

export interface RingInfo {
  depth: number
  radius: number
  count: number
}

export interface RadialLayout {
  size: number
  centerId: string
  nodes: LaidOutNode[]
  edges: LaidOutEdge[]
  rings: RingInfo[]
  /** id → node lookup */
  byId: Map<string, LaidOutNode>
}

type GraphInput = Pick<NeighborhoodResponse, 'center' | 'nodes' | 'edges'>

const MAX_DEPTH = 3

/** Clamp to [0, 1]; NaN / undefined → fallback. */
export function clamp01(v: number | undefined, fallback = 0): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(1, Math.max(0, v))
}

function typeRank(type: string): number {
  const i = TYPE_ORDER.indexOf(type)
  return i === -1 ? TYPE_ORDER.length : i
}

function compareOnRing(a: NeighborhoodNode, b: NeighborhoodNode): number {
  const ta = typeRank(a.type)
  const tb = typeRank(b.type)
  if (ta !== tb) return ta - tb
  if (a.type !== b.type) return a.type < b.type ? -1 : 1 // unknown types: alphabetical
  const wa = clamp01(a.weight)
  const wb = clamp01(b.weight)
  if (wa !== wb) return wb - wa
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

const round = (v: number) => Math.round(v * 100) / 100

export function radialLayout(graph: GraphInput, size: number): RadialLayout {
  const S = Number.isFinite(size) && size > 0 ? size : 600
  const half = S / 2
  const unit = S / 600 // every constant below is tuned for a 600-unit viewBox

  // ── Center ────────────────────────────────────────────────────────────
  const centerSrc = graph.nodes.find((n) => n.id === graph.center.id) ?? {
    id: graph.center.id,
    type: graph.center.type,
    label: graph.center.id,
    weight: 1,
    depth: 0,
    layer: '',
  }

  // ── Bucket the other nodes by ring (dedup ids, clamp depth) ───────────
  const seen = new Set<string>([centerSrc.id])
  const buckets = new Map<number, NeighborhoodNode[]>()
  for (const n of graph.nodes) {
    if (seen.has(n.id)) continue
    seen.add(n.id)
    const raw = Number.isFinite(n.depth) ? Math.round(n.depth) : 1
    const d = Math.min(MAX_DEPTH, Math.max(1, raw))
    const list = buckets.get(d)
    if (list) list.push(n)
    else buckets.set(d, [n])
  }
  const depths = [...buckets.keys()].sort((a, b) => a - b)
  const maxDepth = depths.length ? depths[depths.length - 1] : 1

  const margin = 70 * unit // room for labels on the outer ring
  const outerR = Math.max(10 * unit, half - margin)

  const nodes: LaidOutNode[] = []
  const centerR = 16 * unit
  nodes.push({
    ...centerSrc,
    weight: clamp01(centerSrc.weight, 1),
    depth: 0,
    x: half,
    y: half,
    r: centerR,
    opacity: 1,
    angle: 0,
    ring: 0,
    isCenter: true,
    showLabel: true,
    labelAnchor: 'middle',
    labelX: half,
    labelY: round(half + centerR + 14 * unit),
  })

  const rings: RingInfo[] = []
  // Max node radius per ring, before the "no overlap" clamp.
  const ringCap = [0, 11, 8.5, 7]

  for (const d of depths) {
    const list = (buckets.get(d) ?? []).slice().sort(compareOnRing)
    const radius = (outerR * d) / maxDepth
    rings.push({ depth: d, radius: round(radius), count: list.length })

    // Slots: one per node + one gap between consecutive type groups.
    let groups = 0
    for (let i = 0; i < list.length; i++) {
      if (i === 0 || list[i].type !== list[i - 1].type) groups++
    }
    const slots = list.length + (groups > 1 ? groups : 0)
    const step = (2 * Math.PI) / Math.max(1, slots)
    // Odd rings rotated by half a step so rings don't align radially.
    const start = -Math.PI / 2 + (d % 2 === 0 ? step / 2 : 0)

    const arc = radius * step
    const rMax = Math.max(2 * unit, Math.min(ringCap[d] * unit, arc * 0.42))
    const rMin = Math.max(1.5 * unit, rMax * 0.4)
    const dense = list.length > 18

    let slot = 0
    for (let i = 0; i < list.length; i++) {
      const n = list[i]
      if (groups > 1 && i > 0 && n.type !== list[i - 1].type) slot++ // group gap
      const angle = start + slot * step
      slot++
      const w = clamp01(n.weight)
      const r = rMin + (rMax - rMin) * w
      const x = half + radius * Math.cos(angle)
      const y = half + radius * Math.sin(angle)
      const cos = Math.cos(angle)
      const labelDist = radius + r + 5 * unit
      nodes.push({
        ...n,
        weight: w,
        depth: d,
        x: round(x),
        y: round(y),
        r: round(r),
        opacity: round(0.35 + 0.65 * w),
        angle,
        ring: d,
        isCenter: false,
        showLabel: !dense ? d === 1 || w >= 0.5 : w >= 0.85 && d === 1,
        labelAnchor: cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle',
        labelX: round(half + labelDist * cos),
        labelY: round(half + labelDist * Math.sin(angle) + 3.5 * unit),
      })
    }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))

  // ── Edges: keep those whose both ends are laid out; dedup ─────────────
  const edges: LaidOutEdge[] = []
  const edgeKeys = new Set<string>()
  for (const e of graph.edges) {
    const a = byId.get(e.source)
    const b = byId.get(e.target)
    if (!a || !b || a === b) continue
    const key = `${e.source}|${e.rel}|${e.target}`
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)
    const w = clamp01(e.weight)
    edges.push({
      ...e,
      weight: w,
      key,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      strokeWidth: round((0.6 + 2.4 * w) * unit),
      opacity: round(0.12 + 0.55 * w),
    })
  }
  // Weak edges first so strong ones are painted on top.
  edges.sort((a, b) => a.weight - b.weight || (a.key < b.key ? -1 : 1))

  return { size: S, centerId: centerSrc.id, nodes, edges, rings, byId }
}

export interface PathStep {
  from: string
  to: string
  rel: string
}

/**
 * Shortest path (in hops) from the center to `nodeId`, following the
 * strongest edge first on ties. Edges are treated as undirected.
 * Returns [] for the center itself and null when unreachable.
 */
export function pathToCenter(
  graph: Pick<NeighborhoodResponse, 'center' | 'edges'>,
  nodeId: string
): PathStep[] | null {
  const centerId = graph.center.id
  if (nodeId === centerId) return []
  const adj = new Map<string, { to: string; rel: string; w: number }[]>()
  const add = (a: string, b: string, rel: string, w: number) => {
    const l = adj.get(a)
    if (l) l.push({ to: b, rel, w })
    else adj.set(a, [{ to: b, rel, w }])
  }
  for (const e of graph.edges) {
    const w = clamp01(e.weight)
    add(e.source, e.target, e.rel, w)
    add(e.target, e.source, e.rel, w)
  }
  for (const l of adj.values()) l.sort((a, b) => b.w - a.w || (a.to < b.to ? -1 : 1))

  const prev = new Map<string, PathStep>()
  const visited = new Set([centerId])
  let frontier = [centerId]
  while (frontier.length) {
    const next: string[] = []
    for (const cur of frontier) {
      for (const { to, rel } of adj.get(cur) ?? []) {
        if (visited.has(to)) continue
        visited.add(to)
        prev.set(to, { from: cur, to, rel })
        if (to === nodeId) {
          const path: PathStep[] = []
          let k: string | undefined = nodeId
          while (k && k !== centerId) {
            const s: PathStep = prev.get(k)!
            path.unshift(s)
            k = s.from
          }
          return path
        }
        next.push(to)
      }
    }
    frontier = next
  }
  return null
}

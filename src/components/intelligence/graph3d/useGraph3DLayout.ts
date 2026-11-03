// ============================================================================
// 3D Graph Layout — Deterministic positioning & stable refresh
// ============================================================================
//
// Key design constraints:
// 1. DETERMINISTIC: Same node IDs → same initial positions (seeded PRNG)
// 2. STABLE ON REFRESH: WebSocket updates don't displace existing nodes
// 3. RELAYOUT THRESHOLD: Only re-simulate if >20% nodes change
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import type { IntelligenceNode, IntelligenceEdge } from '@/types/intelligence'
import { CORE_RATIO, layoutGroups, type AffinityMatrix } from './relationalLayout'
import { currentDeviceBudget } from './deviceTier'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Graph3DNode {
  id: string
  label: string
  entityType: string
  layer: string
  // d3-force-3d positions (mutable by the simulation)
  x: number
  y: number
  z: number
  // Fixed positions (pin after drag)
  fx?: number
  fy?: number
  fz?: number
  // Community membership (Louvain cluster)
  communityId?: number
  communityLabel?: string
  /// What the placement groups on. Falls back to the file's directory when the
  /// project has no GDS analytics, so a layer is never ONE anonymous ball.
  groupKey?: string
  /// Edges touching this node. Size and core position both key on it, in the
  /// 3D as in the code map: the same grammar in both views.
  degree?: number
  // Original data for rendering
  data: Record<string, unknown>
}

export interface Graph3DLink {
  source: string
  target: string
  relationType: string
  layer: string
  weight?: number
  confidence?: number
  count?: number
  color: string
  width: number
  particles: number
  particleSpeed: number
  /** true when source and target belong to different communities */
  isInterCommunity: boolean
  /** community IDs of source/target (for coloring inter-community edges) */
  sourceCommunityId?: number
  targetCommunityId?: number
}

export interface Graph3DData {
  nodes: Graph3DNode[]
  links: Graph3DLink[]
}

// ── Edge style mapping ────────────────────────────────────────────────────────

const LINK_PARTICLES: Record<string, { particles: number; speed: number }> = {
  SYNAPSE: { particles: 2, speed: 0.004 },
  CALLS: { particles: 1, speed: 0.003 },
  IMPORTS: { particles: 0, speed: 0 },
  AFFECTS: { particles: 2, speed: 0.003 },
  TRANSITION: { particles: 2, speed: 0.005 },
  HAS_STATE: { particles: 0, speed: 0 },
  INCLUDES_ENTITY: { particles: 0, speed: 0 },
}

const LINK_COLORS: Record<string, string> = {
  // Opaque hues: the rule that fades a family lives in LINK_FAMILY_ALPHA
  // (IntelligenceGraph3D). Every value used to be a low-alpha grey, so every
  // link looked like the same white thread — "les liens sont tous blancs".
  IMPORTS: '#38bdf8',
  CALLS: '#22d3ee',
  EXTENDS: '#6366f1',
  IMPLEMENTS: '#8b5cf6',
  CONTAINS: '#10b981',
  DEPENDS_ON: '#f97316',
  LINKED_TO: '#94a3b8',
  TOUCHES: '#22c55e',
  CO_CHANGED: '#f59e0b',
  CO_CHANGED_TRANSITIVE: '#d97706',
  AFFECTS: '#a855f7',
  DISCUSSED: '#ec4899',
  SYNAPSE: '#06b6d4',
  HAS_MEMBER: '#f472b6',
  INFORMED_BY: '#8b5cf6',
  HAS_TASK: '#0ea5e9',
  HAS_STEP: '#06b6d4',
  HAS_DECISION: '#c026d3',
  HAS_CONSTRAINT: '#ef4444',
  HAS_STATE: '#f97316',
  TRANSITION: '#ea580c',
  BELONGS_TO_SKILL: '#fb923c',
  INCLUDES_ENTITY: '#e879f9',
  HAS_FEATURE_GRAPH: '#84cc16',
}

const LINK_WIDTHS: Record<string, number> = {
  IMPORTS: 0.6,
  CALLS: 0.4,
  EXTENDS: 0.8,
  IMPLEMENTS: 0.6,
  AFFECTS: 1.0,
  SYNAPSE: 0.8,
  CO_CHANGED: 0.5,
  CO_CHANGED_TRANSITIVE: 0.3,
  LINKED_TO: 0.4,
  HAS_MEMBER: 0.4,
  HAS_STATE: 0.6,
  TRANSITION: 0.8,
  BELONGS_TO_SKILL: 0.4,
  INCLUDES_ENTITY: 0.4,
  // PM plan graph relations
  HAS_TASK: 0.8,
  HAS_CONSTRAINT: 0.5,
  HAS_DECISION: 0.6,
  HAS_FEATURE_GRAPH: 0.6,
  DISCUSSED: 0.4,
  DEPENDS_ON: 0.7,
  CONTAINS: 0.5,
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/**
 * Creation timestamp (milliseconds) of a node, read from `data.created_at` or
 * `data.createdAt`. Accepts an RFC 3339 / ISO date string and a Unix timestamp
 * in seconds OR milliseconds. `undefined` when the field is missing, blank or
 * unreadable — the placement then falls back to degree rank (the documented
 * behaviour for nodes that carry no date).
 */
function createdAtMs(d: Record<string, unknown>): number | undefined {
  const v = d.created_at ?? d.createdAt
  if (typeof v === 'number' && Number.isFinite(v)) {
    // A Unix timestamp: seconds (below ~year 5138) or milliseconds.
    return v > 1e12 ? v : v * 1000
  }
  if (typeof v === 'string' && v.length > 0) {
    const t = Date.parse(v)
    return Number.isFinite(t) ? t : undefined
  }
  return undefined
}

/** The file a node belongs to: `file_path` on a symbol, `path` on a file. */
function asPath(d: Record<string, unknown>): string | undefined {
  const p = d.file_path ?? d.path
  return typeof p === 'string' && p.length > 0 ? p : undefined
}

function asCommunityLabel(d: Record<string, unknown>): string | undefined {
  const l = d.community_label ?? d.communityLabel
  return typeof l === 'string' && l.length > 0 ? l : undefined
}

function directoryOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i > 0 ? path.slice(0, i) : '.'
}

/** Deterministic 32-bit hash (FNV-1a): the same group name always seeds the same shape. */
function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Seeded PRNG (Mulberry32): a nebula is irregular, but it must not move between renders. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * File path → community, read from the nodes that carry one.
 *
 * The API names the field in snake_case (`community_id`, `community_label`) on
 * file nodes and gives a symbol its owning file (`file_path`). Reading only
 * `communityId` left EVERY node in one anonymous group, so the placement drew
 * one regular ball per layer and the communities — the very thing the view
 * exists to show — were invisible.
 */
export function communityIndex(
  nodes: IntelligenceNode[],
): Map<string, { id: number; label?: string }> {
  const byPath = new Map<string, { id: number; label?: string }>()
  for (const node of nodes) {
    const d = node.data as Record<string, unknown>
    const id = asNumber(d.community_id ?? d.communityId)
    if (id == null) continue
    const path = asPath(d) ?? (d.entityType === 'file' ? node.id : undefined)
    if (path) byPath.set(path, { id, label: asCommunityLabel(d) })
  }
  return byPath
}

/**
 * A stable identity of a node set, for re-framing the camera once per dataset.
 *
 * A framing effect keyed on the node COUNT (or on the boolean `needsRelayout`,
 * which stays true) never re-fired when two projects had the same number of
 * nodes, so the camera kept the previous view's framing. This signature flips
 * whenever the node set changes — same size or not — because the first and last
 * id plus the count identify a dataset in O(1). It is deliberately cheap: it is
 * recomputed on every render of the 3D view.
 */
export function nodeSetSignature(nodes: { id: string }[]): string {
  if (nodes.length === 0) return ''
  return `${nodes.length}\u0001${nodes[0].id}\u0001${nodes[nodes.length - 1].id}`
}

/**
 * Where to put the camera to frame one community — the answer to "more control
 * on a big graph": at thousands of nodes you do not orbit the whole cloud, you
 * go to one cluster. Returns the centre, the radius that contains it, and the
 * distance that frames it. `null` when the community has no member.
 */
export function communityFocus(
  nodes: Graph3DNode[],
  communityId?: number,
): { x: number; y: number; z: number; radius: number } | null {
  const members =
    communityId == null ? [] : nodes.filter((n) => n.communityId === communityId)
  if (members.length === 0) return null
  let x = 0
  let y = 0
  let z = 0
  for (const m of members) {
    x += m.x
    y += m.y
    z += m.z
  }
  x /= members.length
  y /= members.length
  z /= members.length
  let radius = 0
  for (const m of members) {
    radius = Math.max(radius, Math.hypot(m.x - x, m.y - y, m.z - z))
  }
  return { x, y, z, radius }
}

/**
 * One node, with the community it BELONGS to: its own, or the one of the file
 * it lives in. `groupKey` is what the placement groups on — the community when
 * there is one, the file's directory otherwise (a project with no GDS analytics
 * still gets neighbours together instead of one bucket per layer).
 */
export function toGraph3DNode(
  node: IntelligenceNode,
  communityByPath: Map<string, { id: number; label?: string }>,
  pos?: { x: number; y: number; z: number },
  detectedByNode?: Map<string, number> | null,
): Graph3DNode {
  const data = node.data as Record<string, unknown>
  const entityType = (data.entityType as string) ?? 'file'
  const layer = (data.layer as string) ?? 'code'
  const own = asNumber(data.community_id ?? data.communityId)
  const path = asPath(data) ?? (entityType === 'file' ? node.id : undefined)
  const inherited = own == null && path ? communityByPath.get(path) : undefined
  // The backend community (own or the owning file's) wins when present. The
  // client-detected community then primes over the directory/(layer, type)
  // proxy the view used to fall back to on projects without GDS analytics.
  const detected = detectedByNode?.get(node.id)
  const communityId = own ?? inherited?.id ?? detected
  const communityLabel = asCommunityLabel(data) ?? inherited?.label
  return {
    id: node.id,
    label: (data.label as string) ?? node.id,
    entityType,
    layer,
    x: pos?.x ?? 0,
    y: pos?.y ?? 0,
    z: pos?.z ?? 0,
    communityId,
    communityLabel,
    // Prefer the community, then the directory, then the (layer, type) pair.
    // A knowledge note has no path: without this third rung it fell into a grid
    // cell labelled "2,7,7", which names nothing. "note:knowledge" does.
    groupKey:
      communityId != null
        ? `c${communityId}`
        : path
          ? `d${directoryOf(path)}`
          : `t${layer}:${entityType}`,
    data,
  }
}

const DOUBLE_SEP = '\u0001'
const GOLDEN_ANGLE = 2.39996

/**
 * Radius of a community's sphere, logarithmic in its mass.
 *
 * The old `10 + 3.2·√n` followed the mass so closely that a 20-node community
 * was ~16% of a 2000-node one: a speck next to a planet, and the whole project
 * layer (≈20 nodes) an invisible oval beside the code (≈2000 nodes). The
 * client ruled the constellation is the primary scale on every layer — the
 * layer is now a colour, not a place — so the radius grows with log₂ of the
 * mass and a small community stays readable:
 *
 *   rayon(m) = clamp(RADIUS_BASE + RADIUS_LOG_K · log₂(m), RADIUS_MIN, RADIUS_MAX)
 *
 * Measured: rayon(20) ≈ 98.9, rayon(200) ≈ 128.8, rayon(2000) ≈ 158.7 —
 * so rayon(20) is ≈ 62% of rayon(2000): smaller, but never a speck.
 */
const RADIUS_BASE = 60 // px — radius a 1-node group would have (log₂ 1 = 0)
const RADIUS_LOG_K = 9 // px added per doubling of the mass
const RADIUS_MIN = 60 // px — a tiny group is never a point
const RADIUS_MAX = 160 // px — a giant group stops growing

export function groupRadius(mass: number): number {
  const m = Math.max(1, mass)
  return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, RADIUS_BASE + RADIUS_LOG_K * Math.log2(m)))
}

/**
 * Deterministic O(N log N) placement — the po-graph technique.
 *
 * Nodes are grouped by (layer, community) and placed per group on two levels:
 * hubs at the centre, satellites on a corona. Every group of every layer is
 * spread over ONE Fibonacci sphere of centres around the origin — the layer is
 * now a colour, not a place — sized so the group CORES never touch (halos may
 * brush). No force simulation: the layout is complete the instant it is
 * computed. Hubs (the busiest ~10 %) sit near each group's pole; the satellites
 * wrap outward by creation date — the oldest nearest the centre, the newest at
 * the rim — falling back to degree rank when a group carries no readable dates.
 * Same input ⇒ same output (stable across refreshes).
 */
export function deterministicPlacement(
  nodes: Graph3DNode[],
  edges: IntelligenceEdge[],
): Map<string, { x: number; y: number; z: number }> {
  const out = new Map<string, { x: number; y: number; z: number }>()
  if (nodes.length === 0) return out

  // Degree (importance proxy) straight from the edges.
  const deg = new Map<string, number>()
  for (const e of edges) {
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1)
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1)
  }

  // Group by (layer, community). The layer stays in the key so two groups that
  // share a community id on different layers remain distinct — but it no longer
  // gets its own island: every group of every layer lives in one archipelago.
  const groups = new Map<string, Graph3DNode[]>()
  for (const n of nodes) {
    const key = n.layer + DOUBLE_SEP + (n.groupKey ?? String(n.communityId ?? 0))
    const g = groups.get(key)
    if (g) g.push(n)
    else groups.set(key, [n])
  }

  // ONE archipelago for every group: a single deterministic ordering and a
  // single ring/sphere of centres, sized so the CORES never touch (the old
  // per-layer islands are gone — a layer is now just a colour).
  const keys = [...groups.keys()].sort()
  const radii = keys.map((k) => groupRadius(groups.get(k)!.length))
  const cores = radii.map((r) => r * CORE_FRACTION)
  const step = (Math.PI * 2) / Math.max(1, keys.length)
  const ring = keys.length > 1
    ? Math.max(
        150,
        (cores.reduce((a, b) => a + b, 0) * 1.9) / Math.PI,
        (2 * Math.max(...cores)) / ((1 - RADIAL_JITTER) * 2 * Math.sin((step * (1 - 2 * ANGLE_JITTER)) / 2)),
      )
    : 0

  // Centres from REAL relations: A[g][h] = number of links between group g and
  // group h, stored once in canonical order (min, max). Nothing is invented: a
  // pair with no link has no affinity and is only pushed apart, never pulled.
  const groupOf = new Map<string, string>()
  for (const key of keys) for (const n of groups.get(key)!) groupOf.set(n.id, key)
  const affinities: AffinityMatrix = {}
  for (const e of edges) {
    const g = groupOf.get(e.source)
    const h = groupOf.get(e.target)
    if (!g || !h || g === h) continue
    const [a, b] = g < h ? [g, h] : [h, g]
    affinities[a] ??= {}
    affinities[a][b] = (affinities[a][b] ?? 0) + 1
  }
  // 60 iterations: the layout starts from a constructive placement that is
  // already free of overlap and relational, so the descent only refines it
  // (measured at 801 groups: 200 iterations cost 2× more for the same
  // compactness, and affine pairs 0.87 vs 0.88 of their envelope).
  const centres = layoutGroups(
    keys.map((k, i) => ({ id: k, radius: radii[i] })),
    affinities,
    { maxIterations: 60 },
  )

  keys.forEach((key, gi) => {
    const ids = groups.get(key)!
    // Every group gets its own deterministic shape: an even spiral on a
    // sphere is what read as "a ball". A nebula needs an irregular outline,
    // a dense core and a sparse halo.
    const rng = mulberry32(hashString(key))
    const phase = rng() * Math.PI * 2
    const radial = ring === 0 ? 0 : ring * (1 - RADIAL_JITTER + 2 * RADIAL_JITTER * rng())
    // A RING put every group in one plane: the graph read as a flat disc
    // whatever the node count. The centres sit on a Fibonacci SPHERE, so z
    // carries as much structure as x and y.
    const up = keys.length === 1 ? 0 : 1 - (gi / (keys.length - 1)) * 2
    const around = Math.sqrt(Math.max(0, 1 - up * up))
    const angle = GOLDEN_SPHERE * gi + (rng() - 0.5) * 2 * ANGLE_JITTER * step
    // A lone group stays at the origin, as before: there is nothing to relate it to.
    const placed = keys.length > 1 ? centres.get(key) : undefined
    const cx = placed ? placed.x : Math.cos(angle) * around * radial
    const cy = placed ? placed.y : up * radial
    const cz = placed ? placed.z : Math.sin(angle) * around * radial
    // Full 3D orientation, not a small roll.
    //
    // This used to be a single tilt of ±31° around X, so every group's cloud
    // lay in a plane almost parallel to XZ: the whole graph read as a stack of
    // plates, i.e. "flat" even though the centres were genuinely spread in
    // three dimensions. A yaw in [0, 2π) on top of the tilt gives each group a
    // freely oriented shape, so the cloud reads as a volume.
    const tilt = (rng() - 0.5) * Math.PI
    const yaw = rng() * Math.PI * 2
    const cosT = Math.cos(tilt)
    const sinT = Math.sin(tilt)
    const cosY = Math.cos(yaw)
    const sinY = Math.sin(yaw)

    // Busiest first: rank 0 is the core, the leaves are the halo.
    ids.sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

    const n = ids.length
    const r = radii[gi]
    // Two levels. HUBS (the most connected ~10 %, at least one) share the
    // core, within HUB_CORE of the radius. SATELLITES sit on a CORONA between
    // CORONA_INNER·R and R; the band thins as the group grows, so a big group
    // reads as a hollow shell around a bright hub, not a filled ball.
    const hubs = Math.max(1, Math.ceil(n * HUB_SHARE))
    const sats = n - hubs
    // ── Organelles: one lobe per entity type inside the group ──────────────
    // The REAL partition (a node has exactly one entity type), ordered by mass
    // so the biggest organelle takes the first direction. Nothing invented: a
    // type that is not in the group simply has no lobe.
    const byType = new Map<string, number>()
    for (const n of ids) {
      const t = n.entityType || 'unknown'
      byType.set(t, (byType.get(t) ?? 0) + 1)
    }
    const organelleTypes = [...byType.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([type]) => type)
    const organelleDir = new Map<string, [number, number, number]>()
    if (organelleTypes.length > 1) {
      organelleTypes.forEach((type, i) => {
        const up = 1 - (2 * (i + 0.5)) / organelleTypes.length
        const around = Math.sqrt(Math.max(0, 1 - up * up))
        const angle = GOLDEN_ANGLE * i
        organelleDir.set(type, [Math.cos(angle) * around, up, Math.sin(angle) * around])
      })
    }

    const place = (id: string, radius: number, th: number, el: number, type?: string) => {
      const ce = Math.cos(el)
      let x0 = radius * ce * Math.cos(th)
      let y0 = radius * Math.sin(el)
      let z0 = radius * ce * Math.sin(th)
      // Pull the direction toward the node's organelle, then put it back on the
      // sphere of the same radius: the lobe moves, the nebula's profile does not.
      const lobe = type ? organelleDir.get(type) : undefined
      if (lobe && radius > 1e-6) {
        const inv = 1 / radius
        let ux = x0 * inv
        let uy = y0 * inv
        let uz = z0 * inv
        ux = ux * (1 - ORGANELLE_BLEND) + lobe[0] * ORGANELLE_BLEND
        uy = uy * (1 - ORGANELLE_BLEND) + lobe[1] * ORGANELLE_BLEND
        uz = uz * (1 - ORGANELLE_BLEND) + lobe[2] * ORGANELLE_BLEND
        const len = Math.hypot(ux, uy, uz) || 1
        x0 = (ux / len) * radius
        y0 = (uy / len) * radius
        z0 = (uz / len) * radius
      }
      // Rotate around X (tilt), then around Y (yaw) — a different plane per group.
      const yt = y0 * cosT - z0 * sinT
      const zt = y0 * sinT + z0 * cosT
      out.set(id, {
        x: cx + x0 * cosY + zt * sinY,
        y: cy + yt,
        z: cz - x0 * sinY + zt * cosY,
      })
    }
    for (let k = 0; k < hubs; k++) {
      // A lone node is exactly at the centre; several hubs spiral inside it.
      const radius = hubs === 1 ? 0 : r * HUB_CORE * Math.sqrt((k + 0.5) / hubs)
      place(ids[k].id, radius, k * GOLDEN_ANGLE + phase, Math.asin(1 - (2 * (k + 0.5)) / hubs), ids[k].entityType)
    }
    // Satellites: INNER turns are the OLDEST nodes, OUTER turns the NEWEST. The
    // order is by creation date (oldest first, ties broken by id for strict
    // determinism); a group whose dates are missing or unreadable falls back to
    // degree rank — the ids array is already sorted by degree above. The radius
    // follows t^RADIAL_EXPONENT (t = normalised temporal rank), and each node
    // advances the angle by one GOLDEN_ANGLE, so the number of turns grows with
    // the mass: a big old group is a tight spiral, a small new one a loose ring.
    const satellites = ids.slice(hubs)
    const allDated = satellites.every((x) => createdAtMs(x.data) !== undefined)
    if (allDated) {
      satellites.sort((a, b) => {
        const ta = createdAtMs(a.data)!
        const tb = createdAtMs(b.data)!
        return ta - tb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      })
    }
    for (let j = 0; j < sats; j++) {
      const t = (j + 0.5) / sats
      // FILL the group, do not shell it.
      //
      // This used to be `(1-band) + band·t^k` with band shrinking as the group
      // grew: at 500 nodes every satellite sat between 0.86r and 0.98r, i.e.
      // an empty bubble with a bright hub inside. That is what read as "a ball
      // with a regular arrangement" and as "no relief". The radius now spans
      // the whole group, t^k concentrating the mass toward the core: half the
      // satellites of a group sit inside 0.32·r, the rest form the halo.
      const radius = r * CORONA_OUTER * Math.pow(t, RADIAL_EXPONENT)
      const w = (j * 0.7548776662 + 0.5) % 1
      place(satellites[j].id, radius, j * GOLDEN_ANGLE + phase, (w - 0.5) * CORONA_ELEVATION, satellites[j].entityType)
    }
  })
  return out
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Share of a group's radius that the dense core occupies. Rank-based placement
 * (exponent 1.7) puts half the nodes inside ~0.31·R, so `CORE_RATIO`·R is a
 * fair "this is where the mass is" and the spacing works on that, not on the
 * halo.
 *
 * It is the SAME constant the layout uses to decide how close two related
 * groups may sit (`hardDistance`). Two copies of 0.45 would drift one day, and
 * the symptom would be groups visibly overlapping while the layout believes
 * they do not.
 */
const CORE_FRACTION = CORE_RATIO
/** Share of a group kept as hubs at its centre, and how far they spread. */
const HUB_SHARE = 0.1
const HUB_CORE = 0.15
/**
 * Latitude span of a group's satellites, in radians (full sphere = π).
 *
 * It was 0.6, i.e. ±17° around the group's equator: every constellation was a
 * thin lens, and since the lenses were also nearly parallel (see the tilt note
 * in `deterministicPlacement`), the graph read as flat. A full span makes each
 * group a real shell — hubs in the core, satellites around them in every
 * direction.
 */
const CORONA_ELEVATION = Math.PI
/**
 * The corona's outer edge, as a share of the group radius. The 3D shell's
 * vertical spread (elevation + the group tilt) gives the outer turn a small
 * z-component, so an outer edge of exactly 1·R could read a touch PAST the
 * group radius when measured from the core's plane. Capping just inside keeps
 * the measured crown within [CORONA_INNER, 1.0] while the age still pushes the
 * newest nodes to the rim.
 */
const CORONA_OUTER = 0.98
/**
 * Radial law of a satellite's corona, `t^RADIAL_EXPONENT` with `t` the
 * normalised temporal rank (0 = oldest, 1 = newest). An exponent > 1 packs the
 * old nodes tight near the inner edge and spreads the recent ones toward the
 * rim: the inner turns read dense, the outer turns airy. Combined with the
 * fixed GOLDEN_ANGLE stride, the number of turns grows with the group's mass —
 * a big old group is a tight spiral, a small new one a loose ring.
 */
const RADIAL_EXPONENT = 1.7
/** Fibonacci-sphere stride: the group centres spread over a volume, not a circle. */
const GOLDEN_SPHERE = Math.PI * (3 - Math.sqrt(5))
/**
 * How strongly a node is pulled toward its own organelle (its entity type)
 * inside its group, 0 = none, 1 = fully.
 *
 * Without it, a group mixes files, notes, tasks and skills in one powder: the
 * eye sees a cloud, not a body. Blending the DIRECTION while keeping the RADIUS
 * clusters same-type nodes into lobes without touching the radial profile the
 * nebula is built on (core dense, halo sparse) — so the group reads as an
 * organelle-bearing organism instead of a bag of points.
 *
 * A group that holds a single entity type is NOT blended: a single organelle
 * direction would collapse the whole group onto one axis.
 */
const ORGANELLE_BLEND = 0.55

/** How far a core may drift along its radius, as a fraction of the ring. */
const RADIAL_JITTER = 0.1
/** How far a core may drift in angle, as a fraction of the angular step. */
const ANGLE_JITTER = 0.15

const RELAYOUT_THRESHOLD = 0.2 // 20% change triggers relayout

/**
 * The detected partition, if it still describes `nodes`: it must cover at
 * least (1 − RELAYOUT_THRESHOLD) of them. A partition answered for another
 * data set (another project whose file ids partly coincide, a first load
 * before the second one) is dropped instead of leaking its communities onto
 * the homonyms; an incremental refresh keeps it for the nodes it knows until
 * the new answer lands.
 */
export function partitionFor(
  partition: Map<string, number> | null,
  nodes: { id: string }[],
): Map<string, number> | null {
  if (!partition || nodes.length === 0) return null
  let known = 0
  for (const n of nodes) if (partition.has(n.id)) known++
  return known >= (1 - RELAYOUT_THRESHOLD) * nodes.length ? partition : null
}

// ── Community detection worker ────────────────────────────────────────────────

/** Give up on a worker answer after this long; the view keeps its fallback grouping. */
const COMMUNITY_DETECT_TIMEOUT_MS = 5000

function getCommunityWorker(ref: { current: Worker | null }): Worker {
  if (!ref.current) {
    ref.current = new Worker(
      new URL('@/workers/communityWorker.ts', import.meta.url),
      { type: 'module' },
    )
  }
  return ref.current
}

export function useGraph3DLayout(nodes: IntelligenceNode[], edges: IntelligenceEdge[]) {
  // Cache positions for stable refresh
  const positionCache = useRef<Map<string, { x: number; y: number; z: number }>>(new Map())
  const previousNodeIds = useRef<Set<string>>(new Set())

  // Client-side Louvain communities (computed in a worker). `null` until the
  // first result: nodes keep the directory/(layer, type) fallback meanwhile.
  // A partition is only used while it still describes the data (see
  // `partitionFor`): switching data set never shows the previous one's.
  const [detectedCommunities, setDetectedCommunities] = useState<Map<string, number> | null>(null)
  const communityVersionRef = useRef(0)
  const communityWorkerRef = useRef<Worker | null>(null)

  // Detect communities when the data changes, off the main thread. A stale
  // answer (older than the latest request) is dropped, and a worker that errors
  // or exceeds the global budget leaves the fallback in place — never an empty
  // screen, never a wrong partition.
  useEffect(() => {
    const version = ++communityVersionRef.current
    // No setState here: the caller keeps the fallback grouping until a result
    // arrives (and an empty graph has nothing to group).
    if (nodes.length === 0) return
    // Louvain on a very large graph is the worker's whole heap on a low-end device:
    // above the tier's threshold the fallback grouping stays (never an empty screen).
    if (nodes.length > currentDeviceBudget().budget.maxNodesForCommunityDetection) return

    const worker = getCommunityWorker(communityWorkerRef)
    const serializedNodes = nodes.map((n) => n.id)
    const serializedEdges = edges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.data?.weight,
    }))

    // The worker is shared: answers to older requests may still arrive, in
    // order, after this one was posted. Only the answer carrying THIS request
    // id is ours — an older one is ignored without unsubscribing, or our own
    // answer would be lost when it lands.
    const requestId = version
    let settled = false

    function cleanup(): void {
      if (settled) return
      settled = true
      worker.removeEventListener('message', handler)
      worker.removeEventListener('error', onError)
      clearTimeout(timeoutId)
    }

    function handler(
      event: MessageEvent<{ type?: string; requestId?: number; communities?: Record<string, number> }>,
    ): void {
      if (settled) return
      if (event.data?.type !== 'result' || event.data.requestId !== requestId) return
      cleanup()
      if (version !== communityVersionRef.current) return
      setDetectedCommunities(new Map(Object.entries(event.data.communities ?? {})))
    }

    function onError(): void {
      if (settled) return
      if (version === communityVersionRef.current) cleanup()
    }

    const timeoutId = setTimeout(cleanup, COMMUNITY_DETECT_TIMEOUT_MS)
    worker.addEventListener('message', handler)
    worker.addEventListener('error', onError)
    worker.postMessage({ requestId, nodes: serializedNodes, edges: serializedEdges })

    return cleanup
  }, [nodes, edges])

  // Terminate the worker when the consumer unmounts.
  useEffect(() => () => {
    if (communityWorkerRef.current) {
      communityWorkerRef.current.terminate()
      communityWorkerRef.current = null
    }
  }, [])

  /**
   * Transform IntelligenceNodes/Edges → Graph3DData.
   * Returns whether a relayout is needed (true if >20% nodes changed).
   */
  const transformToGraph3D = useCallback((
    nodes: IntelligenceNode[],
    edges: IntelligenceEdge[],
  ): { data: Graph3DData; needsRelayout: boolean } => {
    const currentIds = new Set(nodes.map((n) => n.id))
    const prevIds = previousNodeIds.current

    // Compute change ratio
    const added = [...currentIds].filter((id) => !prevIds.has(id))
    const removed = [...prevIds].filter((id) => !currentIds.has(id))
    const changeRatio = prevIds.size > 0
      ? (added.length + removed.length) / Math.max(prevIds.size, currentIds.size)
      : 1 // first load → always layout

    const needsRelayout = changeRatio >= RELAYOUT_THRESHOLD

    // Remove cached positions for removed nodes
    for (const id of removed) {
      positionCache.current.delete(id)
    }

    // Build 3D nodes (positions filled below from cache or the deterministic layout).
    const communityByPath = communityIndex(nodes)
    const detected = partitionFor(detectedCommunities, nodes)
    const graph3dNodes: Graph3DNode[] = nodes.map((node) =>
      toGraph3DNode(node, communityByPath, positionCache.current.get(node.id), detected),
    )

    // Weight, shared by both views: the size of a node and its place in the
    // core (a hub at the centre, a leaf at the rim) both key on this.
    const degree = new Map<string, number>()
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
    }
    for (const n of graph3dNodes) n.degree = degree.get(n.id) ?? 0

    // Nodes without a cached position are laid out deterministically in one
    // O(N log N) pass (po-graph's Fermat-spiral-per-community). On a first load
    // that is every node → the layout is complete immediately, no force
    // settling. Cached positions win so refreshes and drags stay stable.
    const uncached = graph3dNodes.filter((n) => !positionCache.current.has(n.id))
    if (uncached.length > 0) {
      const placed = deterministicPlacement(uncached, edges)
      for (const n of uncached) {
        const p = placed.get(n.id)
        if (p) {
          n.x = p.x
          n.y = p.y
          n.z = p.z
          positionCache.current.set(n.id, p)
        }
      }
    }

    // Build community lookup for inter-community edge detection
    const communityMap = new Map<string, number>()
    for (const n of graph3dNodes) {
      if (n.communityId != null) communityMap.set(n.id, n.communityId)
    }

    // Build 3D links
    const nodeIdSet = currentIds
    const graph3dLinks: Graph3DLink[] = edges
      .filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
      .map((edge) => {
        const relationType = (edge.data?.relationType as string) ?? 'IMPORTS'
        const particleConfig = LINK_PARTICLES[relationType] ?? { particles: 0, speed: 0 }
        const srcCommunity = communityMap.get(edge.source)
        const tgtCommunity = communityMap.get(edge.target)
        const isInterCommunity = srcCommunity != null && tgtCommunity != null && srcCommunity !== tgtCommunity
        return {
          source: edge.source,
          target: edge.target,
          relationType,
          layer: (edge.data?.layer as string) ?? 'fabric',
          weight: edge.data?.weight as number | undefined,
          confidence: edge.data?.confidence as number | undefined,
          count: edge.data?.count as number | undefined,
          color: LINK_COLORS[relationType] ?? '#6B7280',
          width: LINK_WIDTHS[relationType] ?? 1,
          particles: particleConfig.particles,
          particleSpeed: particleConfig.speed,
          isInterCommunity,
          sourceCommunityId: srcCommunity,
          targetCommunityId: tgtCommunity,
        }
      })

    // Update tracking
    previousNodeIds.current = currentIds

    return {
      data: { nodes: graph3dNodes, links: graph3dLinks },
      needsRelayout,
    }
  }, [detectedCommunities])

  /**
   * Update position cache after simulation settles.
   * Called from onEngineStop to persist computed positions.
   */
  const savePositions = useCallback((nodes: Graph3DNode[]) => {
    for (const node of nodes) {
      if (node.x !== undefined && node.y !== undefined && node.z !== undefined) {
        positionCache.current.set(node.id, { x: node.x, y: node.y, z: node.z })
      }
    }
  }, [])

  /**
   * Reset position cache (force full relayout next time).
   */
  const resetPositions = useCallback(() => {
    positionCache.current.clear()
    previousNodeIds.current.clear()
  }, [])

  return {
    transformToGraph3D,
    savePositions,
    resetPositions,
  }
}

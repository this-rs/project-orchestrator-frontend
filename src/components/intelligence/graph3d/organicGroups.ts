// ============================================================================
// organicGroups — hierarchical OrganicGroup representation of the 3D graph
// ============================================================================
//
// The flat aggregation (graphAggregation.ts) caps the number of groups at
// MAX_AGGREGATE_GROUPS and folds the small remainder into a catch-all
// "autres". That erases small families: a skill with two members, a plan with
// one task, a tiny community all disappear into the same anonymous bucket.
//
// organicGroups replaces that cap with a HIERARCHY. Every node belongs to
// exactly one OWNER group (a community, a semantic organite, or an "amas"
// cluster), so nothing is ever lost; a representative PARENT is emitted per
// family kind so the macro view stays readable without masking any family.
//
// Organites are built from REAL edges only — the `relationType` on an edge,
// never a label that merely resembles one:
//
//   • skill    — HAS_MEMBER       (skill → note/decision)   = members
//                BELONGS_TO_SKILL  (protocol → skill)        = child organite
//   • protocol — HAS_STATE        (protocol → state)         = members
//                TRANSITION       (state → state)            = internal edge
//   • plan     — HAS_TASK         (plan → task)              = child organite
//   • task     — HAS_STEP         (task → step)              = members
//
// Everything is deterministic: same input → same ids and members, whatever
// the order of nodes and edges.
//
// ── Group vocabulary ─────────────────────────────────────────────────────────
//   • OWNER group — owns real nodes (`members` = its DIRECT nodes). One per
//     family: each community, skill, protocol, plan, task, and each amas
//     (layer, type) cluster. Owners partition the graph: every node sits in
//     exactly one owner, so summing owners' `byType` reproduces the global
//     counts.
//   • PARENT group — a representative per family kind (id prefixed `parent:`),
//     used as the macro/zoom-out level. A parent owns no node directly; its
//     `members` is the union of every node in its subtree (so it conserves the
//     real members), its `count` that union's size, its `byType` the
//     composition. Zoom re-opens the subtree.
//   • NESTING — real container relations: a task organite's parent is its plan
//     (HAS_TASK), a protocol organite's parent is its skill (BELONGS_TO_SKILL).
//
// The budget rule is one group PER KIND, not per size: a 2000-node code
// community folds under the single `parent:community` exactly like a 1-node
// skill folds under `parent:skill`. No family is masked by another's size.
// ============================================================================

// ── Types ─────────────────────────────────────────────────────────────────────

/** Where a group came from. `louvain` is reserved for Phase B (client-detected
 *  communities) and is never produced by buildOrganicGroups. */
export type OrganicGroupSource = 'gds' | 'louvain' | 'directory' | 'organ' | 'amas'

export interface OrganicPoint {
  x: number
  y: number
  z: number
}

/** Minimal node shape, structurally compatible with Graph3DNode. */
export interface OrganicNode {
  id: string
  entityType: string
  layer?: string
  /** GDS community id. Wins over `groupKey` when present. */
  communityId?: number
  /** Placement key fallback (e.g. `c7`, `dsrc/chat`, `tnote:knowledge`). */
  groupKey?: string
  x?: number
  y?: number
  z?: number
}

/** Minimal edge shape, structurally compatible with Graph3DLink. */
export interface OrganicEdge {
  source: string
  target: string
  relationType: string
  layer?: string
  weight?: number
}

export interface OrganicGroup {
  /** Stable, deterministic id (`community:*`, `skill:*`, `amas:*`, `parent:*`…). */
  id: string
  parentId: string | null
  /** Family kind: `community` | `skill` | `protocol` | `plan` | `task` | `amas`. */
  kind: string
  /** Real node ids. Owners = their direct nodes; parents = subtree union. */
  members: string[]
  /** Number of real nodes in `members`. */
  count: number
  /** entityType → count over `members`. */
  byType: Map<string, number>
  /** Edges with both endpoints inside `members`. */
  internalEdgeCount: number
  /** Edges with exactly one endpoint inside `members`. */
  externalEdgeCount: number
  /** relationType → count of the internal edges. */
  relationDistribution: Map<string, number>
  centroid: OrganicPoint | null
  radius: number
  source: OrganicGroupSource
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PARENT_PREFIX = 'parent:'

/** Entity types that belong to the code layer, grouped by community. */
const CODE_TYPES = new Set(['file', 'function', 'struct', 'trait', 'enum', 'feature_graph'])

/** Head entities: each becomes its own organite, keyed by its own id. */
const ORGANITE_KINDS: Record<string, string> = {
  skill: 'skill',
  protocol: 'protocol',
  plan: 'plan',
  task: 'task',
}

/** "contains" relations: head (source) owns member (target). */
const MEMBER_RELATIONS = new Set(['HAS_MEMBER', 'HAS_STATE', 'HAS_STEP'])

// ── Helpers ───────────────────────────────────────────────────────────────────

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function byEdge(a: OrganicEdge, b: OrganicEdge): number {
  if (a.source !== b.source) return a.source < b.source ? -1 : 1
  if (a.target !== b.target) return a.target < b.target ? -1 : 1
  if (a.relationType !== b.relationType) return a.relationType < b.relationType ? -1 : 1
  return 0
}

function hasPos(n: OrganicNode): n is OrganicNode & { x: number; y: number; z: number } {
  return (
    typeof n.x === 'number' &&
    Number.isFinite(n.x) &&
    typeof n.y === 'number' &&
    Number.isFinite(n.y) &&
    typeof n.z === 'number' &&
    Number.isFinite(n.z)
  )
}

/** True when a group is a representative parent (an aggregator, no own nodes). */
export function isParentGroup(group: OrganicGroup): boolean {
  return group.id.startsWith(PARENT_PREFIX)
}

interface Classified {
  key: string
  kind: string
  source: OrganicGroupSource
}

/** Owner group of a node that is itself a head (skill/protocol/plan/task) or
 *  code; `null` for members/amas, resolved afterwards from edges. */
function classifyNode(node: OrganicNode): Classified | null {
  const t = node.entityType
  if (CODE_TYPES.has(t)) {
    if (node.communityId !== undefined) {
      return { key: `community:${node.communityId}`, kind: 'community', source: 'gds' }
    }
    if (node.groupKey !== undefined && node.groupKey !== '') {
      return { key: `community:group:${node.groupKey}`, kind: 'community', source: 'directory' }
    }
    return {
      key: `community:layer:${node.layer ?? 'code'}:${t}`,
      kind: 'community',
      source: 'directory',
    }
  }
  const kind = ORGANITE_KINDS[t]
  if (kind) return { key: `${kind}:${node.id}`, kind, source: 'organ' }
  return null
}

interface MutableGroup {
  id: string
  parentId: string | null
  kind: string
  source: OrganicGroupSource
  directMembers: string[]
  members: string[]
  count: number
  byType: Map<string, number>
  internalEdgeCount: number
  externalEdgeCount: number
  relationDistribution: Map<string, number>
  centroid: OrganicPoint | null
  radius: number
}

// ── Build ─────────────────────────────────────────────────────────────────────

export function buildOrganicGroups(nodes: OrganicNode[], edges: OrganicEdge[]): OrganicGroup[] {
  const sortedNodes = [...nodes].sort(byId)
  const sortedEdges = [...edges].sort(byEdge)

  const nodeMap = new Map<string, OrganicNode>()
  for (const n of sortedNodes) nodeMap.set(n.id, n)

  // 1. Heads and code nodes get their owner group straight away.
  const home = new Map<string, string>() // nodeId → owner group id
  const meta = new Map<string, { kind: string; source: OrganicGroupSource }>()
  for (const n of sortedNodes) {
    const c = classifyNode(n)
    if (c) {
      home.set(n.id, c.key)
      if (!meta.has(c.key)) meta.set(c.key, { kind: c.kind, source: c.source })
    }
  }

  // 2. Members join their head's organite via the real "contains" relation.
  //    A node reached from several heads goes to the smallest head key (stable).
  const memberHome = new Map<string, string>()
  for (const e of sortedEdges) {
    if (!MEMBER_RELATIONS.has(e.relationType)) continue
    const srcHome = home.get(e.source)
    if (srcHome === undefined) continue
    if (home.has(e.target)) continue // never demote a head/code node
    const cur = memberHome.get(e.target)
    if (cur === undefined || srcHome < cur) memberHome.set(e.target, srcHome)
  }
  for (const [nodeId, h] of memberHome) home.set(nodeId, h)

  // 3. Everything still unattached becomes an "amas" cluster of its layer:type.
  for (const n of sortedNodes) {
    if (home.has(n.id)) continue
    const key = `amas:${n.layer ?? 'unknown'}:${n.entityType}`
    home.set(n.id, key)
    if (!meta.has(key)) meta.set(key, { kind: 'amas', source: 'amas' })
  }

  // 4. Direct members per owner group, sorted for determinism.
  const ownerMembers = new Map<string, string[]>()
  for (const n of sortedNodes) {
    const key = home.get(n.id) as string
    const arr = ownerMembers.get(key)
    if (arr) arr.push(n.id)
    else ownerMembers.set(key, [n.id])
  }
  for (const arr of ownerMembers.values()) arr.sort()

  // 5. Nesting from real container relations (child organite → parent organite).
  const leafParent = new Map<string, string>()
  const linkChild = (child: string, parent: string) => {
    const cur = leafParent.get(child)
    if (cur === undefined || parent < cur) leafParent.set(child, parent)
  }
  for (const e of sortedEdges) {
    if (e.relationType === 'BELONGS_TO_SKILL') {
      const proto = home.get(e.source)
      const skill = home.get(e.target)
      if (proto && skill && meta.get(proto)?.kind === 'protocol' && meta.get(skill)?.kind === 'skill') {
        linkChild(proto, skill)
      }
    } else if (e.relationType === 'HAS_TASK') {
      const plan = home.get(e.source)
      const task = home.get(e.target)
      if (plan && task && meta.get(plan)?.kind === 'plan' && meta.get(task)?.kind === 'task') {
        linkChild(task, plan)
      }
    }
  }

  // 6. Assemble owner groups, resolving each parent id (nested or kind parent).
  const groups = new Map<string, MutableGroup>()
  const parentKinds = new Set<string>()
  for (const [key, members] of ownerMembers) {
    const m = meta.get(key) as { kind: string; source: OrganicGroupSource }
    let parentId: string | null
    if (m.kind === 'amas') {
      parentId = null
    } else {
      const nested = leafParent.get(key)
      parentId = nested !== undefined ? nested : PARENT_PREFIX + m.kind
      if (nested === undefined) parentKinds.add(m.kind)
    }
    groups.set(key, {
      id: key,
      parentId,
      kind: m.kind,
      source: m.source,
      directMembers: members,
      members: [],
      count: 0,
      byType: new Map(),
      internalEdgeCount: 0,
      externalEdgeCount: 0,
      relationDistribution: new Map(),
      centroid: null,
      radius: 0,
    })
  }

  // 7. Representative parents (macro level), one per family kind present.
  const parentSource = (kind: string): OrganicGroupSource => {
    if (kind !== 'community') return 'organ'
    for (const g of groups.values()) {
      if (g.kind === 'community' && g.source === 'gds') return 'gds'
    }
    return 'directory'
  }
  for (const kind of parentKinds) {
    const id = PARENT_PREFIX + kind
    groups.set(id, {
      id,
      parentId: null,
      kind,
      source: parentSource(kind),
      directMembers: [],
      members: [],
      count: 0,
      byType: new Map(),
      internalEdgeCount: 0,
      externalEdgeCount: 0,
      relationDistribution: new Map(),
      centroid: null,
      radius: 0,
    })
  }

  // 8. Children index, direct members, and subtree union (used by parents).
  const childrenOf = new Map<string, string[]>()
  for (const g of groups.values()) {
    if (g.parentId) {
      const arr = childrenOf.get(g.parentId)
      if (arr) arr.push(g.id)
      else childrenOf.set(g.parentId, [g.id])
    }
  }
  const subtreeCache = new Map<string, Set<string>>()
  const subtreeOf = (id: string): Set<string> => {
    const cached = subtreeCache.get(id)
    if (cached) return cached
    const g = groups.get(id) as MutableGroup
    const set = new Set<string>(g.directMembers)
    for (const child of childrenOf.get(id) ?? []) {
      for (const m of subtreeOf(child)) set.add(m)
    }
    subtreeCache.set(id, set)
    return set
  }

  // 9. Fill members, count, byType, centroid and radius per group.
  //    Owners keep their DIRECT nodes; parents aggregate their whole subtree.
  for (const g of groups.values()) {
    const members = (isParentGroup(g) ? [...subtreeOf(g.id)] : g.directMembers).sort()
    g.members = members
    g.count = members.length
    const points: OrganicPoint[] = []
    for (const id of members) {
      const n = nodeMap.get(id)
      if (!n) continue
      const t = n.entityType ?? 'unknown'
      g.byType.set(t, (g.byType.get(t) ?? 0) + 1)
      if (hasPos(n)) points.push({ x: n.x, y: n.y, z: n.z })
    }
    if (points.length > 0) {
      let sx = 0
      let sy = 0
      let sz = 0
      for (const p of points) {
        sx += p.x
        sy += p.y
        sz += p.z
      }
      const cx = sx / points.length
      const cy = sy / points.length
      const cz = sz / points.length
      let radius = 0
      for (const p of points) {
        const d = Math.hypot(p.x - cx, p.y - cy, p.z - cz)
        if (d > radius) radius = d
      }
      g.centroid = { x: cx, y: cy, z: cz }
      g.radius = radius
    }
  }

  // 10. Edge statistics over each group's member set.
  const membersSet = new Map<string, Set<string>>()
  for (const g of groups.values()) membersSet.set(g.id, new Set(g.members))
  for (const g of groups.values()) {
    const set = membersSet.get(g.id) as Set<string>
    let internal = 0
    let external = 0
    const relDist = new Map<string, number>()
    for (const e of sortedEdges) {
      const inS = set.has(e.source)
      const inT = set.has(e.target)
      if (inS && inT) {
        internal++
        relDist.set(e.relationType, (relDist.get(e.relationType) ?? 0) + 1)
      } else if (inS || inT) {
        external++
      }
    }
    g.internalEdgeCount = internal
    g.externalEdgeCount = external
    g.relationDistribution = relDist
  }

  const result: OrganicGroup[] = [...groups.values()].map((g) => ({
    id: g.id,
    parentId: g.parentId,
    kind: g.kind,
    members: g.members,
    count: g.count,
    byType: g.byType,
    internalEdgeCount: g.internalEdgeCount,
    externalEdgeCount: g.externalEdgeCount,
    relationDistribution: g.relationDistribution,
    centroid: g.centroid,
    radius: g.radius,
    source: g.source,
  }))
  result.sort(byId)
  return result
}

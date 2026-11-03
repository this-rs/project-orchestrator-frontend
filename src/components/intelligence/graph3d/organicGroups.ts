// ============================================================================
// organicGroups — the hierarchical "OrganicGroup" model (mission étape 1)
// ============================================================================
//
// Three independent hierarchies over the SAME real nodes and links:
//   • component   — connected components actually observed in the links;
//   • structural  — code/knowledge communities, inside their component
//                   (GDS community, else directory group, else 'ungrouped');
//   • semantic    — one organelle per entity type and layer (skill, protocol,
//                   plan, note…). Never capped: a small family stays visible.
//
// Every node belongs to exactly one structural group and one semantic group.
// Links are used only when both endpoints are present; nothing is inferred
// from identifiers or labels. Pure and deterministic: the output does not
// depend on the input order.
// ============================================================================

import type { Graph3DNode, Graph3DLink } from './useGraph3DLayout'

export type OrganicKind = 'component' | 'structural' | 'semantic'

export interface OrganicGroup {
  id: string
  parentId: string | null
  kind: OrganicKind
  /** Real node ids, sorted. */
  members: string[]
  count: number
  byType: Record<string, number>
  internalEdgeCount: number
  externalEdgeCount: number
  /** Real links touching the group, per relation type. */
  relationDistribution: Record<string, number>
  densityStats: { internalDensity: number }
  centroid: { x: number; y: number; z: number }
  bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
  /** Member with the highest degree (ties: smallest id). */
  anchor: string
  /** Where the grouping came from. */
  source: 'component' | 'gds' | 'directory' | 'ungrouped' | 'entityType'
  /** Visual radius: logarithmic in count, never below a perceptible minimum. */
  radius: number
}

export interface OrganicHierarchy {
  groups: OrganicGroup[]
  byId: Map<string, OrganicGroup>
  structuralOf: Map<string, string>
  semanticOf: Map<string, string>
  componentOf: Map<string, string>
}

const endpointId = (e: string | { id: string }): string => (typeof e === 'string' ? e : e.id)
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Radius grows with log(count); a single node still reads on screen. */
export function organicRadius(count: number): number {
  return Math.max(6, 4 + 5 * Math.log1p(Math.max(0, count)))
}

export function buildOrganicGroups(nodes: Graph3DNode[], links: Graph3DLink[]): OrganicHierarchy {
  const sorted = [...nodes].sort((a, b) => cmp(a.id, b.id))
  const byNode = new Map<string, Graph3DNode>()
  for (const n of sorted) byNode.set(n.id, n)

  // Only real links between present nodes, self-loops excluded, in a fixed order.
  const edges = links
    .map((l) => ({ s: endpointId(l.source), t: endpointId(l.target), type: l.relationType || 'UNKNOWN' }))
    .filter((e) => byNode.has(e.s) && byNode.has(e.t) && e.s !== e.t)
    .sort((a, b) => cmp(a.s, b.s) || cmp(a.t, b.t) || cmp(a.type, b.type))

  // ── Connected components (union-find, path compression) ───────────────────
  const parent = new Map<string, string>()
  for (const n of sorted) parent.set(n.id, n.id)
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r) as string
    let c = x
    while (c !== r) {
      const next = parent.get(c) as string
      parent.set(c, r)
      c = next
    }
    return r
  }
  for (const e of edges) {
    const a = find(e.s)
    const b = find(e.t)
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b)
  }
  // Component id = smallest member id (sorted input → first seen per root).
  const componentIdOfRoot = new Map<string, string>()
  const componentOf = new Map<string, string>()
  for (const n of sorted) {
    const root = find(n.id)
    if (!componentIdOfRoot.has(root)) componentIdOfRoot.set(root, `comp:${n.id}`)
    componentOf.set(n.id, componentIdOfRoot.get(root) as string)
  }

  // ── Membership ────────────────────────────────────────────────────────────
  const structuralOf = new Map<string, string>()
  const semanticOf = new Map<string, string>()
  const structuralSource = new Map<string, OrganicGroup['source']>()
  const acc = new Map<string, { kind: OrganicKind; parentId: string | null; source: OrganicGroup['source']; members: string[] }>()
  const add = (id: string, kind: OrganicKind, parentId: string | null, source: OrganicGroup['source'], member: string) => {
    let g = acc.get(id)
    if (!g) {
      g = { kind, parentId, source, members: [] }
      acc.set(id, g)
    }
    g.members.push(member)
  }

  for (const n of sorted) {
    const comp = componentOf.get(n.id) as string
    add(comp, 'component', null, 'component', n.id)

    let key: string
    let source: OrganicGroup['source']
    if (n.communityId != null) {
      key = `c${n.communityId}`
      source = 'gds'
    } else if (n.groupKey) {
      key = n.groupKey
      source = 'directory'
    } else {
      key = 'ungrouped'
      source = 'ungrouped'
    }
    const sid = `struct:${comp}|${key}`
    structuralOf.set(n.id, sid)
    structuralSource.set(sid, source)
    add(sid, 'structural', comp, source, n.id)

    const semId = `sem:${n.layer}:${n.entityType}`
    semanticOf.set(n.id, semId)
    add(semId, 'semantic', null, 'entityType', n.id)
  }

  // ── Per-group statistics ──────────────────────────────────────────────────
  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.s, (degree.get(e.s) ?? 0) + 1)
    degree.set(e.t, (degree.get(e.t) ?? 0) + 1)
  }

  const internal = new Map<string, number>()
  const external = new Map<string, number>()
  const relation = new Map<string, Record<string, number>>()
  const bump = (map: Map<string, number>, k: string) => map.set(k, (map.get(k) ?? 0) + 1)

  for (const e of edges) {
    // Every group touched by this link, each counted once for this link.
    const touched = new Set<string>()
    const sA = structuralOf.get(e.s) as string
    const sB = structuralOf.get(e.t) as string
    const mA = semanticOf.get(e.s) as string
    const mB = semanticOf.get(e.t) as string
    const cA = componentOf.get(e.s) as string

    if (sA === sB) bump(internal, sA)
    else {
      bump(external, sA)
      bump(external, sB)
    }
    if (mA === mB) bump(internal, mA)
    else {
      bump(external, mA)
      bump(external, mB)
    }
    bump(internal, cA)

    for (const id of [sA, sB, mA, mB]) touched.add(id)
    for (const id of touched) {
      const dist = relation.get(id) ?? {}
      dist[e.type] = (dist[e.type] ?? 0) + 1
      relation.set(id, dist)
    }
  }

  const groups: OrganicGroup[] = []
  for (const [id, g] of acc) {
    const members = [...g.members].sort(cmp)
    const byType: Record<string, number> = {}
    let sx = 0
    let sy = 0
    let sz = 0
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    let anchor = members[0]
    let anchorDeg = -1
    for (const m of members) {
      const node = byNode.get(m) as Graph3DNode
      byType[node.entityType] = (byType[node.entityType] ?? 0) + 1
      sx += node.x
      sy += node.y
      sz += node.z
      minX = Math.min(minX, node.x); maxX = Math.max(maxX, node.x)
      minY = Math.min(minY, node.y); maxY = Math.max(maxY, node.y)
      minZ = Math.min(minZ, node.z); maxZ = Math.max(maxZ, node.z)
      const d = degree.get(m) ?? 0
      if (d > anchorDeg) {
        anchorDeg = d
        anchor = m
      }
    }
    const count = members.length
    const pairs = (count * (count - 1)) / 2
    groups.push({
      id,
      parentId: g.parentId,
      kind: g.kind,
      members,
      count,
      byType,
      internalEdgeCount: internal.get(id) ?? 0,
      externalEdgeCount: external.get(id) ?? 0,
      relationDistribution: relation.get(id) ?? {},
      densityStats: { internalDensity: pairs > 0 ? (internal.get(id) ?? 0) / pairs : 0 },
      centroid: { x: sx / count, y: sy / count, z: sz / count },
      bounds: { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } },
      anchor,
      source: g.source,
      radius: organicRadius(count),
    })
  }
  groups.sort((a, b) => cmp(a.id, b.id))

  return { groups, byId: new Map(groups.map((g) => [g.id, g])), structuralOf, semanticOf, componentOf }
}

// ============================================================================
// cutGraph — a cut of the cluster tree, as the graph the scene draws
// ============================================================================
//
// The scale is no longer ONE global level for the whole scene (0 = detail,
// 1..6 = groups): the cluster tree is cut per element by its size ON SCREEN
// (`cutForView`, clusterTree.ts). A region close to the camera is opened down
// to its real nodes while a region far away stays one group, in the same frame.
//
// This module turns that cut into the `{ nodes, links }` every renderer already
// consumes, so nothing downstream changes:
//   • a frontier element that is a LEAF is the real node — the same object, the
//     same id — so selection, the fiche and hover keep working;
//   • a closed group is a super-node (`data.count`, `data.byType`, a name), with
//     the id `cl:<tree id>`, stable across cuts;
//   • a link between two real nodes stays the real link(s) (their relation
//     type); any link touching a group is ONE bundle carrying the exact count,
//     so the link law r(n) ∝ n^(1/3) draws the ramification consistently.
// No relation is lost or counted twice: the cut aggregates at the frontier.
// ============================================================================

import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'
import { membersOf, type ClusterCut, type ClusterNode, type ClusterTree } from './clusterTree'
import { superEdgeWeight, superEdgeWidth } from './graphAggregation'

/** Prefix of a closed group's node id. */
export const CLUSTER_NODE_PREFIX = 'cl:'

function endpointId(end: unknown): string {
  if (end && typeof end === 'object') return String((end as { id?: unknown }).id)
  return String(end)
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
}

/** The file path a node carries, when it has one. */
function pathOf(node: Graph3DNode): string | null {
  const d = node.data as { path?: unknown; file_path?: unknown } | undefined
  const p = d?.path ?? d?.file_path
  return typeof p === 'string' && p ? p : null
}

/**
 * The name of what a PART of a community holds: the directory most of its files
 * live in, said relative to the community (`components/chat`), not the
 * community's name again. Measured on the real import graph: eight parts of
 * `frontend/src/components` all read « frontend/src/components · partie » and
 * their labels piled up on screen, saying nothing.
 */
function partName(base: string, members: readonly Graph3DNode[]): string {
  const dirs = new Map<string, number>()
  for (const m of members) {
    const p = pathOf(m)
    if (!p) continue
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
    dirs.set(dir, (dirs.get(dir) ?? 0) + 1)
  }
  let dom = ''
  let domN = 0
  for (const [d, n] of dirs) if (n > domN || (n === domN && d < dom)) [dom, domN] = [d, n]
  const tail = (s: string, k: number) => s.split('/').filter(Boolean).slice(-k).join('/')
  if (dom && dom !== base && !base.endsWith(dom)) return tail(dom, 2)
  // Every file sits in the community's own directory: name the part by its
  // first file, alphabetically — stable, and tells two parts apart.
  const first = members.map((m) => pathOf(m) ?? m.label).filter(Boolean).sort()[0]
  return first ? `${tail(base, 1)} · ${tail(first, 1)}…` : `${base} · partie`
}

function groupName(t: ClusterNode, members: readonly Graph3DNode[]): string {
  // the whole graph (the camera turned away from it): never « Communauté 1 »
  if (t.kind === 'root') return 'Tout le graphe'
  if (t.kind === 'layer') return `Couche ${members[0]?.layer ?? ''}`.trim()
  const label = members.find((m) => m.communityLabel)?.communityLabel?.trim()
  const base = label || (members[0]?.communityId != null ? `Communauté ${members[0].communityId}` : 'Groupe')
  return t.kind === 'split' || t.kind === 'region' ? partName(base, members) : base
}

function superNode(tree: ClusterTree, index: number, source: readonly Graph3DNode[]): Graph3DNode {
  const t = tree.nodes[index]
  const members = membersOf(tree, index).map((i) => source[i])
  const byType: Record<string, number> = {}
  let dom = 'file'
  let domN = -1
  for (const m of members) {
    const n = (byType[m.entityType] = (byType[m.entityType] ?? 0) + 1)
    if (n > domN) {
      domN = n
      dom = m.entityType
    }
  }
  const name = groupName(t, members)
  return {
    id: CLUSTER_NODE_PREFIX + t.id,
    label: name,
    entityType: dom,
    layer: members[0]?.layer ?? 'fabric',
    x: t.x,
    y: t.y,
    z: t.z,
    communityId: members[0]?.communityId,
    communityLabel: name,
    data: { count: t.count, byType, name, clusterIndex: index, clusterRadius: t.radius },
  }
}

/**
 * The graph to draw for `cut`. `source` must be the node array the tree was
 * built from (indices are shared); `links` the same graph's links.
 */
export function graphFromCut(
  tree: ClusterTree,
  cut: ClusterCut,
  source: readonly Graph3DNode[],
  links: readonly Graph3DLink[],
  maxLinks = Infinity,
): { nodes: Graph3DNode[]; links: Graph3DLink[]; hiddenRelations: number } {
  const idOf = new Map<number, string>()
  // The community each drawn element stands in: the link renderer bundles a
  // corridor (one trunk that branches) per PAIR OF COMMUNITIES.
  const communityOf = new Map<number, number | undefined>()
  const nodes: Graph3DNode[] = []
  for (const index of cut.frontier) {
    const t = tree.nodes[index]
    if (t.kind === 'leaf') {
      const node = source[tree.order[t.memberStart]]
      idOf.set(index, node.id)
      communityOf.set(index, node.communityId)
      nodes.push(node)
    } else {
      const sn = superNode(tree, index, source)
      idOf.set(index, sn.id)
      communityOf.set(index, sn.communityId)
      nodes.push(sn)
    }
  }

  // Real links between two real nodes are kept as they are.
  let realByPair: Map<string, Graph3DLink[]> | null = null
  const realLinks = (a: string, b: string): Graph3DLink[] => {
    if (!realByPair) {
      realByPair = new Map()
      for (const l of links) {
        const k = pairKey(endpointId(l.source), endpointId(l.target))
        const list = realByPair.get(k)
        if (list) list.push(l)
        else realByPair.set(k, [l])
      }
    }
    return realByPair.get(pairKey(a, b)) ?? []
  }

  // The HEAVIEST pairs are drawn first, up to maxLinks: a trunk of 300
  // relations before a single thread between two far groups. What is left out
  // is counted (hiddenRelations), never silently lost. Ties: frontier order.
  const ranked = cut.links.length > maxLinks
    ? [...cut.links].sort((p, q) => q.count - p.count || p.a - q.a || p.b - q.b).slice(0, Math.max(0, maxLinks))
    : cut.links
  let hiddenRelations = 0
  if (ranked !== cut.links) {
    const kept = new Set(ranked)
    for (const l of cut.links) if (!kept.has(l)) hiddenRelations += l.count
  }
  let tierMax = 1
  for (const l of ranked) if (l.count > tierMax) tierMax = l.count
  const out: Graph3DLink[] = []
  for (const l of ranked) {
    const a = idOf.get(l.a)
    const b = idOf.get(l.b)
    if (a == null || b == null) continue
    const bothLeaves = tree.nodes[l.a].kind === 'leaf' && tree.nodes[l.b].kind === 'leaf'
    if (bothLeaves) {
      const real = realLinks(a, b)
      if (real.length > 0) {
        out.push(...real)
        continue
      }
    }
    // Without the two communities each aggregate was a corridor of its own: a
    // pair of modules with 376 imports (components ↔ types, real graph) was
    // drawn as dozens of threads of 1 to 12 relations — never as one trunk, so
    // the big connections could not be seen from afar.
    const ca = communityOf.get(l.a)
    const cb = communityOf.get(l.b)
    out.push({
      source: a,
      target: b,
      sourceCommunityId: ca,
      targetCommunityId: cb,
      relationType: 'AGGREGATE',
      layer: 'fabric',
      weight: superEdgeWeight(l.count, tierMax),
      count: l.count,
      color: 'rgba(148, 163, 184, 0.4)',
      width: superEdgeWidth(l.count),
      particles: 0,
      particleSpeed: 0,
      isInterCommunity: ca == null || cb == null || ca !== cb,
    })
  }
  return { nodes, links: out, hiddenRelations }
}

/** The tree index a drawn node stands for, or -1 for a real node. */
export function clusterIndexOf(node: Graph3DNode): number {
  const v = (node.data as { clusterIndex?: unknown } | undefined)?.clusterIndex
  return typeof v === 'number' && node.id.startsWith(CLUSTER_NODE_PREFIX) ? v : -1
}

/** The ids of the tree nodes a cut has opened (stable across trees of the same graph). */
export function openIdsOf(tree: ClusterTree, cut: ClusterCut): Set<string> {
  const ids = new Set<string>()
  for (const i of cut.open) ids.add(tree.nodes[i].id)
  return ids
}

/**
 * A `previous` cut for `cutForView` on a NEW tree (a data flush rebuilds it):
 * only its open set matters to the cut (hysteresis), and tree indices are per
 * tree, so the open groups are carried by their stable id. Without it a flush
 * re-cut from scratch closed every group held open only by the hysteresis, changed
 * the frontier and rebuilt the scene.
 */
export function carriedPrevious(tree: ClusterTree, openIds: ReadonlySet<string>): ClusterCut | undefined {
  if (openIds.size === 0) return undefined
  const open = new Set<number>()
  for (const t of tree.nodes) if (openIds.has(t.id)) open.add(t.index)
  return { frontier: [], open, links: [], internal: new Map() }
}

/**
 * The positioned members of every CLOSED group of `cut`, renumbered for the
 * community envelopes: `communityId` is the group's rank by size (biggest
 * first, tie broken on the tree id, so the selection the hull builder keeps is
 * stable), `communityLabel` its drawn name.
 *
 * An envelope wraps a group that is drawn as ONE point, to show the ground it
 * stands for. Open groups are not wrapped (their real nodes are on screen),
 * nor the root and the layers: one envelope around the whole scene is the
 * solid-colour sheet of 02/11. The nodes are copies; `source` is not touched.
 */
export function closedGroupHullNodes(
  tree: ClusterTree,
  cut: ClusterCut,
  source: readonly Graph3DNode[],
): Graph3DNode[] {
  const groups = cut.frontier
    .map((i) => tree.nodes[i])
    .filter((t) => t.kind === 'community' || t.kind === 'split' || t.kind === 'region')
    .sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const out: Graph3DNode[] = []
  groups.forEach((t, rank) => {
    const members = membersOf(tree, t.index).map((i) => source[i])
    const name = groupName(t, members)
    for (const m of members) out.push({ ...m, communityId: rank, communityLabel: name })
  })
  return out
}

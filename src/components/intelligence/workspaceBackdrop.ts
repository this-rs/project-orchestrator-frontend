// ============================================================================
// workspaceBackdrop — the graph of every workspace, laid out for a backdrop
// ============================================================================
//
// The workspace selector shows the graph of each workspace behind its list.
// This module is the pure part: it turns the backend graph of each workspace
// into normalised 2D points, reusing the nebula placement of the 3D view so the
// two read the same. No DOM, no network: the component fetches, this lays out.
//
// Each workspace is normalised into the unit square [-1, 1] around its own
// centre; the component places those squares on a grid. Node ids are prefixed
// by the workspace slug, so two projects that share a file path never merge.
// ============================================================================

import type { BackendGraphNode, BackendGraphEdge } from '@/types/intelligence'
import { deterministicPlacement, type Graph3DNode } from './graph3d/useGraph3DLayout'

export interface BackdropInput {
  slug: string
  graph: { nodes: BackendGraphNode[]; edges: BackendGraphEdge[] }
}

export interface BackdropPoint {
  x: number
  y: number
  /** Relations touching the node: drives the dot size, as in the 3D view. */
  degree: number
}

export interface BackdropLayer {
  slug: string
  /** Golden-angle hue, distinct per workspace. */
  hue: number
  /** Inside [-1, 1] on both axes, centred on the workspace's own centre. */
  points: BackdropPoint[]
  /** Indices into `points`. */
  edges: [number, number][]
}

const GOLDEN_ANGLE = 137.508

function toGraph3DNode(slug: string, n: BackendGraphNode): Graph3DNode {
  const attrs = n.attributes ?? {}
  const communityId = typeof attrs.community_id === 'number' ? attrs.community_id : undefined
  const path = typeof attrs.file_path === 'string' ? attrs.file_path : n.id
  const slash = path.lastIndexOf('/')
  const directory = slash > 0 ? path.slice(0, slash) : undefined
  return {
    id: `${slug}::${n.id}`,
    label: n.label,
    entityType: n.type,
    layer: n.layer,
    x: 0,
    y: 0,
    z: 0,
    communityId,
    groupKey: directory,
    data: {},
  }
}

/** Lay out each workspace's graph in its own unit square. Pure and deterministic. */
export function layoutBackdrop(inputs: readonly BackdropInput[]): BackdropLayer[] {
  return inputs.map((input, i) => {
    const nodes = input.graph.nodes.map((n) => toGraph3DNode(input.slug, n))
    const known = new Set(nodes.map((n) => n.id))
    const edges = input.graph.edges
      .map((e) => ({ source: `${input.slug}::${e.source}`, target: `${input.slug}::${e.target}` }))
      .filter((e) => known.has(e.source) && known.has(e.target))
    const placed = deterministicPlacement(nodes, edges)

    const index = new Map<string, number>()
    const degree = new Array<number>(nodes.length).fill(0)
    let extent = 0
    const raw = nodes.map((n, k) => {
      index.set(n.id, k)
      const p = placed.get(n.id) ?? { x: 0, y: 0, z: 0 }
      extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y))
      return p
    })
    const scale = extent > 0 ? 1 / extent : 1
    for (const e of edges) {
      degree[index.get(e.source)!] += 1
      degree[index.get(e.target)!] += 1
    }
    return {
      slug: input.slug,
      hue: (i * GOLDEN_ANGLE) % 360,
      points: raw.map((p, k) => ({ x: p.x * scale, y: p.y * scale, degree: degree[k] })),
      edges: edges.map((e) => [index.get(e.source)!, index.get(e.target)!] as [number, number]),
    }
  })
}

/** Centre of cell `i` in a grid of `n` cells, as fractions of the canvas [0, 1]². */
export function cellCentre(i: number, n: number): { cx: number; cy: number; cols: number; rows: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)))
  const rows = Math.max(1, Math.ceil(n / cols))
  const col = i % cols
  const row = Math.floor(i / cols)
  return { cx: (col + 0.5) / cols, cy: (row + 0.5) / rows, cols, rows }
}

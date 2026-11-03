// ============================================================================
// Community detection (Louvain) — client-side, deterministic, bounded
// ============================================================================
//
// Runs on the graph the view already has, so the aggregation groups REAL
// ensembles even when the backend never computed GDS communities (the
// `community_id` field is always null on user projects — the view then falls
// back to a directory or (layer, type) proxy, which groups nothing meaningful).
//
// COMPLEXITY
//   One local-moving pass visits every node once and every edge twice:
//   O(n + m), linear in the number of edges (m). Each level runs at most
//   `maxIterations` passes, then the graph is aggregated into super-nodes (the
//   size collapses fast: a clique becomes one vertex). The total is therefore
//   O(L · I · (n + m)) with L ≤ `maxLevels` (a small constant in practice) and
//   I = `maxIterations`. Memory is O(n + m).
//
// DETERMINISM
//   Node order, neighbour order and tie-breaking all derive from the input —
//   no Math.random, no hash of addresses, no timing inside the computation.
//   Same input ⇒ same partition, as long as the computation completes inside
//   the time budget. A wall-clock cutoff truncates at a pass boundary, which by
//   nature depends on machine speed; small graphs never hit it.
//
// BOUNDS
//   `timeBudgetMs` (default 400 ms) and `maxIterations` (default 10) cap the
//   work. When either is exhausted the best partition reached so far is
//   returned — never an exception, never an infinite loop.
// ============================================================================

/** An edge between two node ids, with an optional weight (default 1). */
export interface CommunityEdge {
  source: string
  target: string
  weight?: number
}

export interface CommunityDetectOptions {
  /** Wall-clock budget in ms. The best partition reached is returned. Default 400. */
  timeBudgetMs?: number
  /** Maximum local-moving passes per level. Default 10. */
  maxIterations?: number
  /** Maximum aggregation levels. Default 32. */
  maxLevels?: number
  /** Resolution parameter γ. Default 1.0 (plain modularity). */
  resolution?: number
}

/**
 * Result partition: node id → community id (dense integers 0..k-1).
 *
 * A node with NO edge in the input is absent: it has no community to find.
 * Giving each one its own made every unlinked note a group of one (300 notes
 * → 300 groups beside one group for 100 linked files, a scene 6.5× wider);
 * the caller pools them instead (directory, or layer and type).
 */
export type CommunityPartition = Map<string, number>

// ── Internal graph level ──────────────────────────────────────────────────────

interface Level {
  /** Number of vertices at this level. */
  size: number
  /** Undirected adjacency: vertex → Map(neighbour → weight). No self-loops. */
  adj: Array<Map<number, number>>
  /** Weighted degree of each vertex (self-loop weight included, doubled). */
  degree: Float64Array
  /** Total edge weight — preserved across levels (internal edges become self-loops). */
  totalWeight: number
}

const DEFAULT_TIME_BUDGET_MS = 400
const DEFAULT_MAX_ITERATIONS = 10
const DEFAULT_MAX_LEVELS = 32
const DEFAULT_RESOLUTION = 1.0

/**
 * Detect communities with a deterministic, budget-bounded Louvain.
 *
 * @param nodes node ids, in a stable order (that order IS the deterministic
 *   traversal order — pass the same order for the same partition).
 * @param edges undirected edges; self-loops and edges to unknown ids are ignored.
 */
export function detectCommunities(
  nodes: readonly string[],
  edges: readonly CommunityEdge[],
  options: CommunityDetectOptions = {},
): CommunityPartition {
  const result: CommunityPartition = new Map()
  const n = nodes.length
  if (n === 0) return result

  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const maxLevels = options.maxLevels ?? DEFAULT_MAX_LEVELS
  const gamma = options.resolution ?? DEFAULT_RESOLUTION
  const deadline = Date.now() + timeBudgetMs

  // node id → dense index (input order).
  const indexOf = new Map<string, number>()
  for (let i = 0; i < n; i++) indexOf.set(nodes[i], i)

  const base = buildBaseLevel(n, edges, indexOf)
  // No edges at all: no node has a community (see CommunityPartition).
  if (base.totalWeight <= 0) return result

  // Multilevel loop: local move, then aggregate, until nothing merges.
  let level = base
  const aggregations: Int32Array[] = []
  for (let levelCount = 0; levelCount < maxLevels; levelCount++) {
    if (Date.now() > deadline) break
    const partition = localMoving(level, gamma, maxIterations, deadline)
    const { labels, count } = relabel(partition)
    if (count === level.size) break // no merging: the partition is final
    aggregations.push(labels)
    if (count === 1) break
    level = aggregate(level, labels, count)
  }

  // Compose the aggregation chain back to the original nodes, leaving out the
  // nodes with no edge, and renumber densely in input order.
  const dense = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    if (base.adj[i].size === 0) continue
    let v = i
    for (let k = 0; k < aggregations.length; k++) v = aggregations[k][v]
    let c = dense.get(v)
    if (c === undefined) {
      c = dense.size
      dense.set(v, c)
    }
    result.set(nodes[i], c)
  }
  return result
}

// ── Build the base level ──────────────────────────────────────────────────────

function buildBaseLevel(
  n: number,
  edges: readonly CommunityEdge[],
  indexOf: Map<string, number>,
): Level {
  const adj: Array<Map<number, number>> = new Array(n)
  for (let i = 0; i < n; i++) adj[i] = new Map()

  let totalWeight = 0
  for (const e of edges) {
    const s = indexOf.get(e.source)
    const t = indexOf.get(e.target)
    if (s == null || t == null || s === t) continue
    const w =
      typeof e.weight === 'number' && Number.isFinite(e.weight) && e.weight > 0
        ? e.weight
        : 1
    adj[s].set(t, (adj[s].get(t) ?? 0) + w)
    adj[t].set(s, (adj[t].get(s) ?? 0) + w)
    totalWeight += w
  }

  const degree = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let d = 0
    for (const w of adj[i].values()) d += w
    degree[i] = d
  }

  return { size: n, adj, degree, totalWeight }
}

// ── Local moving phase ────────────────────────────────────────────────────────
//
// Greedy modularity optimisation. Moving vertex i from its community `cur` to a
// neighbour community `c` changes modularity by
//
//   ΔQ = (w_ic − w_i_cur)/m + γ·k_i·(tot[cur] − k_i − tot[c]) / (2m²)
//
// where w_ic is the edge weight from i into c, k_i the degree of i, tot[x] the
// total degree of community x, and m the total weight. Vertices are visited in
// index order, neighbours in insertion order: deterministic.

function localMoving(
  level: Level,
  gamma: number,
  maxIterations: number,
  deadline: number,
): Int32Array {
  const { adj, degree, totalWeight } = level
  const n = adj.length
  const partition = new Int32Array(n)
  for (let i = 0; i < n; i++) partition[i] = i

  // Community → total weighted degree of its members.
  const tot = new Float64Array(n)
  for (let i = 0; i < n; i++) tot[i] = degree[i]

  const twoM = 2 * totalWeight
  const twoM2 = twoM * totalWeight // 2·m²
  const commWeight = new Map<number, number>()

  outer: for (let iter = 0; iter < maxIterations; iter++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      // Budget guard: check every 256 vertices to keep the overrun tiny while
      // avoiding a Date.now() per vertex on large graphs.
      if ((i & 0xff) === 0 && Date.now() > deadline) break outer

      const ki = degree[i]
      const cur = partition[i]

      // Aggregate neighbour weights by their community.
      commWeight.clear()
      const nb = adj[i]
      for (const [j, w] of nb) {
        const c = partition[j]
        commWeight.set(c, (commWeight.get(c) ?? 0) + w)
      }

      const wToCur = commWeight.get(cur) ?? 0

      let bestDelta = 0
      let bestComm = cur
      for (const [c, w] of commWeight) {
        if (c === cur) continue
        const delta =
          (w - wToCur) / totalWeight +
          (gamma * ki * (tot[cur] - ki - tot[c])) / twoM2
        if (delta > bestDelta) {
          bestDelta = delta
          bestComm = c
        }
      }

      if (bestComm !== cur) {
        partition[i] = bestComm
        tot[cur] -= ki
        tot[bestComm] += ki
        moved = true
      }
    }
    if (!moved) break
  }
  return partition
}

// ── Relabel communities to dense ids ─────────────────────────────────────────

function relabel(partition: Int32Array): { labels: Int32Array; count: number } {
  const n = partition.length
  const labels = new Int32Array(n)
  const map = new Map<number, number>()
  let next = 0
  for (let i = 0; i < n; i++) {
    const c = partition[i]
    let l = map.get(c)
    if (l == null) {
      l = next++
      map.set(c, l)
    }
    labels[i] = l
  }
  return { labels, count: next }
}

// ── Aggregation phase ─────────────────────────────────────────────────────────
//
// Each community becomes a super-vertex. Internal edges become self-loops
// (they only feed the degree, doubled), inter-community edges become weighted
// edges between super-vertices. `totalWeight` is carried unchanged: dropping
// the internal edges would shrink m and corrupt every later ΔQ — this is what
// merged two cliques joined by a single bridge into one bogus community.

function aggregate(level: Level, labels: Int32Array, count: number): Level {
  const n = level.adj.length
  const adj: Array<Map<number, number>> = new Array(count)
  for (let c = 0; c < count; c++) adj[c] = new Map()

  const selfLoop = new Float64Array(count)

  for (let u = 0; u < n; u++) {
    const cu = labels[u]
    const nb = level.adj[u]
    for (const [v, w] of nb) {
      if (v < u) continue // count each undirected edge once
      const cv = labels[v]
      if (cu === cv) selfLoop[cu] += w
      else {
        adj[cu].set(cv, (adj[cu].get(cv) ?? 0) + w)
        adj[cv].set(cu, (adj[cv].get(cu) ?? 0) + w)
      }
    }
  }

  const degree = new Float64Array(count)
  for (let c = 0; c < count; c++) {
    let inter = 0
    for (const w of adj[c].values()) inter += w
    degree[c] = 2 * selfLoop[c] + inter
  }

  return { size: count, adj, degree, totalWeight: level.totalWeight }
}

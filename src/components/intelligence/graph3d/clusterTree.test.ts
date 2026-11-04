import { describe, it, expect } from 'vitest'
import {
  CUT_HYSTERESIS,
  MAX_CHILDREN,
  LINK_PAIR_HEADROOM,
  DEFAULT_OPEN_PX,
  buildClusterTree,
  cutForView,
  cutTransition,
  membersOf,
  projectedRadiusPx,
  openThresholdPx,
  focusWeightRect,
  FOCUS_GAIN,
  type ClusterTree,
  type CutView,
} from './clusterTree'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'

/** `n` nodes in `comms` communities (balls of radius 100 spread over 4 000), `e` links, 2 layers. */
function synth(n: number, e: number, comms: number, seed0 = 5) {
  let seed = seed0
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const centres = Array.from({ length: comms }, () => [
    (rnd() - 0.5) * 4000, (rnd() - 0.5) * 4000, (rnd() - 0.5) * 4000,
  ])
  const nodes: Graph3DNode[] = Array.from({ length: n }, (_, i) => {
    const c = i % comms
    return {
      id: `n${i}`, label: `n${i}`, entityType: 'file', layer: c % 4 === 0 ? 'knowledge' : 'code',
      x: centres[c][0] + (rnd() - 0.5) * 200,
      y: centres[c][1] + (rnd() - 0.5) * 200,
      z: centres[c][2] + (rnd() - 0.5) * 200,
      communityId: c, groupKey: `c${c}`, data: {},
    }
  })
  const types = ['IMPORTS', 'CALLS', 'DISCUSSED', 'CO_CHANGED']
  const links: Graph3DLink[] = Array.from({ length: e }, () => {
    const a = Math.floor(rnd() * n)
    // 60 % of the links stay in the community, the rest cross the graph
    const b = rnd() < 0.6 ? (a + comms * Math.floor(rnd() * 30)) % n : Math.floor(rnd() * n)
    return {
      source: `n${a}`, target: `n${b}`, relationType: types[Math.floor(rnd() * 4)], layer: 'code',
      color: '#fff', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: false,
    }
  })
  return { nodes, links, centres }
}

const view = (x: number, y: number, z: number, height = 900): CutView => ({
  position: [x, y, z], fovDeg: 45, viewportHeightPx: height,
})

const BIG = { maxNodes: 1e9, maxLinks: 1e9 }

/** Sum of every link the cut accounts for: drawn between elements + collapsed inside one. */
function accounted(tree: ClusterTree, cut: ReturnType<typeof cutForView>): number {
  let s = 0
  for (const l of cut.links) s += l.count
  for (const c of cut.internal.values()) s += c.count
  void tree
  return s
}

describe('buildClusterTree — the hierarchy', () => {
  const g = synth(3000, 6000, 30)
  const tree = buildClusterTree(g.nodes, g.links)

  it('goes root → layer → community → spatial parts → leaves, every node in exactly one leaf', () => {
    expect(tree.nodes[tree.root].kind).toBe('root')
    const kinds = new Set(tree.nodes.map((t) => t.kind))
    for (const k of ['root', 'layer', 'community', 'split', 'leaf']) expect(kinds.has(k as never)).toBe(true)
    const leaves = tree.nodes.filter((t) => t.kind === 'leaf')
    expect(leaves.length).toBe(g.nodes.length)
    expect(new Set(leaves.map((l) => membersOf(tree, l.index)[0])).size).toBe(g.nodes.length)
  })

  it('splits any group above the cap, and a parent holds exactly its children’s members', () => {
    for (const t of tree.nodes) {
      if (t.kind === 'leaf') continue
      const kids = t.children.reduce((s, c) => s + tree.nodes[c].count, 0)
      expect(kids).toBe(t.count)
      if (t.kind === 'community' || t.kind === 'split') {
        // a group with leaf children is small; a bigger one is split
        if (t.children.every((c) => tree.nodes[c].kind === 'leaf')) expect(t.count).toBeLessThanOrEqual(tree.groupCap)
      }
    }
  })

  it('bounding radius encloses every member', () => {
    for (const t of tree.nodes) {
      for (const i of membersOf(tree, t.index)) {
        const n = g.nodes[i]
        expect(Math.hypot(n.x - t.x, n.y - t.y, n.z - t.z)).toBeLessThanOrEqual(t.radius + 1e-6)
      }
    }
  })

  it('link counts add up exactly from one level to the next', () => {
    expect(tree.linkTotal).toBe(g.links.length - tree.skippedLinks)
    const root = tree.nodes[tree.root]
    expect(root.internal.count).toBe(tree.linkTotal)
    for (const p of tree.nodes) {
      if (p.children.length === 0) continue
      const inside = new Set(p.children)
      let external = 0
      let childChild = 0
      let childInternal = 0
      for (const c of p.children) {
        const child = tree.nodes[c]
        childInternal += child.internal.count
        for (const [other, agg] of child.links) {
          if (inside.has(other)) childChild += agg.count
          else external += agg.count
        }
      }
      let parentExternal = 0
      for (const agg of p.links.values()) parentExternal += agg.count
      // a link leaving P leaves exactly one child; a link inside P is either inside one child or between two
      expect(external).toBe(parentExternal)
      expect(childInternal + childChild / 2).toBe(p.internal.count)
    }
  })

  it('every tree node counts exactly the relations with ONE end inside it — uneven depths too', () => {
    // community 0 is huge (split twice), the others are small (leaves at once):
    // leaves end at different depths, the case where a shallow leaf could be
    // recorded again at a deeper level.
    const u = synth(2400, 5000, 40, 9)
    for (let i = 0; i < 1200; i++) u.nodes[i].communityId = 0
    const t = buildClusterTree(u.nodes, u.links)
    expect(new Set(t.nodes.filter((x) => x.kind === 'leaf').map((x) => x.depth)).size).toBeGreaterThan(1)
    const ancestors = (i: number) => {
      const s = new Set<number>()
      for (let k = t.leafOf[i]; k >= 0; k = t.nodes[k].parent) s.add(k)
      return s
    }
    const external = new Array(t.nodes.length).fill(0)
    for (let e = 0; e < t.linkTotal; e++) {
      const a = ancestors(t.edgeA[e])
      const b = ancestors(t.edgeB[e])
      for (const k of a) if (!b.has(k)) external[k]++
      for (const k of b) if (!a.has(k)) external[k]++
    }
    for (const x of t.nodes) {
      let sum = 0
      for (const agg of x.links.values()) sum += agg.count
      expect(sum).toBe(external[x.index])
    }
  })

  it('keeps the per-family split exact', () => {
    const root = tree.nodes[tree.root].internal
    expect(root.byFamily.structure + root.byFamily.knowledge + root.byFamily.tissue).toBe(root.count)
    expect(root.byFamily.knowledge).toBeGreaterThan(0)
  })

  it('is deterministic whatever the input order', () => {
    const shuffled = buildClusterTree([...g.nodes].reverse(), [...g.links].reverse())
    expect(shuffled.nodes.map((t) => [t.id, t.count, t.internal.count]).sort())
      .toEqual(tree.nodes.map((t) => [t.id, t.count, t.internal.count]).sort())
  })
})

describe('cutForView — one cut, several scales at once', () => {
  const g = synth(4000, 8000, 40)
  const tree = buildClusterTree(g.nodes, g.links)
  const far = view(0, 0, 14000)

  it('conserves every link at any cut: drawn + collapsed = total, no pair twice', () => {
    for (const v of [far, view(0, 0, 5000), view(g.centres[3][0], g.centres[3][1], g.centres[3][2] + 250)]) {
      const cut = cutForView(tree, v, BIG)
      expect(accounted(tree, cut)).toBe(tree.linkTotal)
      const pairs = new Set(cut.links.map((l) => `${l.a}-${l.b}`))
      expect(pairs.size).toBe(cut.links.length)
      for (const l of cut.links) {
        expect(l.a).toBeLessThan(l.b)
        expect(l.byFamily.structure + l.byFamily.knowledge + l.byFamily.tissue).toBe(l.count)
      }
    }
  })

  it('every frontier element covers its members once: the frontier partitions the nodes', () => {
    const cut = cutForView(tree, view(0, 0, 5000), BIG)
    const seen = new Set<number>()
    for (const f of cut.frontier) for (const i of membersOf(tree, f)) {
      expect(seen.has(i)).toBe(false)
      seen.add(i)
    }
    expect(seen.size).toBe(g.nodes.length)
  })

  it('opens the region near the camera and keeps a far region closed IN THE SAME CUT', () => {
    const [cx, cy, cz] = g.centres[3]
    const cut = cutForView(tree, view(cx, cy, cz + 250), BIG)
    const frontierIds = cut.frontier.map((f) => tree.nodes[f])
    // near: the frontier holds single nodes of community 3
    const nearLeaves = frontierIds.filter((t) => t.kind === 'leaf' && g.nodes[membersOf(tree, t.index)[0]].communityId === 3)
    expect(nearLeaves.length).toBeGreaterThan(10)
    // far: the community furthest from the camera is ONE closed element (or inside one)
    let farthest = 0
    let best = -1
    g.centres.forEach((c, i) => {
      const d = Math.hypot(c[0] - cx, c[1] - cy, c[2] - cz)
      if (d > best) { best = d; farthest = i }
    })
    const farMembers = g.nodes.map((n, i) => (n.communityId === farthest ? i : -1)).filter((i) => i >= 0)
    const holders = cut.frontier.filter((f) => membersOf(tree, f).some((i) => farMembers.includes(i)))
    // the far community is drawn as a few aggregates, never down to its nodes
    expect(holders.every((f) => tree.nodes[f].kind !== "leaf")).toBe(true)
    expect(holders.length).toBeLessThan(farMembers.length / 5)
    // while the near one is open down to single nodes
    const nearMembers = g.nodes.filter((n) => n.communityId === 3).length
    expect(nearLeaves.length).toBe(nearMembers)
  })

  it('a far camera sees few elements, a near one many — no global level', () => {
    const coarse = cutForView(tree, far, BIG)
    const fine = cutForView(tree, view(0, 0, 3000), BIG)
    expect(coarse.frontier.length).toBeLessThan(fine.frontier.length)
    expect(coarse.frontier.length).toBeGreaterThanOrEqual(1)
  })

  it('respects the node and link budgets, opening the biggest screen error first', () => {
    const near = view(g.centres[3][0], g.centres[3][1], g.centres[3][2] + 250)
    const free = cutForView(tree, near, BIG)
    const budget = { maxNodes: 120, maxLinks: 400 }
    const tight = cutForView(tree, near, budget)
    expect(free.frontier.length).toBeGreaterThan(budget.maxNodes)
    expect(tight.frontier.length).toBeLessThanOrEqual(budget.maxNodes)
    // pairs are bounded for memory only; what is DRAWN is capped by graphFromCut
    expect(tight.links.length).toBeLessThanOrEqual(budget.maxLinks * LINK_PAIR_HEADROOM)
    expect(accounted(tree, tight)).toBe(tree.linkTotal)
    // the element the camera sits in is opened before anything else
    const near3 = tight.frontier.filter((f) => g.nodes[membersOf(tree, f)[0]].communityId === 3)
    expect(near3.every((f) => tree.nodes[f].kind !== 'layer')).toBe(true)
  })

  it('respects a node budget alone (links unlimited)', () => {
    const near = view(g.centres[3][0], g.centres[3][1], g.centres[3][2] + 250)
    const cut = cutForView(tree, near, { maxNodes: 200, maxLinks: 1e9 })
    expect(cut.frontier.length).toBeLessThanOrEqual(200)
    expect(cut.frontier.length).toBeGreaterThan(100)
    expect(accounted(tree, cut)).toBe(tree.linkTotal)
  })

  it('hysteresis: ±5 % of camera motion does not flip anything back and forth', () => {
    const base = 5200
    let prev = cutForView(tree, view(0, 0, base), BIG)
    // settle once in each direction, then the sequence must be stable
    prev = cutForView(tree, view(0, 0, base * 0.95), BIG, prev)
    prev = cutForView(tree, view(0, 0, base * 1.05), BIG, prev)
    const ref = [...prev.open].sort((a, b) => a - b)
    for (const k of [0.95, 1.05, 0.95, 1.05, 1]) {
      prev = cutForView(tree, view(0, 0, base * k), BIG, prev)
      expect([...prev.open].sort((a, b) => a - b)).toEqual(ref)
    }
  })

  it('without the previous cut the same move DOES flip some elements (the test can fail)', () => {
    const a = cutForView(tree, view(0, 0, 5200 * 0.95), BIG)
    const b = cutForView(tree, view(0, 0, 5200 * 1.05), BIG)
    expect(a.open.size).not.toBe(b.open.size)
  })

  it('is deterministic', () => {
    const v = view(500, -200, 4000)
    const a = cutForView(tree, v, { maxNodes: 300, maxLinks: 2000 })
    const b = cutForView(tree, v, { maxNodes: 300, maxLinks: 2000 })
    expect(b.frontier).toEqual(a.frontier)
    expect(b.links).toEqual(a.links)
  })

  it('projects a radius with the camera fov and the viewport height', () => {
    // r / (d·tan(fov/2)) × H/2
    expect(projectedRadiusPx(100, 1000, 45, 900)).toBeCloseTo((100 / (1000 * Math.tan((22.5 * Math.PI) / 180))) * 450, 9)
    expect(projectedRadiusPx(100, 50, 45, 900)).toBe(Number.POSITIVE_INFINITY)
    expect(DEFAULT_OPEN_PX).toBe(24)
    expect(CUT_HYSTERESIS).toBe(1.5)
  })
})

describe('cutTransition — what splits and what merges', () => {
  const g = synth(3000, 6000, 30)
  const tree = buildClusterTree(g.nodes, g.links)
  const [cx, cy, cz] = g.centres[2]
  const farCut = cutForView(tree, view(0, 0, 14000), BIG)
  const nearCut = cutForView(tree, view(cx, cy, cz + 250), BIG, farCut)

  it('maps every opened parent to the children that replace it, and back', () => {
    const t = cutTransition(tree, farCut, nearCut)
    expect(t.splits.length).toBeGreaterThan(0)
    for (const s of t.splits) {
      const parentMembers = new Set(membersOf(tree, s.parent))
      const childMembers = s.children.flatMap((c) => membersOf(tree, c))
      expect(childMembers.length).toBe(parentMembers.size)
      for (const i of childMembers) expect(parentMembers.has(i)).toBe(true)
      for (const c of s.children) expect(t.prevOf.get(c)).toBe(s.parent)
    }
    const back = cutTransition(tree, nearCut, farCut)
    expect(back.merges.map((m) => m.parent).sort()).toEqual(t.splits.map((s) => s.parent).sort())
    // every element of either cut is placed: kept, split or merged
    for (const f of nearCut.frontier) expect(t.prevOf.has(f)).toBe(true)
    for (const f of farCut.frontier) expect(t.nextOf.has(f)).toBe(true)
  })

  it('a split link starts from its parent conduit', () => {
    const t = cutTransition(tree, farCut, nearCut)
    const prevPairs = new Set(farCut.links.map((l) => `${l.a}-${l.b}`))
    for (const l of nearCut.links.slice(0, 200)) {
      const pa = t.prevOf.get(l.a)!
      const pb = t.prevOf.get(l.b)!
      if (pa === pb) continue // born inside one element: it fades in from its centre
      const [x, y] = pa < pb ? [pa, pb] : [pb, pa]
      expect(prevPairs.has(`${x}-${y}`)).toBe(true)
    }
  })
})

describe('cost at 20 000 nodes / 40 000 links', () => {
  // Measured alone (Node 22, M-series, loaded machine): build 43–71 ms, cut 8–20 ms.
  // The full suite runs files in parallel on a shared CPU (measured up to 380 ms
  // for the same build), so the assertion is a ceiling that only an O(N²)
  // regression crosses — a quadratic build at 20 000 nodes takes seconds.
  it('builds the tree and cuts it without a gross slowdown at 20 000 nodes (best of 3)', () => {
    const g = synth(20000, 40000, 300)
    const v = view(g.centres[0][0], g.centres[0][1], g.centres[0][2] + 600)
    const budget = { maxNodes: 4000, maxLinks: 12000 }
    let build = Infinity
    let cutMs = Infinity
    let tree = buildClusterTree(g.nodes, g.links)
    let cut = cutForView(tree, v, budget)
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now()
      tree = buildClusterTree(g.nodes, g.links)
      const t1 = performance.now()
      cut = cutForView(tree, v, budget)
      const t2 = performance.now()
      build = Math.min(build, t1 - t0)
      cutMs = Math.min(cutMs, t2 - t1)
    }
    // GROSS bounds only. A wall-clock ceiling of 600/200 ms failed under a
    // loaded machine (load 18) with nothing wrong in the code, and a growth
    // ratio 5k → 20k does not discriminate either (measured 6.2–6.7 normal,
    // 5.2 with an injected quadratic loop: the build is too fast at these
    // sizes). Fine performance regressions belong to the browser bench
    // (scripts/graph-perf.mjs); this only catches a build or a cut that takes
    // SECONDS (measured: build 43–47 ms, cut 8–20 ms).
    console.info(`clusterTree 20k/40k: build ${build.toFixed(1)} ms, cut ${cutMs.toFixed(1)} ms, ` +
      `tree ${tree.nodes.length} nodes, frontier ${cut.frontier.length}, links ${cut.links.length}`)
    expect(build).toBeLessThan(3000)
    expect(cutMs).toBeLessThan(2000)
    expect(accounted(tree, cut)).toBe(40000 - tree.skippedLinks)
  })
})

describe('cutForView — a group opens only when its children can be told apart', () => {
  // 64 files in one community, spread over a ball of radius 100.
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const nodes: Graph3DNode[] = Array.from({ length: 64 }, (_, i) => ({
    id: `f${i}`, label: `f${i}`, entityType: 'file', layer: 'code',
    x: (rnd() - 0.5) * 140, y: (rnd() - 0.5) * 140, z: (rnd() - 0.5) * 140,
    communityId: 1, groupKey: 'c1', data: {},
  }))
  const tree = buildClusterTree(nodes, [])
  const community = tree.nodes.find((t) => t.kind === 'community')!
  const at = (px: number) => {
    // distance at which the community's radius projects to `px` (fov 45°, 900 px)
    const d = (community.radius * 450) / (px * Math.tan((22.5 * Math.PI) / 180))
    return cutForView(tree, view(community.x, community.y, community.z + d), BIG)
  }

  it('stays one group at 40 px: 64 children would sit ~5 px apart', () => {
    expect(at(40).frontier).toContain(community.index)
  })

  it('opens once its children are ~12 px apart', () => {
    expect(at(12 * Math.sqrt(community.children.length) * 1.1).open.has(community.index)).toBe(true)
  })
})

describe('cutForView — a finger needs more room than a pointer', () => {
  let seed = 13
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const nodes: Graph3DNode[] = Array.from({ length: 64 }, (_, i) => ({
    id: `p${i}`, label: '', entityType: 'file', layer: 'code',
    x: (rnd() - 0.5) * 140, y: (rnd() - 0.5) * 140, z: (rnd() - 0.5) * 140,
    communityId: 2, groupKey: 'c2', data: {},
  }))
  const tree = buildClusterTree(nodes, [])
  const c = tree.nodes.find((t) => t.kind === 'community')!
  // seen at a size where children sit ~14 px apart: a pointer opens, a finger waits
  const px = 14 * Math.sqrt(c.children.length)
  const d = (c.radius * 450) / (px * Math.tan((22.5 * Math.PI) / 180))
  const v = view(c.x, c.y, c.z + d)

  it('opens for a pointer (12 px between children)', () => {
    expect(cutForView(tree, v, BIG).open.has(c.index)).toBe(true)
  })
  it('stays closed for a finger (18 px between children)', () => {
    expect(cutForView(tree, v, { ...BIG, childSpacingPx: 18 }).open.has(c.index)).toBe(false)
  })
})

describe('cutForView — foveated: the detail goes where the camera looks', () => {
  // two identical communities of 64 files: A at (0,0,-1000), B at (0,0,+1000)
  let seed = 17
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const ball = (c: number, z0: number, x0 = 0): Graph3DNode[] => Array.from({ length: 64 }, (_, i) => ({
    id: `b${c}-${i}`, label: '', entityType: 'file', layer: 'code',
    x: x0 + (rnd() - 0.5) * 140, y: (rnd() - 0.5) * 140, z: z0 + (rnd() - 0.5) * 140,
    communityId: c, groupKey: `c${c}`, data: {},
  }))
  const look = (fx: number, fy: number, fz: number): CutView => ({
    position: [0, 0, 0], fovDeg: 45, viewportHeightPx: 900, forward: [fx, fy, fz], aspect: 16 / 9,
  })

  it('what is behind the camera never opens', () => {
    const nodes = [...ball(1, -400), ...ball(2, 400)]
    const tree = buildClusterTree(nodes, [])
    const a = tree.nodes.find((t) => t.kind === 'community' && t.id.endsWith('c1'))!
    const b = tree.nodes.find((t) => t.kind === 'community' && t.id.endsWith('c2'))!
    const cut = cutForView(tree, look(0, 0, -1), BIG)
    expect(cut.open.has(a.index)).toBe(true) // in front
    expect(cut.open.has(b.index)).toBe(false) // behind
  })

  it('the centre of the screen opens earlier than its edge', () => {
    // same distance, one on the line of sight, one near the edge of the view
    const nodes = [...ball(3, -1800, 0), ...ball(4, -1800, 1200)] // the second ~34° off the line of sight
    const tree = buildClusterTree(nodes, [])
    const centre = tree.nodes.find((t) => t.kind === 'community' && t.id.endsWith('c3'))!
    const edge = tree.nodes.find((t) => t.kind === 'community' && t.id.endsWith('c4'))!
    const cut = cutForView(tree, look(0, 0, -1), BIG)
    expect(cut.open.has(centre.index)).toBe(true)
    expect(cut.open.has(edge.index)).toBe(false)
  })

  it('a tight budget is spent in front, not behind', () => {
    const nodes = [...ball(5, -300), ...ball(6, 300)]
    const tree = buildClusterTree(nodes, [])
    const front = tree.nodes.find((t) => t.kind === 'community' && t.id.endsWith('c5'))!
    const cut = cutForView(tree, look(0, 0, -1), { maxNodes: 70, maxLinks: 1e9 })
    expect(cut.open.has(front.index)).toBe(true)
  })
})

describe('cutForView — what the audit measured on a big graph (20 000 nodes, 250 communities)', () => {
  const { nodes, links } = synth(20000, 40000, 250, 31)
  const tree = buildClusterTree(nodes, links)
  const PHONE = { maxNodes: 1500, maxLinks: 3000, childSpacingPx: 18 }
  const look = (from: [number, number, number], at: [number, number, number]): CutView => {
    const d = [at[0] - from[0], at[1] - from[1], at[2] - from[2]]
    const l = Math.hypot(d[0], d[1], d[2]) || 1
    return { position: from, fovDeg: 45, viewportHeightPx: 844, forward: [d[0] / l, d[1] / l, d[2] / l], aspect: 390 / 844 }
  }

  it('no layer or region holds more than MAX_CHILDREN children', () => {
    // a literal, not the constant: retuning MAX_CHILDREN up must show here
    for (const t of tree.nodes) if (t.kind === 'layer' || t.kind === 'region') expect(t.children.length).toBeLessThanOrEqual(16)
    expect(MAX_CHILDREN).toBeLessThanOrEqual(16)
  })

  it('zooming into the biggest community on a phone reaches its real nodes (it reached none)', () => {
    // the audit's own graph: power-law community sizes, 300 communities
    let seed = 5
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const C = 300, N = 20000
    const cs = Array.from({ length: C }, () => [(rnd() - 0.5) * 4000, (rnd() - 0.5) * 4000, (rnd() - 0.5) * 4000])
    const wts = Array.from({ length: C }, (_, i) => 1 / (i + 1))
    const W = wts.reduce((x, y) => x + y, 0)
    const ns: Graph3DNode[] = Array.from({ length: N }, (_, i) => {
      let r = rnd() * W, c = 0
      while (r > wts[c] && c < C - 1) { r -= wts[c]; c++ }
      const spread = 100 * Math.cbrt((wts[c] * N) / W / 10)
      return { id: `n${i}`, label: '', entityType: 'file', layer: c % 4 === 0 ? 'knowledge' : 'code',
        x: cs[c][0] + (rnd() - 0.5) * spread, y: cs[c][1] + (rnd() - 0.5) * spread, z: cs[c][2] + (rnd() - 0.5) * spread,
        communityId: c, groupKey: `c${c}`, data: {} }
    })
    const byC = new Map<number, number[]>()
    ns.forEach((nd, i) => { const l = byC.get(nd.communityId!) ?? []; l.push(i); byC.set(nd.communityId!, l) })
    const ls: Graph3DLink[] = Array.from({ length: 40000 }, () => {
      const a = Math.floor(rnd() * N)
      const same = byC.get(ns[a].communityId!)!
      const b = rnd() < 0.7 ? same[Math.floor(rnd() * same.length)] : Math.floor(rnd() * N)
      return { source: `n${a}`, target: `n${b}`, relationType: 'IMPORTS', layer: 'code', color: '#fff', width: 1, particles: 0, particleSpeed: 0, isInterCommunity: false }
    })
    const t = buildClusterTree(ns, ls)
    const c0 = cs[0] as [number, number, number]
    let best = 0
    for (const d of [10, 30, 60, 120, 240]) {
      const cut = cutForView(t, look([c0[0], c0[1], c0[2] + d], c0), PHONE)
      best = Math.max(best, cut.frontier.filter((i) => t.nodes[i].kind === 'leaf').length)
    }
    // measured: 805 to 1 341 now; 198 to 346 while the LINK budget still gated opening
    expect(best).toBeGreaterThan(600)
  })

  it('orbiting keeps what is shown: new regions coming into view open, almost nothing closes', () => {
    // Measured before the sticky cut: Jaccard down to 0.53 per 10° step, the
    // whole link layer rebuilt each time. What may change now is mostly
    // ADDITIONS (what enters the view); what was shown stays (removals ≤ 3 %).
    const r = 4000
    let prev: ReturnType<typeof cutForView> | undefined
    for (let k = 0; k <= 9; k++) {
      const a = (k * 10 * Math.PI) / 180
      const cut = cutForView(tree, look([Math.sin(a) * r, 0, Math.cos(a) * r], [0, 0, 0]), { maxNodes: 5000, maxLinks: 9000 }, prev)
      if (prev) {
        const now = new Set(cut.frontier)
        const removed = prev.frontier.filter((x) => !now.has(x)).length
        expect(removed / prev.frontier.length).toBeLessThanOrEqual(0.03)
      }
      prev = cut
    }
  })

  it('the selected node stays drawn as itself, even far from the view', () => {
    const leaf = tree.leafOf[12345]
    const cut = cutForView(tree, look([0, 0, 9000], [0, 0, 0]), { ...PHONE, keepVisible: [leaf] })
    expect(cut.frontier).toContain(leaf)
  })
})

describe('cutForView — a pinch on a phone opens what is in front, not what is beside', () => {
  // Measured on the real graph (2 851 files, phone 390×844, 04/11/2026): while
  // zooming in, the out-of-view leaves kept by the sticky rule grew from 220 to
  // 854 and took the whole node budget; in front, a 418 px group stayed closed.
  // Near the camera, the groups to the SIDE (a portrait view is 22° wide) are as
  // close — as big — as the one looked at.
  // A DENSE graph, as the layout produces it: 250 communities packed in a
  // 1 200 cube, so each has neighbours a few radii away (synth() spreads them
  // over 4 000, where nothing is beside anything and this never shows).
  const { nodes: sparse, links, centres: far } = synth(20000, 40000, 250, 31)
  const K = 1200 / 4000
  const centres = far.map((c) => c.map((x) => x * K))
  const nodes = sparse.map((n, i) => {
    const c = far[i % 250]
    return { ...n, x: c[0] * K + (n.x - c[0]), y: c[1] * K + (n.y - c[1]), z: c[2] * K + (n.z - c[2]) }
  })
  const tree = buildClusterTree(nodes, links)
  const PHONE = { maxNodes: 1500, maxLinks: 3000, childSpacingPx: 24 }
  const ASPECT = 390 / 844
  const look = (from: number[], at: number[]): CutView => {
    const d = [at[0] - from[0], at[1] - from[1], at[2] - from[2]]
    const l = Math.hypot(d[0], d[1], d[2]) || 1
    const f = [d[0] / l, d[1] / l, d[2] / l]
    // the screen up, as the page passes it: world +Y made orthogonal to forward
    const u = [-f[1] * f[0], 1 - f[1] * f[1], -f[1] * f[2]]
    const ul = Math.hypot(u[0], u[1], u[2]) || 1
    return {
      position: from as [number, number, number], fovDeg: 45, viewportHeightPx: 844, aspect: ASPECT,
      forward: f as [number, number, number], up: [u[0] / ul, u[1] / ul, u[2] / ul],
    }
  }
  const inCone = (t: { x: number; y: number; z: number }, v: CutView, deg: number) => {
    const d = [t.x - v.position[0], t.y - v.position[1], t.z - v.position[2]]
    const l = Math.hypot(d[0], d[1], d[2]) || 1
    return (d[0] * v.forward![0] + d[1] * v.forward![1] + d[2] * v.forward![2]) / l > Math.cos((deg * Math.PI) / 180)
  }
  /**
   * Closed groups surely on screen (within 10° of the line of sight) whose
   * children are already far enough apart to be told apart: each WANTS to open
   * (its own threshold, without the centre bonus) and was refused.
   */
  const starvedInFront = (cut: ReturnType<typeof cutForView>, v: CutView) =>
    cut.frontier.filter((i) => {
      const t = tree.nodes[i]
      if (t.kind === 'leaf' || !inCone(t, v, 10)) return false
      const l = Math.hypot(t.x - v.position[0], t.y - v.position[1], t.z - v.position[2])
      return projectedRadiusPx(t.radius, l, 45, 844) >= openThresholdPx(DEFAULT_OPEN_PX, t.children.length, PHONE.childSpacingPx)
    }).length
  /** Real nodes drawn outside a 30° cone: budget spent where nobody looks. */
  const leavesAside = (cut: ReturnType<typeof cutForView>, v: CutView) =>
    cut.frontier.filter((i) => tree.nodes[i].kind === 'leaf' && !inCone(tree.nodes[i], v, 30)).length

  it('every step of the pinch carries the previous cut, as the page does — and the front still opens', () => {
    const target = centres[7]
    let prev: ReturnType<typeof cutForView> | undefined
    let cut!: ReturnType<typeof cutForView>
    let v!: CutView
    let starved = 0
    for (const d of [6000, 3500, 2000, 1200, 700, 400, 250, 150]) {
      v = look([target[0] + d * 0.3, target[1] + d * 0.2, target[2] + d], target)
      cut = cutForView(tree, v, PHONE, prev)
      starved += starvedInFront(cut, v)
      prev = cut
    }
    // Measured on this pinch (sum over the 8 steps / real nodes aside at the end):
    // before 53 / 238; out of view served last 23 / 221; + the view rectangle 5 / 140.
    expect(starved).toBeLessThan(10)
    expect(leavesAside(cut, v)).toBeLessThan(180)
  })
})

describe('focusWeightRect — the view is a rectangle, not a cone', () => {
  // portrait phone: 45° vertical, aspect 390/844 → ±10.9° across, ±22.5° up and down
  const V = (22.5 * Math.PI) / 180
  const H = Math.atan(Math.tan(V) * (390 / 844))
  const F: [number, number, number] = [0, 0, -1]
  const U: [number, number, number] = [0, 1, 0]
  const at = (deg: number, axis: 'x' | 'y') => {
    const a = (deg * Math.PI) / 180
    return axis === 'x' ? [Math.sin(a) * 1000, 0, -Math.cos(a) * 1000] : [0, Math.sin(a) * 1000, -Math.cos(a) * 1000]
  }
  it('15° to the side is off a portrait screen; 15° up is on it', () => {
    const [sx, sy, sz] = at(15, 'x')
    const [ux, uy, uz] = at(15, 'y')
    expect(focusWeightRect(sx, sy, sz, 1, F, U, V, H)).toBe(0)
    expect(focusWeightRect(ux, uy, uz, 1, F, U, V, H)).toBeGreaterThan(1)
  })
  it('the line of sight weighs the most, behind weighs nothing', () => {
    expect(focusWeightRect(0, 0, -1000, 1, F, U, V, H)).toBeCloseTo(1 + FOCUS_GAIN, 9)
    expect(focusWeightRect(0, 0, 1000, 1, F, U, V, H)).toBe(0)
  })
})

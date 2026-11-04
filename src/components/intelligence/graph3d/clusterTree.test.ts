import { describe, it, expect } from 'vitest'
import {
  CUT_HYSTERESIS,
  DEFAULT_OPEN_PX,
  buildClusterTree,
  cutForView,
  cutTransition,
  membersOf,
  projectedRadiusPx,
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
    expect(tight.links.length).toBeLessThanOrEqual(budget.maxLinks)
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
  it('builds the tree and cuts it fast enough at 20 000 nodes (best of 3)', () => {
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
    console.info(`clusterTree 20k/40k: build ${build.toFixed(1)} ms, cut ${cutMs.toFixed(1)} ms, ` +
      `tree ${tree.nodes.length} nodes, frontier ${cut.frontier.length}, links ${cut.links.length}`)
    expect(build).toBeLessThan(600)
    expect(cutMs).toBeLessThan(200)
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
